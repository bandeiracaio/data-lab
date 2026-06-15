"""
WebSocket Manager
=================
Handles all WebSocket connections. Clients connect to /ws and receive
real-time DashboardState updates ~every second.

Message format:
  { "type": "state_update", "timestamp": "...", "payload": { ...DashboardState } }
"""

from __future__ import annotations
import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from fastapi import WebSocket, WebSocketDisconnect

if TYPE_CHECKING:
    from bot.agent_loop import TradingAgent

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts."""

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}
        self._connection_count = 0

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        conn_id = f"client-{int(time.time() * 1000)}-{self._connection_count}"
        self._connections[conn_id] = websocket
        self._connection_count += 1
        logger.info(f"WS connected: {conn_id} (total: {len(self._connections)})")
        return conn_id

    def disconnect(self, conn_id: str):
        self._connections.pop(conn_id, None)
        logger.info(f"WS disconnected: {conn_id} (total: {len(self._connections)})")

    async def send(self, conn_id: str, data: dict):
        ws = self._connections.get(conn_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(conn_id)

    async def broadcast(self, msg_type: str, payload: dict):
        """Send a message to all connected clients."""
        message = {
            "type": msg_type,
            "timestamp": datetime.utcnow().isoformat(),
            "payload": payload,
        }
        dead = []
        for conn_id, ws in list(self._connections.items()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(conn_id)

        for conn_id in dead:
            self.disconnect(conn_id)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, agent: "TradingAgent"):
    """FastAPI WebSocket route handler."""
    conn_id = await manager.connect(websocket)

    # Send initial state immediately
    initial_state = agent.get_initial_state()
    await manager.send(conn_id, {
        "type": "connected",
        "timestamp": datetime.utcnow().isoformat(),
        "payload": {
            "connection_id": conn_id,
            "mode": initial_state.mode,
            "message": "Connected to CLAUDE × QUANT trading engine",
        },
    })

    # Send current state
    await manager.send(conn_id, {
        "type": "state_update",
        "timestamp": datetime.utcnow().isoformat(),
        "payload": initial_state.model_dump(),
    })

    try:
        while True:
            # Keep-alive: handle ping from client
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == '{"type":"ping"}':
                    await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})
            except asyncio.TimeoutError:
                # Send server-side ping
                try:
                    await websocket.send_json({"type": "ping", "timestamp": datetime.utcnow().isoformat()})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error {conn_id}: {e}")
    finally:
        manager.disconnect(conn_id)
