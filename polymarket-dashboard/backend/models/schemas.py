"""Pydantic schemas for API responses and WebSocket messages."""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime
import uuid


# ─── Enums / Literals ────────────────────────────────────────────────────────

TradeDirection = Literal["UP", "DOWN"]
TradeStatus = Literal["FILLED", "PENDING", "CANCELLED", "PARTIAL"]
LiqRisk = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
BotMode = Literal["SIMULATION", "LIVE"]
TreeNodeState = Literal["IDLE", "PROCESSING", "ACTIVE", "SUCCESS", "SKIP"]
DecisionAction = Literal["FILL", "HOLD", "SKIP", "PROCESSING"]


# ─── Trade & Orders ───────────────────────────────────────────────────────────

class Trade(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    market: str
    direction: TradeDirection
    entry_price: float
    exit_price: Optional[float] = None
    size: float
    pnl: Optional[float] = None
    status: TradeStatus = "PENDING"
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    expected_value: float = 0.0
    edge_confidence: float = 0.0
    misprice_amount: float = 0.0
    market_condition_id: Optional[str] = None


class InFlightOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    market: str
    direction: TradeDirection
    target_price: float
    current_price: float
    size: float
    fill_percent: float = 0.0
    time_in_flight: float = 0.0
    expected_pnl: float = 0.0


# ─── Performance ─────────────────────────────────────────────────────────────

class PerformanceMetrics(BaseModel):
    all_time_pnl: float = 0.0
    today_pnl: float = 0.0
    trades_count: int = 0
    win_rate: float = 0.0
    avg_rr: float = 0.0
    liq_risk: LiqRisk = "LOW"
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    profit_factor: float = 1.0


class BiggestWin(BaseModel):
    amount: float
    market: str
    direction: TradeDirection
    timestamp: str
    edge_confidence: float


class PnLSnapshot(BaseModel):
    timestamp: str
    value: float
    trades: int


# ─── Execution ───────────────────────────────────────────────────────────────

class ExecutionCycle(BaseModel):
    cycle_number: int = 0
    scan_duration: float = 0.0
    markets_scanned: int = 0
    opportunities_found: int = 0
    cycles_per_hour: int = 0
    last_cycle_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    avg_cycle_duration: float = 0.0


# ─── Decision Tree ────────────────────────────────────────────────────────────

class TreeNode(BaseModel):
    id: str
    label: str
    sublabel: str = ""
    state: TreeNodeState = "IDLE"
    value: Optional[str | float] = None
    unit: str = ""


class DecisionTreeState(BaseModel):
    active_node: str = "TICK"
    action: DecisionAction = "PROCESSING"
    edge_confidence: float = 0.0
    order_flow_imbalance: float = 0.5
    fair_value: float = 0.5
    market_price: float = 0.5
    misprice_percent: float = 0.0
    misprice_detected: bool = False
    profit_projection: float = 0.0
    cycle_started_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    nodes: dict[str, TreeNode] = Field(default_factory=dict)


# ─── Market Data ─────────────────────────────────────────────────────────────

class OHLCCandle(BaseModel):
    time: int  # unix ms
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class MarketData(BaseModel):
    symbol: str = "BTC/USD"
    price: float = 0.0
    change_24h: float = 0.0
    change_percent_24h: float = 0.0
    volume_24h: float = 0.0
    candles: list[OHLCCandle] = Field(default_factory=list)


# ─── Monte Carlo ─────────────────────────────────────────────────────────────

class MonteCarloPath(BaseModel):
    path_id: int
    values: list[float]
    is_mean: bool = False
    is_p5: bool = False
    is_p95: bool = False


class MonteCarloResult(BaseModel):
    paths: list[MonteCarloPath] = Field(default_factory=list)
    trade_count: int = 100
    final_mean: float = 0.0
    final_p5: float = 0.0
    final_p95: float = 0.0
    win_probability: float = 0.0
    expected_return: float = 0.0


# ─── Robustness ──────────────────────────────────────────────────────────────

class RobustnessCell(BaseModel):
    horizon: str
    condition: str
    win_rate: float
    edge_score: float
    sample_size: int


class RobustnessMatrix(BaseModel):
    horizons: list[str] = ["5m", "15m", "1h", "4h"]
    conditions: list[str] = ["Low Vol", "Med Vol", "High Vol", "Trending", "Ranging"]
    cells: list[list[RobustnessCell]] = Field(default_factory=list)
    overall_edge: float = 0.0
    stability_score: float = 0.0


# ─── Dashboard State (full snapshot) ─────────────────────────────────────────

class DashboardState(BaseModel):
    mode: BotMode = "SIMULATION"
    is_running: bool = True
    global_rank: int = 1
    percentile: float = 0.0001
    performance: PerformanceMetrics = Field(default_factory=PerformanceMetrics)
    biggest_win: Optional[BiggestWin] = None
    execution_cycle: ExecutionCycle = Field(default_factory=ExecutionCycle)
    decision_tree: DecisionTreeState = Field(default_factory=DecisionTreeState)
    market_data: MarketData = Field(default_factory=MarketData)
    recent_trades: list[Trade] = Field(default_factory=list)
    in_flight_orders: list[InFlightOrder] = Field(default_factory=list)
    pnl_history: list[PnLSnapshot] = Field(default_factory=list)
    monte_carlo_result: MonteCarloResult = Field(default_factory=MonteCarloResult)
    robustness_matrix: RobustnessMatrix = Field(default_factory=RobustnessMatrix)


# ─── WebSocket Message ────────────────────────────────────────────────────────

WSMessageType = Literal[
    "state_update", "new_trade", "cycle_update",
    "tree_update", "order_update", "market_data",
    "monte_carlo_update", "ping", "connected",
]


class WSMessage(BaseModel):
    type: WSMessageType
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    payload: dict = Field(default_factory=dict)
