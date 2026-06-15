"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { Rocket, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export function InFlightOrders() {
  const orders = useDashboardStore((s) => s.dashboardState?.inFlightOrders ?? []);

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Rocket size={14} className="text-[#f59e0b]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">In-Flight Orders</span>
        </div>
        <div className="flex items-center gap-1.5">
          {orders.length > 0 && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 size={11} className="text-[#f59e0b]" />
            </motion.div>
          )}
          <span className="badge badge-yellow">{orders.length} active</span>
        </div>
      </div>

      <div className="separator mx-4" />

      <div className="flex-1 overflow-y-auto min-h-0 py-2">
        {orders.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Rocket size={20} className="text-[#1a1a2e] mx-auto mb-2" />
              <div className="font-mono text-xs text-[#334155]">No active orders</div>
            </div>
          </div>
        )}

        {orders.map((order) => (
          <div key={order.id} className="px-4 py-3 border-b border-[#0d0d18]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {order.direction === "UP" ? (
                  <TrendingUp size={11} className="text-[#00ff88]" />
                ) : (
                  <TrendingDown size={11} className="text-[#ff4444]" />
                )}
                <span className="font-mono text-xs text-[#e2e8f0] truncate max-w-[160px]">
                  {order.market}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-[#f59e0b]">
                +${formatCurrency(order.expectedPnl)}
              </span>
            </div>

            {/* Fill progress */}
            <div className="flex items-center gap-2">
              <div className="flex-1 progress-bar">
                <motion.div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${order.fillPercent}%`,
                    background: order.fillPercent > 50
                      ? "linear-gradient(90deg, #064e3b, #00ff88)"
                      : "linear-gradient(90deg, #1d4ed8, #3b82f6)",
                  }}
                  animate={{ width: `${order.fillPercent}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="font-mono text-[10px] text-[#94a3b8] shrink-0 w-10 text-right">
                {order.fillPercent.toFixed(0)}%
              </span>
            </div>

            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-[9px] text-[#475569]">
                Target: <span className="text-[#94a3b8]">{order.targetPrice.toFixed(3)}</span>
              </span>
              <span className="font-mono text-[9px] text-[#475569]">
                {order.timeInFlight.toFixed(1)}s in-flight
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
