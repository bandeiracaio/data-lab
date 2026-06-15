// ─── Core Domain Types ────────────────────────────────────────────────────────

export type TradeDirection = "UP" | "DOWN";
export type TradeStatus = "FILLED" | "PENDING" | "CANCELLED" | "PARTIAL";
export type LiqRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BotMode = "SIMULATION" | "LIVE";
export type TreeNodeState = "IDLE" | "PROCESSING" | "ACTIVE" | "SUCCESS" | "SKIP";
export type DecisionAction = "FILL" | "HOLD" | "SKIP" | "PROCESSING";

// ─── Trade & Order Types ──────────────────────────────────────────────────────

export interface Trade {
  id: string;
  market: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice?: number;
  size: number;
  pnl?: number;
  status: TradeStatus;
  timestamp: string;
  expectedValue: number;
  edgeConfidence: number;
  mispriceAmount: number;
}

export interface InFlightOrder {
  id: string;
  market: string;
  direction: TradeDirection;
  targetPrice: number;
  currentPrice: number;
  size: number;
  fillPercent: number;
  timeInFlight: number;
  expectedPnl: number;
}

// ─── PnL & Performance ───────────────────────────────────────────────────────

export interface PnLSnapshot {
  timestamp: string;
  value: number;
  trades: number;
}

export interface PerformanceMetrics {
  allTimePnl: number;
  todayPnl: number;
  tradesCount: number;
  winRate: number;
  avgRR: number;
  liqRisk: LiqRisk;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface BiggestWin {
  amount: number;
  market: string;
  direction: TradeDirection;
  timestamp: string;
  edgeConfidence: number;
}

// ─── Execution Cycle ─────────────────────────────────────────────────────────

export interface ExecutionCycle {
  cycleNumber: number;
  scanDuration: number;
  marketsScanned: number;
  opportunitiesFound: number;
  cyclesPerHour: number;
  lastCycleAt: string;
  avgCycleDuration: number;
}

// ─── Decision Tree ───────────────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  state: TreeNodeState;
  value?: number | string;
  unit?: string;
}

export interface DecisionTreeState {
  activeNode: string;
  action: DecisionAction;
  edgeConfidence: number;
  orderFlowImbalance: number;
  fairValue: number;
  marketPrice: number;
  mispricePercent: number;
  mispriceDetected: boolean;
  profitProjection: number;
  nodes: Record<string, TreeNode>;
  cycleStartedAt: string;
}

// ─── Market Chart ────────────────────────────────────────────────────────────

export interface OHLCCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  candles: OHLCCandle[];
}

// ─── Monte Carlo ─────────────────────────────────────────────────────────────

export interface MonteCarloPath {
  pathId: number;
  values: number[];
  isMean: boolean;
  isP5: boolean;
  isP95: boolean;
}

export interface MonteCarloResult {
  paths: MonteCarloPath[];
  tradeCount: number;
  finalMean: number;
  finalP5: number;
  finalP95: number;
  winProbability: number;
  expectedReturn: number;
}

// ─── Robustness Matrix ───────────────────────────────────────────────────────

export interface RobustnessCell {
  horizon: string;
  condition: string;
  winRate: number;
  edgeScore: number;
  sampleSize: number;
}

export interface RobustnessMatrix {
  horizons: string[];
  conditions: string[];
  cells: RobustnessCell[][];
  overallEdge: number;
  stabilityScore: number;
}

// ─── WebSocket Messages ───────────────────────────────────────────────────────

export type WSMessageType =
  | "state_update"
  | "new_trade"
  | "cycle_update"
  | "tree_update"
  | "order_update"
  | "market_data"
  | "monte_carlo_update"
  | "ping"
  | "connected";

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  timestamp: string;
  payload: T;
}

export interface DashboardState {
  mode: BotMode;
  isRunning: boolean;
  globalRank: number;
  percentile: number;
  performance: PerformanceMetrics;
  biggestWin: BiggestWin;
  executionCycle: ExecutionCycle;
  decisionTree: DecisionTreeState;
  marketData: MarketData;
  recentTrades: Trade[];
  inFlightOrders: InFlightOrder[];
  pnlHistory: PnLSnapshot[];
  monteCarloResult: MonteCarloResult;
  robustnessMatrix: RobustnessMatrix;
}

// ─── Chart Data ───────────────────────────────────────────────────────────────

export interface ChartDataPoint {
  time: string | number;
  value: number;
  label?: string;
}

export interface CandlestickDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
