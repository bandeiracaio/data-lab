"use client";

import { useDashboardStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { Activity, Wifi, WifiOff, Zap } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const { dashboardState, isConnected } = useDashboardStore();
  const [time, setTime] = useState(new Date().toISOString());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);

  const mode = dashboardState?.mode ?? "SIMULATION";
  const isRunning = dashboardState?.isRunning ?? false;
  const globalRank = dashboardState?.globalRank ?? 1;
  const percentile = dashboardState?.percentile ?? 0.0001;

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b border-[#1a1a2e] bg-[#030307]/95 backdrop-blur-sm">
      {/* Left: Branding */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Zap size={22} className="text-[#00ff88]" />
            <div className="absolute inset-0 blur-sm bg-[#00ff88] opacity-40 rounded-full" />
          </div>
          <span className="font-mono text-lg font-bold tracking-wider">
            <span className="glow-green">CLAUDE</span>
            <span className="text-[#334155] mx-1">×</span>
            <span className="text-[#e2e8f0]">QUANT</span>
          </span>
        </div>

        <div className="w-px h-6 bg-[#1a1a2e]" />

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className={`pulse-dot ${isRunning ? "pulse-dot-green" : "pulse-dot-red"}`} />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">
            {isRunning ? "ACTIVE" : "PAUSED"}
          </span>
        </div>

        {/* Mode badge */}
        <span className={`badge ${mode === "LIVE" ? "badge-red" : "badge-blue"}`}>
          {mode === "LIVE" ? "● LIVE" : "◆ SIM"}
        </span>
      </div>

      {/* Center: Rank badges */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#00ff8833] bg-[#00ff8808]">
          <span className="font-mono text-xs text-[#475569] uppercase">Global Rank</span>
          <span className="font-mono text-sm font-bold glow-green">#{globalRank}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#8b5cf633] bg-[#8b5cf608]">
          <span className="font-mono text-xs text-[#475569] uppercase">Top</span>
          <span className="font-mono text-sm font-bold glow-purple">
            {(percentile * 100).toFixed(2)}%
          </span>
        </div>

        {/* Strategy label */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#1a1a2e] bg-[#0d0d18]">
          <Activity size={12} className="text-[#3b82f6]" />
          <span className="font-mono text-xs text-[#94a3b8]">Markov + Kelly + Self-Learn</span>
        </div>
      </div>

      {/* Right: Connection + time */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi size={14} className="text-[#00ff88]" />
          ) : (
            <WifiOff size={14} className="text-[#475569]" />
          )}
          <span className="font-mono text-xs text-[#475569]">
            {isConnected ? "LIVE WS" : "SIM MODE"}
          </span>
        </div>

        <div className="w-px h-6 bg-[#1a1a2e]" />

        <span className="font-mono text-xs text-[#475569] tabular-nums">
          {formatTime(time)}
        </span>
      </div>
    </header>
  );
}
