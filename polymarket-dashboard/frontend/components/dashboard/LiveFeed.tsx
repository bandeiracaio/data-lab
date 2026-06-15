"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency, timeSince } from "@/lib/utils";
import { Radio, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Trade } from "@/lib/types";

function TradeRow({ trade, isNew }: { trade: Trade; isNew: boolean }) {
  const isWin = (trade.pnl ?? 0) > 0;
  const isUp = trade.direction === "UP";

  return (
    <motion.div
      initial={isNew ? { x: 30, opacity: 0, backgroundColor: "rgba(0,255,136,0.15)" } : false}
      animate={{ x: 0, opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex items-center gap-2 px-4 py-2 border-b border-[#0d0d18] hover:bg-[#0d0d18] transition-colors group"
    >
      {/* Direction icon */}
      <div className={`shrink-0 ${isUp ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      </div>

      {/* Market */}
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-[#e2e8f0] truncate">{trade.market}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[9px] text-[#475569]">
            EV: <span className="text-[#06b6d4]">+{(trade.expectedValue * 100).toFixed(1)}¢</span>
          </span>
          <span className="font-mono text-[9px] text-[#475569]">
            Edge: <span className="text-[#8b5cf6]">{(trade.edgeConfidence * 100).toFixed(0)}%</span>
          </span>
        </div>
      </div>

      {/* PnL */}
      {trade.pnl !== undefined && (
        <div className="text-right shrink-0">
          <div
            className="font-mono text-sm font-bold"
            style={{ color: isWin ? "#00ff88" : "#ff4444" }}
          >
            {isWin ? "+" : ""}{formatCurrency(trade.pnl)}
          </div>
          <div className="font-mono text-[9px] text-[#475569]">{timeSince(trade.timestamp)}</div>
        </div>
      )}

      {/* Status */}
      <div className="shrink-0">
        <CheckCircle2 size={11} className={isWin ? "text-[#00ff8888]" : "text-[#ff444488]"} />
      </div>
    </motion.div>
  );
}

export function LiveFeed() {
  const trades = useDashboardStore((s) => s.dashboardState?.recentTrades ?? []);
  const tradeFlash = useDashboardStore((s) => s.tradeFlash);

  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const total = trades.length;
  const sessionPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-[#ff4444]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Live Polymarket Feed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs font-bold ${sessionPnl >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
            {sessionPnl >= 0 ? "+" : ""}${formatCurrency(Math.abs(sessionPnl))}
          </span>
          <span className="badge badge-red">
            {wins}/{total} W
          </span>
        </div>
      </div>

      <div className="separator mx-4" />

      {/* Feed */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence initial={false}>
          {trades.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              isNew={trade.id === tradeFlash}
            />
          ))}
        </AnimatePresence>

        {trades.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#334155] font-mono text-xs">
            Waiting for trades...
          </div>
        )}
      </div>
    </div>
  );
}
