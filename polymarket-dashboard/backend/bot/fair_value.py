"""
Fair Value Estimation Engine
============================
Estimates the "true" probability that a Polymarket binary market resolves YES.

Signal sources (each returns 0..1):
  1. Order book imbalance       – if bids >> asks, market is underpriced for YES
  2. Recent trade momentum      – direction of last N fills
  3. BTC on-chain momentum      – price change % over last K minutes (for BTC markets)
  4. Resolution velocity prior  – how fast similar past markets resolved
  5. Time-decay adjustment      – binary markets approach 0/1 as expiry nears

Combined via weighted average; weights learned over time (Markov self-learning).
"""

from __future__ import annotations
import math
import time
import numpy as np
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class OrderBookSnapshot:
    best_bid: float        # best YES bid price (0..1)
    best_ask: float        # best YES ask price (0..1)
    bid_volume: float      # total USDC on bid side (top 5 levels)
    ask_volume: float      # total USDC on ask side (top 5 levels)
    mid_price: float       # (bid + ask) / 2
    spread: float          # ask - bid


@dataclass
class RecentTrade:
    price: float           # fill price (0..1)
    size: float            # USDC
    is_buy: bool           # taker bought YES
    timestamp: float       # unix seconds


@dataclass
class MarketContext:
    """All inputs needed for fair value estimation."""
    order_book: OrderBookSnapshot
    recent_trades: list[RecentTrade]       # last 20 trades
    btc_price_now: float                   # current BTC/USD spot
    btc_price_5m_ago: float                # BTC/USD 5 minutes ago
    time_to_expiry_hours: float            # how many hours until market closes
    market_type: str = "BTC_MOVE"         # "BTC_MOVE", "BTC_LEVEL", "GENERIC"
    threshold: Optional[float] = None     # e.g. 65_000 for "BTC > 65k"
    direction: str = "UP"                 # "UP" or "DOWN"
    prior_resolution_rate: float = 0.5   # base rate from similar past markets


@dataclass
class FairValueEstimate:
    fair_value: float                     # 0..1
    confidence: float                     # 0..1
    signals: dict[str, float]            # per-signal breakdown
    weights: dict[str, float]            # current weights
    misprice_vs_mid: float               # fair_value - mid_price
    misprice_vs_ask: float               # fair_value - ask
    misprice_vs_bid: float               # fair_value - bid


