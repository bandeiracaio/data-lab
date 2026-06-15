import os
from typing import Optional

from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide, TimeInForce, QueryOrderStatus
from alpaca.trading.requests import (
    GetOrdersRequest,
    LimitOrderRequest,
    MarketOrderRequest,
    StopLimitOrderRequest,
    StopOrderRequest,
)

TRADE_MODE = os.getenv("TRADE_MODE", "paper")


def _keys() -> tuple[str, str]:
    if TRADE_MODE == "paper":
        return os.getenv("ALPACA_PAPER_KEY", ""), os.getenv("ALPACA_PAPER_SECRET", "")
    return os.getenv("ALPACA_KEY", ""), os.getenv("ALPACA_SECRET", "")


def _client() -> TradingClient:
    key, secret = _keys()
    return TradingClient(key, secret, paper=(TRADE_MODE == "paper"))


def get_account() -> dict:
    try:
        a = _client().get_account()
        equity = float(a.equity)
        last_equity = float(a.last_equity)
        return {
            "equity": equity,
            "cash": float(a.cash),
            "buying_power": float(a.buying_power),
            "portfolio_value": float(a.portfolio_value),
            "daily_pnl": equity - last_equity,
            "daily_pnl_pct": (equity - last_equity) / last_equity * 100 if last_equity else 0,
        }
    except Exception as e:
        return {"error": str(e), "equity": 0, "cash": 0, "buying_power": 0, "portfolio_value": 0, "daily_pnl": 0, "daily_pnl_pct": 0}


def get_positions() -> list[dict]:
    try:
        return [
            {
                "symbol": p.symbol,
                "qty": float(p.qty),
                "side": p.side.value,
                "avg_entry": float(p.avg_entry_price),
                "market_value": float(p.market_value),
                "unrealized_pnl": float(p.unrealized_pl),
                "unrealized_pnl_pct": float(p.unrealized_plpc) * 100,
                "current_price": float(p.current_price),
                "cost_basis": float(p.cost_basis),
            }
            for p in _client().get_all_positions()
        ]
    except Exception:
        return []


def get_orders() -> list[dict]:
    try:
        orders = _client().get_orders(GetOrdersRequest(status=QueryOrderStatus.OPEN))
        return [_serialize_order(o) for o in orders]
    except Exception:
        return []


def _serialize_order(o) -> dict:
    return {
        "id": str(o.id),
        "symbol": o.symbol,
        "side": o.side.value,
        "qty": float(o.qty) if o.qty else 0,
        "type": o.type.value,
        "status": o.status.value,
        "limit_price": float(o.limit_price) if o.limit_price else None,
        "stop_price": float(o.stop_price) if o.stop_price else None,
        "filled_qty": float(o.filled_qty) if o.filled_qty else 0,
        "filled_avg": float(o.filled_avg_price) if o.filled_avg_price else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


def place_order(
    symbol: str,
    side: str,
    qty: float,
    order_type: str = "market",
    limit_price: Optional[float] = None,
    stop_price: Optional[float] = None,
) -> dict:
    client = _client()
    s = OrderSide.BUY if side == "buy" else OrderSide.SELL
    tif = TimeInForce.DAY

    if order_type == "market":
        req = MarketOrderRequest(symbol=symbol, qty=qty, side=s, time_in_force=tif)
    elif order_type == "limit":
        req = LimitOrderRequest(symbol=symbol, qty=qty, side=s, time_in_force=tif, limit_price=limit_price)
    elif order_type == "stop":
        req = StopOrderRequest(symbol=symbol, qty=qty, side=s, time_in_force=tif, stop_price=stop_price)
    elif order_type == "stop_limit":
        req = StopLimitOrderRequest(
            symbol=symbol, qty=qty, side=s, time_in_force=tif,
            limit_price=limit_price, stop_price=stop_price,
        )
    else:
        raise ValueError(f"Unknown order type: {order_type}")

    o = client.submit_order(req)
    return _serialize_order(o)


def cancel_order(order_id: str) -> None:
    _client().cancel_order_by_id(order_id)
