"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency, timeSince } from "@/lib/utils";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";

export function BiggestWinCard() {
  const biggestWin = useDashboardStore((s) => s.dashboardState?.biggestWin);
  const allTimePnl = useDashboardStore((s) => s.dashboardState?.performance.allTimePnl ?? 0);

  if (!biggestWin) return null;

  return (
    <div className="card h-full flex flex-col" style={{ borderColor: "#f59e0b33", boxShadow: "0 0 20px rgba(245,158,11,0.06)" }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-[#f59e0b]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Biggest Win</span>
        </div>
        <span className="badge badge-yellow">#{1}</span>
      </div>

      <div className="separator mx-4" />

      <div className="flex-1 flex flex-col justify-center px-4 py-4 gap-3">
        {/* Win amount */}
        <div>
          <div className="text-[#475569] font-mono text-xs uppercase tracking-wider mb-1">Single Trade</div>
          <div className="font-mono text-2xl font-bold" style={{
            color: "#f59e0b",
            textShadow: "0 0 10px rgba(245,158,11,0.5)"
          }}>
            +${formatCurrency(biggestWin.amount)}
          </div>
        </div>

        {/* Market */}
        <div>
          <div className="text-[#475569] font-mono text-xs uppercase tracking-wider mb-1">Market</div>
          <div className="flex items-center gap-2">
            {biggestWin.direction === "UP" ? (
              <TrendingUp size={12} className="text-[#00ff88] shrink-0" />
            ) : (
              <TrendingDown size={12} className="text-[#ff4444] shrink-0" />
            )}
            <span className="font-mono text-xs text-[#e2e8f0] leading-tight">{biggestWin.market}</span>
          </div>
        </div>

        <div className="separator" />

        {/* Footer stats */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[#475569] font-mono text-[10px] uppercase tracking-wider mb-0.5">Edge Conf.</div>
            <div className="font-mono text-sm font-bold text-[#00ff88]">
              {(biggestWin.edgeConfidence * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[#475569] font-mono text-[10px] uppercase tracking-wider mb-0.5">When</div>
            <div className="font-mono text-xs text-[#94a3b8]">{timeSince(biggestWin.timestamp)}</div>
          </div>
        </div>

        {/* % of total PnL */}
        <div>
          <div className="text-[#475569] font-mono text-[10px] uppercase tracking-wider mb-1">
            % of Total PnL
          </div>
          <div className="progress-bar">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${Math.min(100, (biggestWin.amount / allTimePnl) * 100)}%`,
                background: "linear-gradient(90deg, #92400e, #f59e0b)",
              }}
            />
          </div>
          <div className="font-mono text-[10px] text-[#f59e0b] mt-0.5">
            {((biggestWin.amount / allTimePnl) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
