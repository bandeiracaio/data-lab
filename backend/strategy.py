import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional

from indicators import rsi, sma

logger = logging.getLogger(__name__)

BAR_WINDOW = 150
_SIGNAL_COOLDOWN = 300  # seconds between entry signals per symbol


class MomentumStrategy:
    name = "momentum"
    label = "Momentum"
    description = "Trend-following: price > SMA20 > SMA50, RSI 50-70, volume spike"

    def __init__(self, config: dict):
        self.enabled = config.get("enabled", False)
        self.symbols: set[str] = set(config.get("symbols", []))
        self.stop_pct = config.get("stop_pct", 0.02)
        self.take_profit_pct = config.get("take_profit_pct", 0.04)
        self.kelly_fraction = config.get("kelly_fraction", 0.25)
        self.max_position_pct = config.get("max_position_pct", 0.05)

    def check_entry(self, symbol: str, bars: list[dict]) -> Optional[dict]:
        if not self.enabled or symbol not in self.symbols:
            return None
        if len(bars) < 55:
            return None

        closes = [b["close"] for b in bars]
        volumes = [b["volume"] for b in bars]

        s20_vals = sma(closes, 20)
        s50_vals = sma(closes, 50)
        rsi_vals = rsi(closes, 14)

        c = closes[-1]
        s20 = s20_vals[-1]
        s50 = s50_vals[-1]
        r14 = rsi_vals[-1]

        if None in (s20, s50, r14):
            return None

        vol_avg = sum(volumes[-21:-1]) / 20 if len(volumes) >= 21 else None

        conditions = {
            "price_above_sma20": c > s20,
            "sma20_above_sma50": s20 > s50,
            "rsi_50_70": 50.0 <= r14 <= 70.0,
            "volume_spike": vol_avg is not None and volumes[-1] > 1.5 * vol_avg,
        }

        confidence = sum(conditions.values()) / len(conditions)

        if not all(conditions.values()):
            return None

        return {
            "strategy": self.name,
            "direction": "long",
            "confidence": confidence,
            "conditions": conditions,
            "indicators": {
                "rsi": round(r14, 1),
                "sma20": round(s20, 2),
                "sma50": round(s50, 2),
                "price": round(c, 2),
            },
        }

    def check_exit(self, symbol: str, bars: list[dict], position: dict) -> Optional[dict]:
        if not self.enabled or symbol not in self.symbols:
            return None
        if len(bars) < 20:
            return None

        closes = [b["close"] for b in bars]
        s20_vals = sma(closes, 20)
        rsi_vals = rsi(closes, 14)

        c = closes[-1]
        s20 = s20_vals[-1]
        r14 = rsi_vals[-1]
        avg_entry = position.get("avg_entry", 0)

        if None in (s20, r14):
            return None

        pnl_pct = (c - avg_entry) / avg_entry * 100 if avg_entry else 0

        conditions = {
            "below_sma20": c < s20,
            "rsi_overbought": r14 > 80.0,
            "stop_hit": avg_entry > 0 and c < avg_entry * (1.0 - self.stop_pct),
            "take_profit": avg_entry > 0 and c > avg_entry * (1.0 + self.take_profit_pct),
        }

        if not any(conditions.values()):
            return None

        triggered = [k for k, v in conditions.items() if v]
        return {
            "strategy": self.name,
            "direction": "exit",
            "confidence": 1.0,
            "conditions": conditions,
            "reason": ", ".join(triggered),
            "indicators": {
                "rsi": round(r14, 1),
                "sma20": round(s20, 2),
                "pnl_pct": round(pnl_pct, 2),
            },
        }

    def kelly_qty(self, price: float, equity: float) -> int:
        if not price or not equity:
            return 0
        # Conservative: 25% Kelly fraction × max position size
        value = min(equity * self.kelly_fraction * self.max_position_pct, equity * self.max_position_pct)
        return max(int(value / price), 1)


class StrategyEngine:
    def __init__(self, strategies: list, risk, account_ref: dict):
        self.strategies = strategies
        self.risk = risk
        self.account_ref = account_ref
        self._bar_cache: dict[str, deque] = {}
        self._last_signal_time: dict[str, float] = {}
        self.last_signals: dict[str, dict] = {}

    def update_account(self, account: dict, positions: list, orders: list) -> None:
        self.account_ref["account"] = account
        self.account_ref["positions"] = positions
        self.account_ref["orders"] = orders

    def on_bar(self, bar: dict) -> list[dict]:
        sym = bar["symbol"]
        if sym not in self._bar_cache:
            self._bar_cache[sym] = deque(maxlen=BAR_WINDOW)

        cache = self._bar_cache[sym]
        if cache and cache[-1]["time"] == bar["time"]:
            cache[-1] = bar
        else:
            cache.append(bar)

        bars = list(cache)
        account = self.account_ref.get("account", {})
        positions = self.account_ref.get("positions", [])
        orders = self.account_ref.get("orders", [])
        events: list[dict] = []

        for strat in self.strategies:
            pos = next((p for p in positions if p["symbol"] == sym), None)

            if pos:
                sig = strat.check_exit(sym, bars, pos)
                if sig:
                    ok, reason = self.risk.check_exit(sym, positions, orders)
                    event = self._make_event(sym, sig)
                    event["action"] = self._execute("sell", sym, abs(pos["qty"])) if ok else f"SKIPPED: {reason}"
                    self.last_signals[strat.name] = event
                    events.append(event)
            else:
                # Entry cooldown
                if time.time() - self._last_signal_time.get(sym, 0) < _SIGNAL_COOLDOWN:
                    continue

                sig = strat.check_entry(sym, bars)
                if sig:
                    price = bars[-1]["close"]
                    qty = strat.kelly_qty(price, account.get("equity", 0))
                    ok, reason = self.risk.check_entry(sym, qty, price, account, positions, orders)
                    event = self._make_event(sym, sig)
                    if ok and qty > 0:
                        event["action"] = self._execute("buy", sym, qty)
                        self._last_signal_time[sym] = time.time()
                    else:
                        event["action"] = f"SKIPPED: {reason}"
                    self.last_signals[strat.name] = event
                    events.append(event)

        return events

    def _execute(self, side: str, symbol: str, qty: float) -> str:
        try:
            from broker import place_order
            place_order(symbol, side, qty, "market")
            return f"{side.upper()} {qty} @ market"
        except Exception as e:
            logger.error("Order failed %s %s %s: %s", side, qty, symbol, e)
            return f"ORDER FAILED: {e}"

    def _make_event(self, symbol: str, sig: dict) -> dict:
        return {
            "type": "signal",
            "symbol": symbol,
            "strategy": sig["strategy"],
            "direction": sig["direction"],
            "confidence": sig.get("confidence", 0.0),
            "conditions": sig.get("conditions", {}),
            "indicators": sig.get("indicators", {}),
            "reason": sig.get("reason", ""),
            "action": "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def set_enabled(self, name: str, enabled: bool) -> bool:
        for strat in self.strategies:
            if strat.name == name:
                strat.enabled = enabled
                return True
        return False

    def get_status(self) -> list[dict]:
        return [
            {
                "name": strat.name,
                "label": strat.label,
                "description": strat.description,
                "enabled": strat.enabled,
                "symbols": sorted(strat.symbols),
                "last_signal": self.last_signals.get(strat.name),
            }
            for strat in self.strategies
        ]
