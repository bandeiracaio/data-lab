import os
import queue
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.live import StockDataStream
from alpaca.data.requests import StockBarsRequest, StockSnapshotRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.stream import TradingStream

TRADE_MODE = os.getenv("TRADE_MODE", "paper")

data_queue: queue.Queue = queue.Queue(maxsize=2000)

_subscribed_symbols: set[str] = set()
_market_stream: Optional[StockDataStream] = None
_stream_lock = threading.Lock()

TIMEFRAME_MAP = {
    "1Min": TimeFrame(1, TimeFrameUnit.Minute),
    "5Min": TimeFrame(5, TimeFrameUnit.Minute),
    "15Min": TimeFrame(15, TimeFrameUnit.Minute),
    "1Hour": TimeFrame(1, TimeFrameUnit.Hour),
    "1Day": TimeFrame(1, TimeFrameUnit.Day),
}

# Rough bars-per-day per timeframe for calculating lookback
BARS_PER_DAY = {"1Min": 390, "5Min": 78, "15Min": 26, "1Hour": 7, "1Day": 1}


def _keys() -> tuple[str, str]:
    if TRADE_MODE == "paper":
        return os.getenv("ALPACA_PAPER_KEY", ""), os.getenv("ALPACA_PAPER_SECRET", "")
    return os.getenv("ALPACA_KEY", ""), os.getenv("ALPACA_SECRET", "")


def _put(msg: dict) -> None:
    try:
        data_queue.put_nowait(msg)
    except queue.Full:
        pass


async def _quote_handler(data) -> None:
    _put({
        "type": "quote",
        "symbol": data.symbol,
        "bid": float(data.bid_price) if data.bid_price else None,
        "ask": float(data.ask_price) if data.ask_price else None,
        "bid_size": int(data.bid_size) if data.bid_size else 0,
        "ask_size": int(data.ask_size) if data.ask_size else 0,
        "timestamp": data.timestamp.isoformat(),
    })


async def _bar_handler(data) -> None:
    _put({
        "type": "bar",
        "symbol": data.symbol,
        "time": int(data.timestamp.timestamp()),
        "open": float(data.open),
        "high": float(data.high),
        "low": float(data.low),
        "close": float(data.close),
        "volume": float(data.volume),
        "vwap": float(data.vwap) if hasattr(data, "vwap") and data.vwap else None,
    })


async def _trade_handler(data) -> None:
    _put({
        "type": "trade",
        "symbol": data.symbol,
        "price": float(data.price),
        "size": int(data.size),
        "timestamp": data.timestamp.isoformat(),
    })


async def _order_update_handler(data) -> None:
    order = data.order
    _put({
        "type": "order_update",
        "event": data.event,
        "order": {
            "id": str(order.id),
            "symbol": order.symbol,
            "side": order.side.value,
            "qty": float(order.qty) if order.qty else 0,
            "filled_qty": float(order.filled_qty) if order.filled_qty else 0,
            "filled_avg": float(order.filled_avg_price) if order.filled_avg_price else None,
            "status": order.status.value,
            "type": order.type.value,
        },
    })


def update_subscription(symbols: list[str]) -> None:
    global _market_stream
    new_symbols = [s for s in symbols if s not in _subscribed_symbols]
    if not new_symbols:
        return
    for s in new_symbols:
        _subscribed_symbols.add(s)
    with _stream_lock:
        if _market_stream:
            try:
                _market_stream.subscribe_quotes(_quote_handler, *new_symbols)
                _market_stream.subscribe_bars(_bar_handler, *new_symbols)
                _market_stream.subscribe_trades(_trade_handler, *new_symbols)
            except Exception:
                pass


def _run_market_stream(key: str, secret: str, initial_symbols: list[str]) -> None:
    global _market_stream
    while True:
        try:
            stream = StockDataStream(key, secret)
            with _stream_lock:
                _market_stream = stream
            symbols = list(_subscribed_symbols) or initial_symbols
            stream.subscribe_quotes(_quote_handler, *symbols)
            stream.subscribe_bars(_bar_handler, *symbols)
            stream.subscribe_trades(_trade_handler, *symbols)
            stream.run()
        except Exception as e:
            _put({"type": "error", "source": "market_stream", "message": str(e)})
            time.sleep(5)


def _run_trading_stream(key: str, secret: str) -> None:
    while True:
        try:
            stream = TradingStream(key, secret, paper=(TRADE_MODE == "paper"))
            stream.subscribe_trade_updates(_order_update_handler)
            stream.run()
        except Exception as e:
            _put({"type": "error", "source": "trading_stream", "message": str(e)})
            time.sleep(5)


def start_streams(initial_symbols: list[str]) -> None:
    key, secret = _keys()
    if not key:
        _put({"type": "error", "source": "startup", "message": "No API credentials found. Set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET in .env"})
        return

    for s in initial_symbols:
        _subscribed_symbols.add(s)

    threading.Thread(target=_run_market_stream, args=(key, secret, initial_symbols), daemon=True).start()
    threading.Thread(target=_run_trading_stream, args=(key, secret), daemon=True).start()


def get_historical_bars(symbol: str, timeframe: str = "5Min", limit: int = 200) -> list[dict]:
    key, secret = _keys()
    client = StockHistoricalDataClient(key, secret)
    tf = TIMEFRAME_MAP.get(timeframe, TIMEFRAME_MAP["5Min"])
    bpd = BARS_PER_DAY.get(timeframe, 78)
    days_needed = max(5, (limit // bpd) + 5)

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days_needed)

    req = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=tf,
        start=start,
        end=end,
        limit=limit,
        feed="iex",
    )
    result = client.get_stock_bars(req)
    bars = result.get(symbol, [])

    out = []
    for b in bars:
        out.append({
            "time": int(b.timestamp.timestamp()),
            "open": float(b.open),
            "high": float(b.high),
            "low": float(b.low),
            "close": float(b.close),
            "volume": float(b.volume),
            "vwap": float(b.vwap) if hasattr(b, "vwap") and b.vwap else None,
        })
    return out


def get_snapshots(symbols: list[str]) -> dict:
    key, secret = _keys()
    if not key or not symbols:
        return {}
    try:
        client = StockHistoricalDataClient(key, secret)
        req = StockSnapshotRequest(symbol_or_symbols=symbols, feed="iex")
        snaps = client.get_stock_snapshot(req)
        result = {}
        for sym, snap in snaps.items():
            result[sym] = {
                "last": float(snap.latest_trade.price) if snap.latest_trade else None,
                "prev_close": float(snap.previous_daily_bar.close) if snap.previous_daily_bar else None,
                "bid": float(snap.latest_quote.bid_price) if snap.latest_quote else None,
                "ask": float(snap.latest_quote.ask_price) if snap.latest_quote else None,
            }
        return result
    except Exception:
        return {}
