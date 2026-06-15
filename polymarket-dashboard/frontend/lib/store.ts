"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  DashboardState,
  Trade,
  InFlightOrder,
  PnLSnapshot,
  BotMode,
} from "./types";

interface DashboardStore {
  // State
  dashboardState: DashboardState | null;
  isConnected: boolean;
  isLoading: boolean;
  connectionError: string | null;
  lastUpdate: string | null;
  tradeFlash: string | null; // trade ID for flash animation

  // Actions
  setDashboardState: (state: DashboardState) => void;
  updateTrade: (trade: Trade) => void;
  addTrade: (trade: Trade) => void;
  updateInFlightOrder: (order: InFlightOrder) => void;
  appendPnlSnapshot: (snapshot: PnLSnapshot) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setMode: (mode: BotMode) => void;
  flashTrade: (tradeId: string) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  subscribeWithSelector((set, get) => ({
    dashboardState: null,
    isConnected: false,
    isLoading: true,
    connectionError: null,
    lastUpdate: null,
    tradeFlash: null,

    setDashboardState: (state) =>
      set({
        dashboardState: state,
        lastUpdate: new Date().toISOString(),
        isLoading: false,
      }),

    updateTrade: (trade) =>
      set((s) => {
        if (!s.dashboardState) return {};
        const trades = s.dashboardState.recentTrades.map((t) =>
          t.id === trade.id ? trade : t
        );
        return {
          dashboardState: { ...s.dashboardState, recentTrades: trades },
        };
      }),

    addTrade: (trade) =>
      set((s) => {
        if (!s.dashboardState) return {};
        const trades = [trade, ...s.dashboardState.recentTrades].slice(0, 50);
        return {
          dashboardState: { ...s.dashboardState, recentTrades: trades },
          tradeFlash: trade.id,
        };
      }),

    updateInFlightOrder: (order) =>
      set((s) => {
        if (!s.dashboardState) return {};
        const orders = s.dashboardState.inFlightOrders.some(
          (o) => o.id === order.id
        )
          ? s.dashboardState.inFlightOrders.map((o) =>
              o.id === order.id ? order : o
            )
          : [order, ...s.dashboardState.inFlightOrders].slice(0, 10);
        return {
          dashboardState: { ...s.dashboardState, inFlightOrders: orders },
        };
      }),

    appendPnlSnapshot: (snapshot) =>
      set((s) => {
        if (!s.dashboardState) return {};
        const history = [...s.dashboardState.pnlHistory, snapshot].slice(-500);
        return {
          dashboardState: { ...s.dashboardState, pnlHistory: history },
        };
      }),

    setConnected: (connected) =>
      set({ isConnected: connected, connectionError: connected ? null : get().connectionError }),

    setError: (error) => set({ connectionError: error, isLoading: false }),

    setLoading: (loading) => set({ isLoading: loading }),

    setMode: (mode) =>
      set((s) => {
        if (!s.dashboardState) return {};
        return { dashboardState: { ...s.dashboardState, mode } };
      }),

    flashTrade: (tradeId) => {
      set({ tradeFlash: tradeId });
      setTimeout(() => set({ tradeFlash: null }), 800);
    },
  }))
);
