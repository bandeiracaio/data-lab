"""
CLAUDE × QUANT — Backend API
=============================
FastAPI application serving:
  - GET  /api/status          — Health check + bot status
  - GET  /api/state           — Current dashboard state (REST fallback)
  - GET  /api/trades          — Trade history
  - POST /api/bot/start       — Start bot
  - POST /api/bot/stop        — Stop bot
  - POST /api/bot/mode        — Switch SIMULATION / LIVE
  - WS   /ws                  — Real-time state stream
"""

from __future__ import annotations
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings
from bot.agent_loop import TradingAgent
from api.websocket import manager, websocket_endpoint

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Global agent instance ──────────────────────────────────────────────────────
agent = TradingAgent(
    mode=settings.BOT_MODE,
    starting_bankroll=settings.STARTING_BANKROLL,
    min_edge_pct=settings.MIN_EDGE_PERCENT,
    min_confidence=settings.MIN_EDGE_CONFIDENCE,
    kelly_fraction=settings.KELLY_FRACTION,
    broadcast_fn=manager.broadcast,
    poly_api_key=settings.POLY_API_KEY,
    poly_api_secret=settings.POLY_API_SECRET,
    poly_passphrase=settings.POLY_PASSPHRASE,
    poly_private_key=settings.POLY_PRIVATE_KEY,
)

agent_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_task
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Mode: {settings.BOT_MODE} | Bankroll: ${settings.STARTING_BANKROLL:,.0f}")

    agent_task = asyncio.create_task(agent.run(), name="trading-agent")
    yield

    logger.info("Shutting down agent...")
    agent.stop()
    if agent_task:
        agent_task.cancel()
        try:
            await agent_task
        except asyncio.CancelledError:
            pass


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Autonomous Polymarket trading bot + real-time dashboard",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST Routes ───────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    state = agent.last_state
    return {
        "status": "running" if agent._running else "stopped",
        "mode": agent.mode,
        "cycle_number": state.execution_cycle.cycle_number if state else 0,
        "connections": manager.connection_count,
        "uptime_seconds": (datetime.utcnow() - datetime(2024, 1, 1)).total_seconds(),
        "version": settings.APP_VERSION,
    }


@app.get("/api/state")
async def get_state():
    """REST fallback for clients that can't use WebSocket."""
    state = agent.get_initial_state()
    return JSONResponse(content=state.model_dump())


@app.get("/api/trades")
async def get_trades(limit: int = 50):
    state = agent.last_state
    if not state:
        return []
    return [t.model_dump() for t in state.recent_trades[:limit]]


@app.get("/api/performance")
async def get_performance():
    state = agent.last_state
    if not state:
        raise HTTPException(404, "No state yet")
    return state.performance.model_dump()


class ModeRequest(BaseModel):
    mode: str


@app.post("/api/bot/mode")
async def set_mode(req: ModeRequest):
    if req.mode not in ("SIMULATION", "LIVE"):
        raise HTTPException(400, "mode must be SIMULATION or LIVE")
    agent.mode = req.mode
    return {"mode": agent.mode}


@app.post("/api/bot/stop")
async def stop_bot():
    agent.stop()
    return {"status": "stopped"}


@app.post("/api/bot/start")
async def start_bot():
    global agent_task
    if not agent._running:
        agent._running = True
        agent_task = asyncio.create_task(agent.run(), name="trading-agent")
    return {"status": "running"}


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_route(websocket: WebSocket):
    await websocket_endpoint(websocket, agent)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
