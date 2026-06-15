"use client";

import { useDashboardStore } from "@/lib/store";
import { heatmapColor, heatmapTextColor } from "@/lib/utils";
import { Grid3X3 } from "lucide-react";

export function RobustnessMatrix() {
  const matrix = useDashboardStore((s) => s.dashboardState?.robustnessMatrix);

  if (!matrix) return <MatrixSkeleton />;

  const { horizons, conditions, cells, overallEdge, stabilityScore } = matrix;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Grid3X3 size={14} className="text-[#06b6d4]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Robustness Matrix</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#06b6d4]">
            Edge: +{(overallEdge * 100).toFixed(1)}%
          </span>
          <span className="badge badge-cyan">
            Stability: {(stabilityScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="separator mx-4" />

      <div className="flex-1 px-4 py-3 overflow-auto">
        {/* Conditions header */}
        <div className="flex mb-2" style={{ paddingLeft: "48px" }}>
          {conditions.map((cond) => (
            <div
              key={cond}
              className="flex-1 text-center font-mono text-[9px] text-[#475569] uppercase tracking-wider truncate px-1"
            >
              {cond}
            </div>
          ))}
        </div>

        {/* Rows */}
        {horizons.map((horizon, hi) => (
          <div key={horizon} className="flex items-center mb-1.5">
            {/* Row label */}
            <div className="w-12 shrink-0 font-mono text-[10px] text-[#475569] uppercase text-right pr-2">
              {horizon}
            </div>

            {/* Cells */}
            {cells[hi]?.map((cell, ci) => (
              <div
                key={ci}
                className="flex-1 mx-0.5 py-2 px-1 rounded heatmap-cell flex flex-col items-center gap-0.5"
                style={{ background: heatmapColor(cell.winRate) }}
                title={`${horizon} × ${cell.condition}: ${(cell.winRate * 100).toFixed(1)}% win rate (n=${cell.sampleSize})`}
              >
                <div
                  className="font-mono text-[11px] font-bold"
                  style={{ color: heatmapTextColor(cell.winRate) }}
                >
                  {(cell.winRate * 100).toFixed(0)}%
                </div>
                <div className="font-mono text-[8px] text-[#334155]">
                  n={cell.sampleSize}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#1a1a2e]">
          <span className="font-mono text-[9px] text-[#334155] uppercase">Win Rate:</span>
          {[
            { label: ">65%", bg: "#00ff8844", color: "#00ff88" },
            { label: "55-65%", bg: "#10b98144", color: "#10b981" },
            { label: "50-55%", bg: "#f59e0b33", color: "#f59e0b" },
            { label: "<50%", bg: "#ff444433", color: "#ff4444" },
          ].map(({ label, bg, color }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ background: bg }} />
              <span className="font-mono text-[9px]" style={{ color }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="card h-full animate-pulse">
      <div className="p-4 space-y-2">
        <div className="h-3 bg-[#1a1a2e] rounded w-32" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-1">
            <div className="h-8 bg-[#1a1a2e] rounded w-10" />
            {[...Array(5)].map((_, j) => (
              <div key={j} className="flex-1 h-8 bg-[#1a1a2e] rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
