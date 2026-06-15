class RiskEngine:
    def __init__(self, config: dict):
        self.max_position_pct = config.get("max_position_pct", 0.05)
        self.daily_loss_cap_pct = config.get("daily_loss_cap_pct", 0.02)
        self.max_open_positions = config.get("max_open_positions", 10)

    def check_entry(
        self,
        symbol: str,
        qty: float,
        price: float,
        account: dict,
        positions: list[dict],
        orders: list[dict],
    ) -> tuple[bool, str]:
        equity = account.get("equity", 0)
        daily_pnl_pct = account.get("daily_pnl_pct", 0) / 100.0

        if daily_pnl_pct < -self.daily_loss_cap_pct:
            return False, f"daily loss cap ({daily_pnl_pct*100:.1f}%)"

        pos_symbols = {p["symbol"] for p in positions}

        if symbol in pos_symbols:
            return False, f"already holding {symbol}"

        order_symbols = {o["symbol"] for o in orders}
        if symbol in order_symbols:
            return False, f"open order exists for {symbol}"

        if len(pos_symbols) >= self.max_open_positions:
            return False, f"max positions ({self.max_open_positions}) reached"

        if equity > 0 and price > 0:
            position_value = qty * price
            max_allowed = equity * self.max_position_pct
            if position_value > max_allowed:
                return False, f"size ${position_value:.0f} > max ${max_allowed:.0f}"

        return True, "ok"

    def check_exit(
        self,
        symbol: str,
        positions: list[dict],
        orders: list[dict],
    ) -> tuple[bool, str]:
        exit_orders = [o for o in orders if o["symbol"] == symbol and o["side"] == "sell"]
        if exit_orders:
            return False, "exit order already pending"
        return True, "ok"

    def liquidity_risk_score(self, positions: list[dict], quotes: dict) -> float:
        if not positions:
            return 0.0
        scores = []
        for p in positions:
            sym = p["symbol"]
            q = quotes.get(sym, {})
            bid = q.get("bid")
            ask = q.get("ask")
            if bid and ask and bid > 0:
                spread_pct = (ask - bid) / bid * 100
                score = min(spread_pct / 0.5 * 3.0, 10.0)
            else:
                score = 5.0
            scores.append(score)
        return round(sum(scores) / len(scores), 1)
