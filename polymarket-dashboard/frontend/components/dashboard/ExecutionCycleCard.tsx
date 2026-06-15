"use client";

import { useDashboardStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { RefreshCw, Clock, Layers, Crosshair } from "lucide-react";
import { motion } from "framer-motion";

export function ExecutionCycleCard() {
  const cycle = useDashboardStore((s) => s.dashboardState?.executionCycle);

  if (!cycle) return <CycleSkeleton />;

  return (
    <div className="card card-glow-blue h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-[#3b82f6]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Execution Cycle</span>
        </div>
        <span className="badge badge-blue">{cycle.cyclesPerHour}/hr</span>
      </div>

      <div className="separator mx-4" />

      {/* Big cycle counter */}
      <div className="flex-1 flex flex-col items-center justify-center py-4 px-4">
        <div className="text-[#475569] font-mono text-xs uppercase tracking-widest mb-2">Cycle #</div>
        <motion.div
          key={cycle.cycleNumber}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="font-mono text-4xl font-bold glow-blue tabular-nums"
        >
          {cycle.cycleNumber.toLocaleString()}
        </motion.div>

        {/* Rotating icon */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="mt-3"
        >
          <RefreshCw size={18} className="text-[#3b82f644]" />
        </motion.div>
      </div>

      <div className="separator mx-4" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px bg-[#1a1a2e] m-4 rounded overflow-hidden">
        <CycleStat icon={<Layers size={11} />} label="Markets" value={cycle.marketsScanned.toString()} color="#3b82f6" />
        <CycleStat icon={<Crosshair size={11} />} label="Opps" value={cycle.opportunitiesFound.toString()} color="#00ff88" />
        <CycleStat icon={<Clock size={11} />} label="Scan ms" value={`${(cycle.scanDuration * 1000).toFixed(0)}`} color="#8b5cf6" />
        <CycleStat icon={<Clock size={11} />} label="Last cycle" value={formatTime(cycle.lastCycleAt)} color="#94a3b8" />
      </div>
    </div>
  );
}

function CycleStat({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-[#08080f] px-3 py-2">
      <div className="flex items-center gap-1 mb-1" style={{ color: `${color}88` }}>
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono text-xs font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function CycleSkeleton() {
  return (
    <div className="card h-full animate-pulse">
      <div className="p-4 space-y-3">
        <div className="h-3 bg-[#1a1a2e] rounded w-28" />
        <div className="h-10 bg-[#1a1a2e] rounded w-32 mx-auto" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#1a1a2e] rounded" />)}
        </div>
      </div>
    </div>
  );
}
