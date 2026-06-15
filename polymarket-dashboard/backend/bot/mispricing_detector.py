"""
Mispricing Detection Engine
============================
Core alpha-generation logic. Identifies binary markets where our fair value
estimate deviates significantly from the quoted market price.

Strategy:
  - Scan target markets every ~2 seconds
  - Estimate fair value for each using FairValueEngine
  - Flag opportunities where |fair_value - market_price| > MIN_EDGE_PCT
    AND edge_confidence > MIN_CONFIDENCE
  - Rank by expected value (EV = edge_percent × confidence)
  - Return top opportunity for execution
"""

from __future__ import annotations
import asyncio
import logging
import time
import math
import random

logger = logging.getLogger(__name__)
import numpy as np
from dataclasses import dataclass
from typing import Optional

from bot.fair_value import FairValueEngine, FairValueEstimate, MarketContext


@dataclass
class MispricingOpportunity:
    """A detected trading opportunity."""
    market_id: str
    market_label: str
    direction: str                  # "BUY_YES" or "BUY_NO"
    entry_price: float              # price to buy at (best ask for YES, or 1-best_bid for NO)
    fair_value: float               # our estimated true probability
    misprice_pct: float             # |fair_value - entry_price| / entry_price
    edge_confidence: float          # 0..1
    expected_value: float           # EV = misprice_pct × confidence
    order_flow_imbalance: float     # 0..1
    recommended_size: float         # USDC
    time_to_expiry_hours: float
    signals: dict[str, float]
    timestamp: float = 0.0

    def __post_init__(self):
        self.timestamp = time.time()


