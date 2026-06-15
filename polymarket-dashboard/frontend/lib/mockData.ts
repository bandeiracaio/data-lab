"use client";

import type { DashboardState } from "./types";

// Generates realistic-looking initial mock state for simulation mode
export function generateMockState(seed = Date.now()): DashboardState {
  const rng = (min: number, max: number) =>
    min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min);

  const now = new Date().toISOString();
  const btcBase = 67_420;

  // Generate 200 PnL history points over last 8 hours
  const pnlHistory = Array.from({ length: 200 }, (_, i) => {
    const t = new Date(Date.now() - (200 - i) * 144_000); // every 2.4min
    const base = 42_000;
    const growth = i * 48 + Math.sin(i * 0.3) * 800 + Math.cos(i * 0.1) * 400;
    return {
      timestamp: t.toISOString(),
      value: base + growth + Math.random() * 200,
      trades: Math.floor(i * 9.2),
    };
  });

  // Generate 80 candles (1min each)
  const candles = Array.from({ length: 80 }, (_, i) => {
    const base = btcBase + Math.sin(i * 0.15) * 800 + Math.cos(i * 0.08) * 400;
    const open = base + Math.random() * 200 - 100;
    const close = base + Math.random() * 200 - 100;
    const high = Math.max(open, close) + Math.random() * 150;
    const low = Math.min(open, close) - Math.random() * 150;
    return {
      time: Date.now() - (80 - i) * 60_000,
      open,
      high,
      low,
      close,
      volume: 50 + Math.random() * 200,
    };
  });

  // Monte Carlo paths
  const mcPaths = Array.from({ length: 80 }, (_, pathId) => {
    const isMean = pathId === 0;
    const isP5 = pathId === 1;
    const isP95 = pathId === 2;
    const drift = isMean ? 0.008 : isP5 ? -0.015 : isP95 ? 0.025 : (Math.random() * 0.04 - 0.01);
    const vol = isP5 || isP95 ? 0.005 : Math.random() * 0.012 + 0.003;
    let v = 47_382;
    return {
      pathId,
      isMean,
      isP5,
      isP95,
      values: Array.from({ length: 100 }, () => {
        v = v * (1 + drift / 100 + (Math.random() - 0.5) * vol);
        return Math.max(v, 1000);
      }),
    };
  });

  // Robustness matrix
  const horizons = ["5m", "15m", "1h", "4h"];
  const conditions = ["Low Vol", "Med Vol", "High Vol", "Trending", "Ranging"];
  const cells = horizons.map((horizon, hi) =>
    conditions.map((condition, ci) => {
      const base = 0.56 + hi * 0.01 - ci * 0.008 + (Math.random() - 0.5) * 0.04;
      return {
        horizon,
        condition,
        winRate: Math.max(0.42, Math.min(0.72, base)),
        edgeScore: Math.max(0.3, Math.min(0.9, base + 0.05)),
        sampleSize: Math.floor(200 + Math.random() * 800),
      };
    })
  );

  const recentTrades = Array.from({ length: 20 }, (_, i) => {
    const won = Math.random() > 0.44;
    const pnl = won ? 20 + Math.random() * 200 : -(15 + Math.random() * 80);
    const dir = Math.random() > 0.5 ? "UP" : "DOWN";
    return {
      id: `trade-${i}`,
      market: `BTC/USD ${dir === "UP" ? ">" : "<"} $${Math.floor(btcBase + (Math.random() - 0.5) * 2000).toLocaleString()}`,
      direction: dir as "UP" | "DOWN",
      entryPrice: 0.48 + Math.random() * 0.08,
      exitPrice: won ? 0.9 + Math.random() * 0.08 : 0.05 + Math.random() * 0.1,
      size: 50 + Math.random() * 150,
      pnl,
      status: "FILLED" as const,
      timestamp: new Date(Date.now() - i * 180_000 - Math.random() * 60_000).toISOString(),
      expectedValue: 0.02 + Math.random() * 0.06,
      edgeConfidence: 0.6 + Math.random() * 0.25,
      mispriceAmount: 0.01 + Math.random() * 0.04,
    };
  });

  const inFlightOrders = Array.from({ length: 3 }, (_, i) => ({
    id: `order-inflight-${i}`,
    market: `BTC/USD ${i % 2 === 0 ? ">" : "<"} $${(btcBase + i * 500).toLocaleString()}`,
    direction: (i % 2 === 0 ? "UP" : "DOWN") as "UP" | "DOWN",
    targetPrice: 0.52 + i * 0.04,
    currentPrice: 0.49 + i * 0.03 + Math.random() * 0.05,
    size: 80 + i * 30,
    fillPercent: 20 + Math.random() * 60,
    timeInFlight: 2 + Math.random() * 10,
    expectedPnl: 15 + Math.random() * 60,
  }));

  return {
    mode: "SIMULATION",
    isRunning: true,
    globalRank: 1,
    percentile: 0.0001,
    performance: {
      allTimePnl: 47_382.5,
      todayPnl: 1_234.0,
      tradesCount: 1_847,
      winRate: 0.563,
      avgRR: 1.42,
      liqRisk: "LOW",
      sharpeRatio: 3.21,
      maxDrawdown: 0.073,
      profitFactor: 1.87,
    },
    biggestWin: {
      amount: 892.5,
      market: "BTC/USD > $65,000 on Jan 15",
      direction: "UP",
      timestamp: new Date(Date.now() - 86400 * 3 * 1000).toISOString(),
      edgeConfidence: 0.94,
    },
    executionCycle: {
      cycleNumber: 8_847,
      scanDuration: 0.12,
      marketsScanned: 47,
      opportunitiesFound: 3,
      cyclesPerHour: 32,
      lastCycleAt: now,
      avgCycleDuration: 112,
    },
    decisionTree: {
      activeNode: "RESPOND",
      action: "FILL",
      edgeConfidence: 0.732,
      orderFlowImbalance: 0.68,
      fairValue: 0.512,
      marketPrice: 0.487,
      mispricePercent: 0.0257,
      mispriceDetected: true,
      profitProjection: 47.3,
      cycleStartedAt: now,
      nodes: {
        TICK: { id: "TICK", label: "TICK", sublabel: "Market Pulse", state: "SUCCESS", value: "32/hr", unit: "cycles" },
        SCAN: { id: "SCAN", label: "SCAN", sublabel: "Market Scanner", state: "SUCCESS", value: 47, unit: "markets" },
        CLASSIFY: { id: "CLASSIFY", label: "CLASSIFY", sublabel: "Signal Class", state: "SUCCESS", value: "STRONG", unit: "" },
        MISPRICE: { id: "MISPRICE", label: "MISPRICE?", sublabel: "Deviation Check", state: "SUCCESS", value: "2.57", unit: "%" },
        RESPOND: { id: "RESPOND", label: "RESPOND", sublabel: "Action Engine", state: "ACTIVE", value: "+$47.30", unit: "" },
        FILL: { id: "FILL", label: "FILL", sublabel: "Order Execution", state: "PROCESSING", value: "73.2", unit: "%" },
        HOLD: { id: "HOLD", label: "HOLD", sublabel: "Wait Signal", state: "IDLE" },
      },
    },
    marketData: {
      symbol: "BTC/USD",
      price: btcBase,
      change24h: 1420,
      changePercent24h: 0.021,
      volume24h: 48_200_000_000,
      candles,
    },
    recentTrades,
    inFlightOrders,
    pnlHistory,
    monteCarloResult: {
      paths: mcPaths,
      tradeCount: 100,
      finalMean: 53_200,
      finalP5: 38_100,
      finalP95: 71_800,
      winProbability: 0.847,
      expectedReturn: 0.123,
    },
    robustnessMatrix: {
      horizons,
      conditions,
      cells,
      overallEdge: 0.073,
      stabilityScore: 0.84,
    },
  };
}
