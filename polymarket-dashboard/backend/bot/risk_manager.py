"""
Risk Manager
============
Guards every trade against risk limits before execution:
  - Daily drawdown limit
  - Max concurrent positions
  - Max single position size
  - Minimum liquidity check
  - Bankroll management

Implements the Kelly Criterion with fractional Kelly for position sizing.
"""

from __future__ import annotations
import time
import logging
from dataclasses import dataclass, field
from typing import Optional
from bot.mispricing_detector import MispricingOpportunity

logger = logging.getLogger(__name__)


@dataclass
class RiskCheckResult:
    approved: bool
    reason: str
    adjusted_size: float = 0.0
    risk_score: float = 0.0  # 0=safe, 1=max risk


@dataclass
class Position:
    market_id: str
    size: float
    entry_price: float
    direction: str
    opened_at: float = field(default_factory=time.time)
    unrealized_pnl: float = 0.0


class RiskManager:
    """
    Central risk gate. Every opportunity passes through here before any
    order is placed.
    """

    def __init__(
        self,
        starting_bankroll: float = 10_000.0,
        max_daily_drawdown_pct: float = 0.05,  # 5%
        max_position_pct: float = 0.05,         # 5% per trade
        max_concurrent_positions: int = 10,
        min_market_liquidity: float = 2_000.0,
        kelly_fraction: float = 0.25,
    ):
        self.starting_bankroll = starting_bankroll
        self.current_bankroll = starting_bankroll
        self.max_daily_drawdown_pct = max_daily_drawdown_pct
        self.max_position_pct = max_position_pct
        self.max_concurrent_positions = max_concurrent_positions
        self.min_market_liquidity = min_market_liquidity
        self.kelly_fraction = kelly_fraction

        self._open_positions: dict[str, Position] = {}
        self._daily_pnl: float = 0.0
        self._day_start: float = time.time()
        self._trade_count: int = 0
        self._peak_bankroll: float = starting_bankroll
        self._max_drawdown_seen: float = 0.0

    # ── Main gate ─────────────────────────────────────────────────────────────

    def check(self, opp: MispricingOpportunity, available_liquidity: float = 1e9) -> RiskCheckResult:
        """Run all risk checks and return approval + adjusted size."""

        # 1. Daily drawdown limit
        daily_loss = -self._daily_pnl if self._daily_pnl < 0 else 0
        daily_loss_pct = daily_loss / max(self.starting_bankroll, 1)
        if daily_loss_pct >= self.max_daily_drawdown_pct:
            return RiskCheckResult(
                approved=False,
                reason=f"Daily drawdown limit hit: -{daily_loss_pct:.1%} ≥ {self.max_daily_drawdown_pct:.1%}",
                risk_score=1.0,
            )

        # 2. Max concurrent positions
        if len(self._open_positions) >= self.max_concurrent_positions:
            return RiskCheckResult(
                approved=False,
                reason=f"Max concurrent positions ({self.max_concurrent_positions}) reached",
                risk_score=0.9,
            )

        # 3. Minimum market liquidity
        if available_liquidity < self.min_market_liquidity:
            return RiskCheckResult(
                approved=False,
                reason=f"Market liquidity ${available_liquidity:,.0f} < minimum ${self.min_market_liquidity:,.0f}",
                risk_score=0.5,
            )

        # 4. Duplicate market
        if opp.market_id in self._open_positions:
            return RiskCheckResult(
                approved=False,
                reason="Already have open position in this market",
                risk_score=0.4,
            )

        # 5. Minimum edge threshold
        if opp.misprice_pct < 0.01:
            return RiskCheckResult(
                approved=False,
                reason=f"Edge {opp.misprice_pct:.2%} below minimum",
                risk_score=0.2,
            )

        # 6. Size the position
        max_size = self.current_bankroll * self.max_position_pct
        kelly_size = self._kelly_size(opp)
        adjusted_size = min(opp.recommended_size, max_size, kelly_size)
        adjusted_size = max(10.0, adjusted_size)  # floor at $10

        # 7. Bankroll sufficiency
        if adjusted_size > self.current_bankroll * 0.8:
            return RiskCheckResult(
                approved=False,
                reason="Insufficient bankroll",
                risk_score=0.95,
            )

        risk_score = self._compute_risk_score(opp, adjusted_size)

        return RiskCheckResult(
            approved=True,
            reason="All checks passed",
            adjusted_size=adjusted_size,
            risk_score=risk_score,
        )

    # ── Position lifecycle ────────────────────────────────────────────────────

    def open_position(self, opp: MispricingOpportunity, size: float):
        pos = Position(
            market_id=opp.market_id,
            size=size,
            entry_price=opp.entry_price,
            direction=opp.direction,
        )
        self._open_positions[opp.market_id] = pos
        self.current_bankroll -= size
        self._trade_count += 1
        logger.info(f"Opened position: {opp.market_label} size=${size:.2f}")

    def close_position(self, market_id: str, exit_price: float) -> float:
        """Returns realized PnL."""
        pos = self._open_positions.pop(market_id, None)
        if pos is None:
            return 0.0

        if pos.direction == "BUY_YES":
            pnl = pos.size * (exit_price / pos.entry_price - 1.0)
        else:
            pnl = pos.size * ((1 - exit_price) / pos.entry_price - 1.0)

        self.current_bankroll += pos.size + pnl
        self._daily_pnl += pnl

        # Update peak and max drawdown
        if self.current_bankroll > self._peak_bankroll:
            self._peak_bankroll = self.current_bankroll
        dd = (self._peak_bankroll - self.current_bankroll) / self._peak_bankroll
        self._max_drawdown_seen = max(self._max_drawdown_seen, dd)

        logger.info(f"Closed position {market_id}: PnL=${pnl:.2f}")
        return pnl

    def reset_daily_pnl(self):
        self._daily_pnl = 0.0
        self._day_start = time.time()

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def open_position_count(self) -> int:
        return len(self._open_positions)

    @property
    def daily_pnl(self) -> float:
        return self._daily_pnl

    @property
    def max_drawdown(self) -> float:
        return self._max_drawdown_seen

    @property
    def liq_risk(self) -> str:
        dd_pct = abs(self._daily_pnl) / max(self.starting_bankroll, 1)
        if dd_pct < 0.01:
            return "LOW"
        if dd_pct < 0.03:
            return "MEDIUM"
        if dd_pct < self.max_daily_drawdown_pct:
            return "HIGH"
        return "CRITICAL"

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _kelly_size(self, opp: MispricingOpportunity) -> float:
        """Full Kelly × fraction × bankroll."""
        p = opp.fair_value if "YES" in opp.direction else 1 - opp.fair_value
        b = (1.0 / max(opp.entry_price, 0.01)) - 1.0
        q = 1 - p
        kelly_full = (p * b - q) / max(b, 1e-6)
        return max(0, kelly_full * self.kelly_fraction * self.current_bankroll)

    def _compute_risk_score(self, opp: MispricingOpportunity, size: float) -> float:
        """0 = very safe, 1 = maximum risk."""
        bankroll_usage = size / max(self.current_bankroll, 1)
        concentration = len(self._open_positions) / self.max_concurrent_positions
        drawdown = abs(self._daily_pnl) / max(self.starting_bankroll * self.max_daily_drawdown_pct, 1)
        return float(min(1.0, 0.4 * bankroll_usage + 0.3 * concentration + 0.3 * drawdown))
