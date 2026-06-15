"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency, formatPercent, pnlColor } from "@/lib/utils";
import { TrendingUp, TrendingDown, BarChart2, Shield, Target, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRef, useEffect } from "react";

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 2, color }: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
}) {
  const prevRef = useRef(value);

  useEffect(() => {
    prevRef.current = value;
  });

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value.toFixed(decimals)}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{ color }}
        className="font-mono tabular-nums"
      >
        {prefix}{formatCurrency(value, decimals)}{suffix}
      </motion.span>
    </AnimatePresence>
  );
}

export function WalletPnlCard() {
  const performance = useDashboardStore((s) => s.dashboardState?.performance);

  if (!performance) return <SkeletonCard />;

  const {
    allTimePnl, todayPnl, tradesCount, winRate,
    avgRR, liqRisk, sharpeRatio, maxDrawdown, profitFactor,
  } = performance;

  const liqRiskColor = {
    LOW: "#00ff88",
    MEDIUM: "#f59e0b",
    HIGH: "#ff4444",
    CRITICAL: "#ff0000",
  }[liqRisk];

  return (
    <div className="card card-glow-green h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-[#00ff88]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Wallet / PnL</span>
        </div>
        <span className="badge badge-green">LIVE</span>
      </div>

      <div className="separator mx-4" />

      {/* Main PnL */}
      <div className="px-4 py-4">
        <div className="text-[#475569] font-mono text-xs uppercase tracking-wider mb-1">All-Time PnL</div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold font-mono glow-green">
            ${formatCurrency(allTimePnl)}
          </span>
          <div className={`flex items-center gap-1 mb-1 text-sm font-mono ${todayPnl >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
            {todayPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {todayPnl >= 0 ? "+" : ""}${formatCurrency(Math.abs(todayPnl))} today
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-[#1a1a2e] mx-4 rounded-md overflow-hidden mb-4">
        <StatCell
          label="Trades"
          value={tradesCount.toLocaleString()}
          icon={<Zap size={11} />}
          color="#3b82f6"
        />
        <StatCell
          label="Win Rate"
          value={`${(winRate * 100).toFixed(1)}%`}
          icon={<Target size={11} />}
          color={winRate >= 0.55 ? "#00ff88" : winRate >= 0.5 ? "#f59e0b" : "#ff4444"}
          sub={
            <div className="progress-bar mt-1">
              <div
                className="progress-fill-green"
                style={{ width: `${winRate * 100}%` }}
              />
            </div>
          }
        />
        <StatCell
          label="Avg R/R"
          value={avgRR.toFixed(2)}
          icon={<BarChart2 size={11} />}
          color="#8b5cf6"
        />
        <StatCell
          label="Liq Risk"
          value={liqRisk}
          icon={<Shield size={11} />}
          color={liqRiskColor}
        />
      </div>

      {/* Advanced metrics */}
      <div className="px-4 pb-4 space-y-2">
        <div className="separator" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          <MiniStat label="Sharpe" value={sharpeRatio.toFixed(2)} color="#06b6d4" />
          <MiniStat label="Max DD" value={`-${formatPercent(maxDrawdown)}`} color="#f59e0b" />
          <MiniStat label="Profit F" value={profitFactor.toFixed(2)} color="#00ff88" />
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, icon, color, sub }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-[#08080f] px-3 py-2.5">
      <div className="flex items-center gap-1 text-[#475569] mb-1" style={{ color: `${color}99` }}>
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono text-sm font-bold" style={{ color }}>
        {value}
      </div>
      {sub}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] text-[#475569] uppercase tracking-wider">{label}</div>
      <div className="font-mono text-xs font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card h-full animate-pulse">
      <div className="p-4 space-y-3">
        <div className="h-3 bg-[#1a1a2e] rounded w-24" />
        <div className="h-8 bg-[#1a1a2e] rounded w-40" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-[#1a1a2e] rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