class FairValueEngine:
    """
    Multi-signal fair value estimator with adaptive weight learning.

    Weights start at uniform priors and are updated via a simple gradient
    signal: if the market resolves YES and our fair_value was high, the signals
    that pointed high get rewarded. This implements the "Self-Learn" component.
    """

    SIGNAL_NAMES = [
        "order_book_imbalance",
        "trade_momentum",
        "btc_momentum",
        "time_decay",
        "resolution_prior",
    ]

    def __init__(self):
        # Initial uniform weights
        self._weights = {s: 1.0 / len(self.SIGNAL_NAMES) for s in self.SIGNAL_NAMES}
        self._learning_rate = 0.05
        self._history: list[dict] = []   # (signals, weight, resolved_yes)

    # ── Public API ────────────────────────────────────────────────────────────

    def estimate(self, ctx: MarketContext) -> FairValueEstimate:
        signals = {
            "order_book_imbalance": self._order_book_signal(ctx.order_book),
            "trade_momentum": self._trade_momentum_signal(ctx.recent_trades),
            "btc_momentum": self._btc_momentum_signal(ctx),
            "time_decay": self._time_decay_signal(ctx.time_to_expiry_hours, ctx.prior_resolution_rate),
            "resolution_prior": ctx.prior_resolution_rate,
        }

        # Weighted sum
        fair_value = sum(
            self._weights[s] * signals[s]
            for s in self.SIGNAL_NAMES
        )
        fair_value = float(np.clip(fair_value, 0.01, 0.99))

        # Confidence = 1 - std of signals (more agreement → higher confidence)
        sig_values = np.array(list(signals.values()))
        confidence = float(1.0 - np.clip(np.std(sig_values) * 2, 0, 1))
        # Boost confidence if order book is wide and liquid
        if ctx.order_book.spread < 0.02 and ctx.order_book.bid_volume > 1000:
            confidence = min(1.0, confidence + 0.05)

        mid = ctx.order_book.mid_price
        return FairValueEstimate(
            fair_value=fair_value,
            confidence=confidence,
            signals=signals,
            weights=dict(self._weights),
            misprice_vs_mid=fair_value - mid,
            misprice_vs_ask=fair_value - ctx.order_book.best_ask,
            misprice_vs_bid=fair_value - ctx.order_book.best_bid,
        )

    def feedback(self, signals: dict[str, float], resolved_yes: bool):
        """Update signal weights based on resolution outcome."""
        target = 1.0 if resolved_yes else 0.0
        for s in self.SIGNAL_NAMES:
            sig_val = signals.get(s, 0.5)
            # Reward signal if it pointed in the right direction
            error = target - sig_val
            self._weights[s] += self._learning_rate * error * sig_val
            self._weights[s] = max(0.01, self._weights[s])

        # Re-normalize weights to sum to 1
        total = sum(self._weights.values())
        self._weights = {k: v / total for k, v in self._weights.items()}

    @property
    def weights(self) -> dict[str, float]:
        return dict(self._weights)

    # ── Private signal computations ───────────────────────────────────────────

    @staticmethod
    def _order_book_signal(ob: OrderBookSnapshot) -> float:
        """
        Order book imbalance: if buy volume >> sell volume, market is probably
        underpriced for YES.

        Returns: probability-like score in [0..1]
        """
        total = ob.bid_volume + ob.ask_volume
        if total < 1e-6:
            return ob.mid_price
        imbalance = ob.bid_volume / total  # 0 = all asks, 1 = all bids
        # Blend imbalance with mid price to keep in reasonable range
        return float(np.clip(0.4 * imbalance + 0.6 * ob.mid_price, 0.01, 0.99))

    @staticmethod
    def _trade_momentum_signal(trades: list[RecentTrade], n: int = 10) -> float:
        """
        Recent trade momentum: fraction of last N USDC that were buy-side.
        High buy pressure → price likely higher than current market.
        """
        if not trades:
            return 0.5
        recent = sorted(trades, key=lambda t: t.timestamp)[-n:]
        total_size = sum(t.size for t in recent)
        if total_size < 1e-6:
            return 0.5
        buy_size = sum(t.size for t in recent if t.is_buy)
        buy_frac = buy_size / total_size
        # Sigmoid-like mapping: 0.5 buy → 0.5 signal, higher → pushes toward 1
        return float(np.clip(0.3 + 0.7 * buy_frac, 0.01, 0.99))

    @staticmethod
    def _btc_momentum_signal(ctx: MarketContext) -> float:
        """
        For BTC binary markets: use recent BTC price momentum as signal.
        Rising BTC → raises probability of "BTC UP" markets, lowers "BTC DOWN".
        """
        if ctx.market_type not in ("BTC_MOVE", "BTC_LEVEL"):
            return 0.5

        btc_change_pct = (ctx.btc_price_now - ctx.btc_price_5m_ago) / max(ctx.btc_price_5m_ago, 1)

        # Threshold-based markets
        if ctx.market_type == "BTC_LEVEL" and ctx.threshold is not None:
            # How far is current price from threshold?
            dist_pct = (ctx.btc_price_now - ctx.threshold) / ctx.threshold
            if ctx.direction == "UP":
                # Price above threshold → likely YES
                signal = 0.5 + float(np.clip(dist_pct * 8, -0.45, 0.45))
            else:
                signal = 0.5 - float(np.clip(dist_pct * 8, -0.45, 0.45))
            # Add momentum
            momentum_boost = btc_change_pct * 3 if ctx.direction == "UP" else -btc_change_pct * 3
            return float(np.clip(signal + momentum_boost, 0.05, 0.95))

        # Generic BTC move markets
        if ctx.direction == "UP":
            return float(np.clip(0.5 + btc_change_pct * 10, 0.05, 0.95))
        else:
            return float(np.clip(0.5 - btc_change_pct * 10, 0.05, 0.95))

    @staticmethod
    def _time_decay_signal(hours_to_expiry: float, prior: float) -> float:
        """
        As expiry approaches, if market hasn't moved much, it converges to
        the resolution. Very close to expiry → weight prior heavily.
        Use exponential decay: signal = prior mixed toward 0.5 based on time.
        """
        if hours_to_expiry <= 0:
            return prior
        # Close to expiry → trust prior more; far from expiry → neutral
        decay = math.exp(-hours_to_expiry / 24)  # e^(-1) at 24h
        return float(prior * decay + 0.5 * (1 - decay))

    # ── Simulation helpers ────────────────────────────────────────────────────

    @classmethod
    def simulate_market_context(
        cls,
        btc_price: float,
        mid_price: float,
        time_to_expiry_hours: float = 6.0,
    ) -> MarketContext:
        """Generate a synthetic MarketContext for simulation/testing."""
        import random
        spread = random.uniform(0.01, 0.05)
        bid = mid_price - spread / 2
        ask = mid_price + spread / 2
        bid_vol = random.uniform(500, 5000)
        ask_vol = random.uniform(500, 5000)

        recent_trades = [
            RecentTrade(
                price=mid_price + random.uniform(-0.02, 0.02),
                size=random.uniform(10, 200),
                is_buy=random.random() > 0.45,
                timestamp=time.time() - random.uniform(0, 300),
            )
            for _ in range(15)
        ]

        return MarketContext(
            order_book=OrderBookSnapshot(
                best_bid=max(0.01, bid),
                best_ask=min(0.99, ask),
                bid_volume=bid_vol,
                ask_volume=ask_vol,
                mid_price=(bid + ask) / 2,
                spread=spread,
            ),
            recent_trades=recent_trades,
            btc_price_now=btc_price,
            btc_price_5m_ago=btc_price * (1 + random.uniform(-0.005, 0.005)),
            time_to_expiry_hours=time_to_expiry_hours,
            market_type="BTC_LEVEL",
            threshold=round(btc_price / 1000) * 1000,
            direction="UP" if random.random() > 0.5 else "DOWN",
            prior_resolution_rate=mid_price,
        )
