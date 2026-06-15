"use client";

import { useEffect, useRef, useCallback } from "react";
import { useDashboardStore } from "@/lib/store";
import { generateMockState } from "@/lib/mockData";
import type { WSMessage, DashboardState, Trade, InFlightOrder } from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 10;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const simulationTimer = useRef<ReturnType<typeof setInterval>>();
  const stateRef = useRef<DashboardState | null>(null);

  const {
    setDashboardState,
    addTrade,
    updateInFlightOrder,
    appendPnlSnapshot,
    setConnected,
    setError,
    setLoading,
    dashboardState,
  } = useDashboardStore();

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = dashboardState;
  }, [dashboardState]);

  // ── Simulation mode: generate evolving data locally ──────────────────────
  const startSimulation = useCallback(() => {
    setLoading(false);
    setConnected(false); // simulation ≠ real WS

    const initial = generateMockState();
    setDashboardState(initial);
    stateRef.current = initial;

    const treeNodes = ["TICK", "SCAN", "CLASSIFY", "MISPRICE", "RESPOND", "FILL"];
    let nodeIdx = 0;
    let cycleNum = initial.executionCycle.cycleNumber;

    simulationTimer.current = setInterval(() => {
      const prev = stateRef.current;
      if (!prev) return;

      const now = new Date().toISOString();
      const activeNode = treeNodes[nodeIdx % treeNodes.length];
      nodeIdx++;

      // Evolve BTC price
      const btcDelta = (Math.random() - 0.49) * 80;
      const newBtcPrice = prev.marketData.price + btcDelta;

      // Maybe detect misprice and generate trade
      const mispriceDetected = Math.random() > 0.7;
      const action = mispriceDetected ? (Math.random() > 0.3 ? "FILL" : "HOLD") : "SKIP";

      // Update decision tree
      const edgeConf = 0.6 + Math.random() * 0.3;
      const marketPrice = 0.45 + Math.random() * 0.12;
      const fairValue = marketPrice + (Math.random() - 0.48) * 0.06;
      const mispricePercent = Math.abs(fairValue - marketPrice) / marketPrice;

      // Occasionally add a new trade
      let newTrades = prev.recentTrades;
      let newPnl = prev.performance.allTimePnl;
      let newTradeCount = prev.performance.tradesCount;
      let todayPnl = prev.performance.todayPnl;

      if (action === "FILL" && Math.random() > 0.85) {
        const won = Math.random() > 0.44;
        const pnlAmount = won ? 20 + Math.random() * 180 : -(15 + Math.random() * 70);
        const dir = Math.random() > 0.5 ? "UP" : "DOWN";
        const threshold = Math.floor(newBtcPrice + (Math.random() - 0.5) * 2000);
        const newTrade: Trade = {
          id: `trade-${Date.now()}`,
          market: `BTC/USD ${dir === "UP" ? ">" : "<"} $${threshold.toLocaleString()}`,
          direction: dir,
          entryPrice: marketPrice,
          exitPrice: won ? 0.88 + Math.random() * 0.1 : 0.06 + Math.random() * 0.08,
          size: 50 + Math.random() * 150,
          pnl: pnlAmount,
          status: "FILLED",
          timestamp: now,
          expectedValue: 0.02 + Math.random() * 0.05,
          edgeConfidence: edgeConf,
          mispriceAmount: mispricePercent,
        };
        newTrades = [newTrade, ...prev.recentTrades].slice(0, 50);
        newPnl += pnlAmount;
        todayPnl += pnlAmount;
        newTradeCount += 1;
      }

      // Update in-flight orders fill percent
      const updatedOrders = prev.inFlightOrders.map((o) => ({
        ...o,
        fillPercent: Math.min(100, o.fillPercent + Math.random() * 8),
        timeInFlight: o.timeInFlight + 0.5,
        currentPrice: o.currentPrice + (Math.random() - 0.49) * 0.005,
      })).filter((o) => o.fillPercent < 100);

      // Maybe add new in-flight order
      if (updatedOrders.length < 5 && Math.random() > 0.88) {
        const dir = Math.random() > 0.5 ? "UP" : "DOWN";
        updatedOrders.push({
          id: `order-${Date.now()}`,
          market: `BTC/USD ${dir === "UP" ? ">" : "<"} $${Math.floor(newBtcPrice + 500).toLocaleString()}`,
          direction: dir,
          targetPrice: marketPrice + 0.03,
          currentPrice: marketPrice,
          size: 80 + Math.random() * 120,
          fillPercent: 0,
          timeInFlight: 0,
          expectedPnl: 20 + Math.random() * 60,
        });
      }

      // Update win rate smoothly
      const totalWins = Math.round(newTradeCount * prev.performance.winRate);
      const lastWon = newTrades[0]?.pnl !== undefined && newTrades[0].pnl > 0;
      const newWins = lastWon ? totalWins + 1 : totalWins;
      const newWinRate = newTradeCount > 0 ? newWins / newTradeCount : prev.performance.winRate;

      // PnL snapshot every 5 ticks
      cycleNum++;

      const updated: DashboardState = {
        ...prev,
        performance: {
          ...prev.performance,
          allTimePnl: newPnl,
          todayPnl,
          tradesCount: newTradeCount,
          winRate: Math.max(0.4, Math.min(0.75, newWinRate)),
        },
        executionCycle: {
          ...prev.executionCycle,
          cycleNumber: cycleNum,
          lastCycleAt: now,
          marketsScanned: 40 + Math.floor(Math.random() * 20),
          opportunitiesFound: Math.floor(Math.random() * 6),
          scanDuration: 0.08 + Math.random() * 0.1,
        },
        decisionTree: {
          ...prev.decisionTree,
          activeNode,
          action: action as "FILL" | "HOLD" | "SKIP" | "PROCESSING",
          edgeConfidence: edgeConf,
          orderFlowImbalance: 0.4 + Math.random() * 0.5,
          fairValue,
          marketPrice,
          mispricePercent,
          mispriceDetected,
          profitProjection: mispriceDetected ? 15 + Math.random() * 80 : 0,
          cycleStartedAt: now,
          nodes: {
            ...prev.decisionTree.nodes,
            TICK: { ...prev.decisionTree.nodes.TICK, state: "SUCCESS", value: `${prev.executionCycle.cyclesPerHour}/hr` },
            SCAN: { ...prev.decisionTree.nodes.SCAN, state: nodeIdx % 6 >= 1 ? "SUCCESS" : "PROCESSING", value: `${40 + Math.floor(Math.random() * 20)}` },
            CLASSIFY: { ...prev.decisionTree.nodes.CLASSIFY, state: nodeIdx % 6 >= 2 ? "SUCCESS" : nodeIdx % 6 === 1 ? "PROCESSING" : "IDLE" },
            MISPRICE: { ...prev.decisionTree.nodes.MISPRICE, state: mispriceDetected && nodeIdx % 6 >= 3 ? "SUCCESS" : nodeIdx % 6 === 2 ? "PROCESSING" : "IDLE", value: (mispricePercent * 100).toFixed(2) },
            RESPOND: { ...prev.decisionTree.nodes.RESPOND, state: mispriceDetected && nodeIdx % 6 >= 4 ? "ACTIVE" : "IDLE", value: mispriceDetected ? `+$${(15 + Math.random() * 80).toFixed(1)}` : "" },
            FILL: { ...prev.decisionTree.nodes.FILL, state: action === "FILL" && nodeIdx % 6 >= 5 ? "PROCESSING" : "IDLE", value: (edgeConf * 100).toFixed(1) },
            HOLD: { ...prev.decisionTree.nodes.HOLD, state: action === "HOLD" ? "ACTIVE" : "IDLE" },
          },
        },
        marketData: {
          ...prev.marketData,
          price: newBtcPrice,
          change24h: newBtcPrice - 66_000,
          changePercent24h: (newBtcPrice - 66_000) / 66_000,
          candles: [
            ...prev.marketData.candles.slice(-79),
            {
              time: Date.now(),
              open: prev.marketData.price,
              high: Math.max(prev.marketData.price, newBtcPrice) + Math.random() * 50,
              low: Math.min(prev.marketData.price, newBtcPrice) - Math.random() * 50,
              close: newBtcPrice,
              volume: 50 + Math.random() * 200,
            },
          ],
        },
        recentTrades: newTrades,
        inFlightOrders: updatedOrders,
        pnlHistory: [
          ...prev.pnlHistory.slice(-499),
          { timestamp: now, value: newPnl, trades: newTradeCount },
        ],
      };

      stateRef.current = updated;
      setDashboardState(updated);
    }, 800); // update every 800ms for smooth animation
  }, [setDashboardState, setConnected, setLoading]);

  // ── Real WebSocket mode ───────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectCount.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          switch (msg.type) {
            case "state_update":
              setDashboardState(msg.payload as DashboardState);
              break;
            case "new_trade":
              addTrade(msg.payload as Trade);
              break;
            case "order_update":
              updateInFlightOrder(msg.payload as InFlightOrder);
              break;
            case "monte_carlo_update":
              // handled in state_update
              break;
          }
        } catch (e) {
          console.error("WS message parse error:", e);
        }
      };

      ws.onerror = () => {
        setError("WebSocket error — falling back to simulation");
        startSimulation();
      };

      ws.onclose = () => {
        setConnected(false);
        if (reconnectCount.current < MAX_RECONNECT) {
          reconnectCount.current++;
          const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectCount.current - 1);
          reconnectTimer.current = setTimeout(connect, delay);
        } else {
          setError("Cannot reach backend — running in simulation mode");
          startSimulation();
        }
      };
    } catch {
      startSimulation();
    }
  }, [setDashboardState, addTrade, updateInFlightOrder, setConnected, setError, startSimulation]);

  useEffect(() => {
    // Try backend first; fall back to simulation after 2s
    const timeout = setTimeout(() => {
      if (!useDashboardStore.getState().isConnected && !useDashboardStore.getState().dashboardState) {
        startSimulation();
      }
    }, 2000);

    connect();

    return () => {
      clearTimeout(timeout);
      clearInterval(simulationTimer.current);
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, startSimulation]);

  return {
    isConnected: useDashboardStore((s) => s.isConnected),
    connectionError: useDashboardStore((s) => s.connectionError),
  };
}
