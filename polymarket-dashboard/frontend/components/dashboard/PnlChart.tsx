"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const time = new Date(payload[0].payload.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="chart-tooltip">
      <div className="text-[#475569] text-[10px]">{time}</div>
      <div className="text-[#00ff88] font-bold">${formatCurrency(val)}</div>
    </div>
  );
}

export function PnlChart() {
  const pnlHistory = useDashboardStore((s) => s.dashboardState?.pnlHistory ?? []);
  const allTimePnl = useDashboardStore((s) => s.dashboardState?.performance.allTimePnl ?? 0);

  const data = pnlHistory.slice(-120).map((p) => ({
    time: p.timestamp,
    value: p.value,
  }));

  const minVal = Math.min(...data.map((d) => d.value));
  const maxVal = Math.max(...data.map((d) => d.value));
  const domain: [number, number] = [minVal * 0.995, maxVal * 1.005];

  const isUp = data.length < 2 || data[data.length - 1]?.value >= data[0]?.value;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-[#00ff88]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">PnL Growth</span>
        </div>
        <span className="font-mono text-sm font-bold glow-green">
          ${formatCurrency(allTimePnl)}
        </span>
      </div>

      <div className="separator mx-4" />

      <div className="flex-1 px-2 py-2 min-h-0">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis domain={domain} hide />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={data[0]?.value} stroke="#1a1a2e" strokeDasharray="3 3" />
              <Area
                type="monotoneX"
                dataKey="value"
                stroke="#00ff88"
                strokeWidth={1.5}
                fill="url(#pnlGradient)"
                dot={false}
                animationDuration={300}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-[#334155] font-mono text-xs">
            Collecting data...
          </div>
        )}
      </div>
    </div>
  );
}
