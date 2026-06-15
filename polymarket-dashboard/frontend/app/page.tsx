"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useDashboardStore } from "@/lib/store";
import { Header } from "@/components/dashboard/Header";
import { WalletPnlCard } from "@/components/dashboard/WalletPnlCard";
import { BiggestWinCard } from "@/components/dashboard/BiggestWinCard";
import { ExecutionCycleCard } from "@/components/dashboard/ExecutionCycleCard";
import { DecisionTree } from "@/components/dashboard/DecisionTree";
import { MarketChart } from "@/components/dashboard/MarketChart";
import { PnlChart } from "@/components/dashboard/PnlChart";
import { RobustnessMatrix } from "@/components/dashboard/RobustnessMatrix";
import { MonteCarloChart } from "@/components/dashboard/MonteCarloChart";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { InFlightOrders } from "@/components/dashboard/InFlightOrders";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030307]">
      <div className="text-center space-y-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="mx-auto w-fit"
        >
          <Loader2 size={32} className="text-[#00ff88]" />
        </motion.div>
        <div>
          <div className="font-mono text-lg font-bold glow-green tracking-widest">CLAUDE × QUANT</div>
          <div className="font-mono text-xs text-[#475569] mt-1">Initializing trading engine...</div>
        </div>
        <div className="flex items-center justify-center gap-1">
          {["Connecting", "Loading markets", "Starting bot"].map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, delay: i * 0.5, repeat: Infinity }}
              className="font-mono text-[10px] text-[#334155]"
            >
              {s}
              {i < 2 ? <span className="mx-2 text-[#1a1a2e]">→</span> : null}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bottom ticker with live prices/trades
function TickerBar() {
  const trades = useDashboardStore((s) => s.dashboardState?.recentTrades?.slice(0, 8) ?? []);
  const items = [...trades, ...trades]; // duplicate for seamless scroll

  return (
    <div className="border-t border-[#1a1a2e] bg-[#030307]/95 overflow-hidden h-8 flex items-center">
      <div
        className="flex items-center gap-6 whitespace-nowrap"
        style={{ animation: "ticker 30s linear infinite" }}
      >
        {items.map((t, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={`font-mono text-[10px] ${(t.pnl ?? 0) >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
              {(t.pnl ?? 0) >= 0 ? "▲" : "▼"} {t.market.slice(0, 24)}
            </span>
            <span className={`font-mono text-[10px] font-bold ${(t.pnl ?? 0) >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
              {(t.pnl ?? 0) >= 0 ? "+" : ""}${Math.abs(t.pnl ?? 0).toFixed(1)}
            </span>
            <span className="text-[#1a1a2e]">│</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  useWebSocket(); // Connects to WS or starts simulation

  const isLoading = useDashboardStore((s) => s.isLoading);
  const dashboardState = useDashboardStore((s) => s.dashboardState);

  if (isLoading && !dashboardState) return <LoadingScreen />;

  return (
    <div className="min-h-screen flex flex-col bg-[#030307]">
      <Header />

      {/* Main grid */}
      <main className="flex-1 p-3 overflow-auto">
        {/* ── Row 1: Top stats (4 cards) ───────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          {/* Wallet/PnL — wider */}
          <div className="col-span-12 lg:col-span-3" style={{ minHeight: "220px" }}>
            <WalletPnlCard />
          </div>

          {/* Biggest Win */}
          <div className="col-span-6 lg:col-span-2" style={{ minHeight: "220px" }}>
            <BiggestWinCard />
          </div>

          {/* PnL Chart */}
          <div className="col-span-6 lg:col-span-4" style={{ minHeight: "220px" }}>
            <PnlChart />
          </div>

          {/* Execution Cycle */}
          <div className="col-span-12 lg:col-span-3" style={{ minHeight: "220px" }}>
            <ExecutionCycleCard />
          </div>
        </div>

        {/* ── Row 2: Decision Tree (center) + Market Chart + In-Flight ─────── */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          {/* Market Chart */}
          <div className="col-span-12 lg:col-span-3" style={{ minHeight: "280px" }}>
            <MarketChart />
          </div>

          {/* Decision Tree — the centerpiece */}
          <div className="col-span-12 lg:col-span-6" style={{ minHeight: "280px" }}>
            <DecisionTree />
          </div>

          {/* In-Flight Orders */}
          <div className="col-span-12 lg:col-span-3" style={{ minHeight: "280px" }}>
            <InFlightOrders />
          </div>
        </div>

        {/* ── Row 3: Robustness + Monte Carlo + Live Feed ──────────────────── */}
        <div className="grid grid-cols-12 gap-3">
          {/* Robustness Matrix */}
          <div className="col-span-12 lg:col-span-4" style={{ minHeight: "260px" }}>
            <RobustnessMatrix />
          </div>

          {/* Monte Carlo */}
          <div className="col-span-12 lg:col-span-4" style={{ minHeight: "260px" }}>
            <MonteCarloChart />
          </div>

          {/* Live Feed */}
          <div className="col-span-12 lg:col-span-4" style={{ minHeight: "260px" }}>
            <LiveFeed />
          </div>
        </div>
      </main>

      <TickerBar />
    </div>
  );
}