class MispricingDetector:
    """
    Scans markets and surfaces mispricing opportunities.

    In SIMULATION mode: generates synthetic opportunities based on current
    BTC price and randomized market states.

    In LIVE mode: calls Polymarket API to fetch real order books and
    runs the same logic on real data.
    """

    def __init__(
        self,
        fair_value_engine: FairValueEngine,
        min_edge_pct: float = 0.02,
        min_confidence: float = 0.60,
        max_bankroll: float = 10_000.0,
        kelly_fraction: float = 0.25,
        min_market_liquidity: float = 2_000.0,
    ):
        self.fv_engine = fair_value_engine
        self.min_edge_pct = min_edge_pct
        self.min_confidence = min_confidence
        self.max_bankroll = max_bankroll
        self.kelly_fraction = kelly_fraction
        self.min_market_liquidity = min_market_liquidity
        self._scan_count = 0

    # ── Main scanning entry point ─────────────────────────────────────────────

    async def scan(
        self,
        btc_price: float,
        mode: str = "SIMULATION",
        polymarket_client=None,
    ) -> list[MispricingOpportunity]:
        """
        Scan markets. Returns list of opportunities sorted by EV descending.
        """
        self._scan_count += 1

        if mode == "SIMULATION":
            return await self._scan_simulation(btc_price)
        else:
            return await self._scan_live(btc_price, polymarket_client)

    # ── Simulation scanning ───────────────────────────────────────────────────

    async def _scan_simulation(self, btc_price: float) -> list[MispricingOpportunity]:
        """Generate synthetic mispricings for realistic simulation."""
        await asyncio.sleep(0.05)  # simulate API latency

        opportunities = []
        num_markets = random.randint(20, 55)

        for i in range(num_markets):
            # Generate a synthetic market
            threshold = round(btc_price * (1 + random.uniform(-0.08, 0.08)) / 500) * 500
            direction = "UP" if random.random() > 0.5 else "DOWN"
            label = f"BTC/USD {'>' if direction == 'UP' else '<'} ${threshold:,}"

            # Current market mid price (noisy around "true" probability)
            true_prob = self._true_probability(btc_price, threshold, direction)
            noise = random.gauss(0, 0.03)
            mid_price = float(np.clip(true_prob + noise, 0.03, 0.97))

            # Simulate order book
            spread = random.uniform(0.01, 0.06)
            best_ask = min(0.97, mid_price + spread / 2)
            best_bid = max(0.03, mid_price - spread / 2)
            bid_vol = random.uniform(200, 8000)
            ask_vol = random.uniform(200, 8000)

            ctx = FairValueEngine.simulate_market_context(btc_price, mid_price)
            estimate = self.fv_engine.estimate(ctx)

            # Check if this is a mispricing opportunity
            # We buy YES if fair_value >> ask (market too cheap for YES)
            buy_yes_edge = estimate.fair_value - best_ask
            buy_no_edge = (1 - estimate.fair_value) - (1 - best_bid)

            best_edge_pct = 0.0
            trade_direction = "BUY_YES"
            entry_price = best_ask

            if buy_yes_edge > buy_no_edge:
                best_edge_pct = buy_yes_edge
                trade_direction = "BUY_YES"
                entry_price = best_ask
            else:
                best_edge_pct = buy_no_edge
                trade_direction = "BUY_NO"
                entry_price = 1 - best_bid

            if best_edge_pct < self.min_edge_pct:
                continue
            if estimate.confidence < self.min_confidence:
                continue

            # Kelly criterion position sizing
            # For binary market: f* = (p × b - q) / b where b = (1/entry - 1), p = fair_value
            p = estimate.fair_value if trade_direction == "BUY_YES" else 1 - estimate.fair_value
            b = (1.0 / entry_price) - 1.0  # net odds
            q = 1 - p
            kelly_full = (p * b - q) / max(b, 1e-6)
            kelly_sized = max(0, kelly_full * self.kelly_fraction)
            size = min(kelly_sized * self.max_bankroll, self.max_bankroll * 0.05)
            size = max(10.0, size)  # min $10

            ev = best_edge_pct * estimate.confidence

            opportunities.append(MispricingOpportunity(
                market_id=f"sim-{i:04d}",
                market_label=label,
                direction=trade_direction,
                entry_price=entry_price,
                fair_value=estimate.fair_value,
                misprice_pct=best_edge_pct,
                edge_confidence=estimate.confidence,
                expected_value=ev,
                order_flow_imbalance=ctx.order_book.bid_volume / (ctx.order_book.bid_volume + ctx.order_book.ask_volume),
                recommended_size=size,
                time_to_expiry_hours=random.uniform(0.5, 8.0),
                signals=estimate.signals,
            ))

        # Sort by EV descending
        return sorted(opportunities, key=lambda o: o.expected_value, reverse=True)

    # ── Live scanning (Polymarket API) ─────────────────────────────────────────

    async def _scan_live(
        self, btc_price: float, client
    ) -> list[MispricingOpportunity]:
        """
        Real Polymarket API scanning.

        client must be PolymarketReadClient (no credentials needed for scanning)
        or PolymarketTradingClient (for order placement).
        """
        if client is None:
            return []

        try:
            markets = await client.get_markets(keyword="bitcoin", active=True, limit=50)
        except Exception as e:
            logger.error(f"Market fetch failed: {e}")
            return []

        opportunities = []
        for market in markets:
            try:
                # get_full_snapshot fetches order book + recent trades in one call
                snap = await client.get_full_snapshot(market)
                if snap is None:
                    continue

                # Skip illiquid markets
                if snap["total_liquidity"] < self.min_market_liquidity:
                    continue

                ctx = self._build_context_from_snapshot(snap, btc_price)
                estimate = self.fv_engine.estimate(ctx)

                best_ask = snap["best_ask"]
                best_bid = snap["best_bid"]

                # Check both sides: buy YES or buy NO
                yes_edge = estimate.fair_value - best_ask
                no_edge  = (1 - estimate.fair_value) - (1 - best_bid)

                if yes_edge >= no_edge and yes_edge >= self.min_edge_pct:
                    direction = "BUY_YES"
                    entry     = best_ask
                    edge      = yes_edge
                elif no_edge > yes_edge and no_edge >= self.min_edge_pct:
                    direction = "BUY_NO"
                    entry     = 1 - best_bid
                    edge      = no_edge
                else:
                    continue

                if estimate.confidence < self.min_confidence:
                    continue

                ev = edge * estimate.confidence
                p  = estimate.fair_value if direction == "BUY_YES" else 1 - estimate.fair_value
                b  = (1.0 / max(entry, 0.01)) - 1.0
                kelly_full = (p * b - (1 - p)) / max(b, 1e-6)
                size = max(10.0, kelly_full * self.kelly_fraction * self.max_bankroll)

                # Parse time to expiry
                import dateutil.parser
                try:
                    end = dateutil.parser.parse(snap["end_date"])
                    from datetime import datetime, timezone
                    hours_left = (end.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).total_seconds() / 3600
                except Exception:
                    hours_left = 4.0

                opportunities.append(MispricingOpportunity(
                    market_id=snap["condition_id"],
                    market_label=snap["question"][:60],
                    direction=direction,
                    entry_price=entry,
                    fair_value=estimate.fair_value,
                    misprice_pct=edge,
                    edge_confidence=estimate.confidence,
                    expected_value=ev,
                    order_flow_imbalance=snap["bid_volume"] / max(snap["total_liquidity"], 1),
                    recommended_size=size,
                    time_to_expiry_hours=max(0.1, hours_left),
                    signals=estimate.signals,
                ))
            except Exception as e:
                logger.debug(f"Market scan error: {e}")
                continue

        return sorted(opportunities, key=lambda o: o.expected_value, reverse=True)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _true_probability(btc: float, threshold: float, direction: str) -> float:
        """Rough true probability estimate using normal distribution model."""
        daily_vol = 0.025  # 2.5% daily vol for BTC
        hours = 4.0
        vol_over_horizon = daily_vol * math.sqrt(hours / 24)
        z = (threshold - btc) / (btc * vol_over_horizon)
        # Normal CDF approximation
        def norm_cdf(x: float) -> float:
            return 0.5 * (1 + math.erf(x / math.sqrt(2)))
        p_above = 1 - norm_cdf(z)
        return p_above if direction == "UP" else 1 - p_above

    @staticmethod
    def _build_context_from_snapshot(snap: dict, btc_price: float) -> "MarketContext":
        """Build MarketContext from a PolymarketReadClient.get_full_snapshot() result."""
        from bot.fair_value import OrderBookSnapshot, RecentTrade

        ob = OrderBookSnapshot(
            best_bid=snap["best_bid"],
            best_ask=snap["best_ask"],
            bid_volume=snap["bid_volume"],
            ask_volume=snap["ask_volume"],
            mid_price=snap["mid_price"],
            spread=snap["spread"],
        )

        # Parse recent trades from API response
        recent_trades = []
        for t in snap.get("recent_trades", []):
            try:
                recent_trades.append(RecentTrade(
                    price=float(t.get("price", snap["mid_price"])),
                    size=float(t.get("size", 0)),
                    is_buy=t.get("side", "").upper() == "BUY",
                    timestamp=float(t.get("timestamp", time.time())),
                ))
            except Exception:
                continue

        # Detect if this is a BTC threshold market
        question = snap.get("question", "").upper()
        is_btc_level = "BTC" in question and ("$" in question or "USD" in question)
        direction = "UP" if "ABOVE" in question or "HIGHER" in question or ">" in question else "DOWN"

        # Try to parse threshold from question e.g. "Will BTC be above $65,000?"
        threshold = None
        if is_btc_level:
            import re
            matches = re.findall(r'\$[\d,]+', question)
            if matches:
                try:
                    threshold = float(matches[0].replace("$", "").replace(",", ""))
                except ValueError:
                    pass

        return MarketContext(
            order_book=ob,
            recent_trades=recent_trades,
            btc_price_now=btc_price,
            btc_price_5m_ago=btc_price,  # TODO: feed real 5m-ago price
            time_to_expiry_hours=4.0,    # Will be overridden from snap
            market_type="BTC_LEVEL" if is_btc_level else "GENERIC",
            threshold=threshold,
            direction=direction,
            prior_resolution_rate=snap["mid_price"],
        )

    @property
    def scan_count(self) -> int:
        return self._scan_count
