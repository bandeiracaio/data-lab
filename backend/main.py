import asyncio
import json
import os
import queue
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

load_dotenv(Path(__file__).parent.parent / ".env")

TRADE_MODE = os.getenv("TRADE_MODE", "paper")

from broker import cancel_order, get_account, get_orders, get_positions, place_order
from data import (
    data_queue,
    get_historical_bars,
    get_quotes,
    get_snapshots,
    set_strategy_callback,
    start_streams,
    update_subscription,
)
from risk import RiskEngine
from strategy import MomentumStrategy, StrategyEngine

_config_path = Path(__file__).parent.parent / "config.json"
with open(_config_path) as f:
    CONFIG = json.load(f)

WATCHLIST: list[str] = CONFIG.get("watchlist", ["SPY", "QQQ", "AAPL"])

_strategy_engine: Optional[StrategyEngine] = None


class ConnectionManager:
    def __init__(self):
        self._active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._active:
            self._active.remove(ws)

    async def broadcast(self, msg: str) -> None:
        dead = []
        for ws in self._active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _strategy_engine

    risk = RiskEngine(CONFIG.get("risk", {}))
    strat_cfgs = CONFIG.get("strategies", {})
    strategies = [MomentumStrategy(strat_cfgs.get("momentum", {}))]
    account_ref: dict = {}
    _strategy_engine = StrategyEngine(strategies, risk, account_ref)

    set_strategy_callback(lambda bar: _strategy_engine.on_bar(bar))

    start_streams(WATCHLIST)
    asyncio.create_task(_broadcast_loop())
    asyncio.create_task(_poll_account())
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND = Path(__file__).parent.parent / "index.html"


@app.get("/")
async def serve_frontend():
    return FileResponse(FRONTEND)


async def _broadcast_loop() -> None:
    while True:
        try:
            msg = data_queue.get_nowait()
            await manager.broadcast(json.dumps(msg))
        except queue.Empty:
            await asyncio.sleep(0.01)
        except Exception:
            await asyncio.sleep(0.1)


async def _poll_account() -> None:
    while True:
        try:
            account = get_account()
            positions = get_positions()
            orders = get_orders()
            if _strategy_engine:
                _strategy_engine.update_account(account, positions, orders)
            risk_score = 0.0
            if _strategy_engine:
                risk_score = _strategy_engine.risk.liquidity_risk_score(positions, get_quotes())
            await manager.broadcast(json.dumps({
                "type": "account",
                "account": account,
                "risk_score": risk_score,
            }))
        except Exception:
            pass
        await asyncio.sleep(10)


@app.get("/state")
async def get_state():
    account = get_account()
    positions = get_positions()
    orders = get_orders()
    snapshots = get_snapshots(WATCHLIST)
    risk_score = 0.0
    strategies = []
    if _strategy_engine:
        _strategy_engine.update_account(account, positions, orders)
        risk_score = _strategy_engine.risk.liquidity_risk_score(positions, get_quotes())
        strategies = _strategy_engine.get_status()
    return {
        "mode": TRADE_MODE,
        "watchlist": WATCHLIST,
        "account": account,
        "positions": positions,
        "orders": orders,
        "snapshots": snapshots,
        "risk_score": risk_score,
        "strategies": strategies,
    }


@app.get("/bars/{symbol}")
async def get_bars(symbol: str, timeframe: str = "5Min", limit: int = 200):
    bars = get_historical_bars(symbol.upper(), timeframe, limit)
    return {"symbol": symbol.upper(), "timeframe": timeframe, "bars": bars}


@app.post("/order")
async def create_order(body: dict):
    try:
        result = place_order(
            symbol=body["symbol"].upper(),
            side=body["side"],
            qty=float(body["qty"]),
            order_type=body.get("type", "market"),
            limit_price=float(body["limit_price"]) if body.get("limit_price") else None,
            stop_price=float(body["stop_price"]) if body.get("stop_price") else None,
        )
        return {"ok": True, "order": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.delete("/order/{order_id}")
async def delete_order(order_id: str):
    try:
        cancel_order(order_id)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/watchlist/{symbol}")
async def add_symbol(symbol: str):
    sym = symbol.upper()
    if sym not in WATCHLIST:
        WATCHLIST.append(sym)
        update_subscription([sym])
    return {"ok": True, "watchlist": WATCHLIST}


@app.delete("/watchlist/{symbol}")
async def remove_symbol(symbol: str):
    sym = symbol.upper()
    if sym in WATCHLIST:
        WATCHLIST.remove(sym)
    return {"ok": True, "watchlist": WATCHLIST}


@app.get("/strategies")
async def get_strategies():
    if _strategy_engine:
        return {"strategies": _strategy_engine.get_status()}
    return {"strategies": []}


@app.post("/strategies/{name}/enable")
async def enable_strategy(name: str):
    if _strategy_engine and _strategy_engine.set_enabled(name, True):
        return {"ok": True, "strategies": _strategy_engine.get_status()}
    return {"ok": False, "error": "strategy not found"}


@app.post("/strategies/{name}/disable")
async def disable_strategy(name: str):
    if _strategy_engine and _strategy_engine.set_enabled(name, False):
        return {"ok": True, "strategies": _strategy_engine.get_status()}
    return {"ok": False, "error": "strategy not found"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "subscribe":
                syms = [s.upper() for s in msg.get("symbols", [])]
                update_subscription(syms)
                for s in syms:
                    if s not in WATCHLIST:
                        WATCHLIST.append(s)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
