"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { GitBranch } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart
} from "recharts";

export function MonteCarloChart() {
  const mc = useDashboardStore((s) => s.dashboardState?.monteCarloResult);

  if (!mc) return <MCskeleton />;

  const { paths, finalMean, finalP5, finalP95, winProbability, expectedReturn, tradeCount } = mc;

  // Build chart data: index → values for each path
  const length = paths[0]?.values.length ?? 0;
  const chartData = Array.from({ length }, (_, i) => {
    const row: Record<string, number> = { trade: i };
    const meanPath = paths.find((p) => p.isMean);
    const p5Path = paths.find((p) => p.isP5);
    const p95Path = paths.find((p) => p.isP95);

    row.mean = meanPath?.values[i] ?? 0;
    row.p5 = p5Path?.values[i] ?? 0;
    row.p95 = p95Path?.values[i] ?? 0;

    // Add a few random background paths for texture
    paths
      .filter((p) => !p.isMean && !p.isP5 && !p.isP95)
      .slice(0, 15)
      .forEach((p, j) => {
        row[`path${j}`] = p.values[i] ?? 0;
      });

    return row;
  });

  const allValues = paths.flatMap((p) => p.values);
  const minV = Math.min(...allValues) * 0.98;
  const maxV = Math.max(...allValues) * 1.02;

  return (
    <div className="card card-glow-purple h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-[#8b5cf6]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Monte Carlo Simulation</span>
        </div>
        <span className="badge badge-purple">{paths.length} paths</span>
      </div>

      <div className="separator mx-4" />

      <div className="flex-1 px-2 py-2 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <XAxis dataKey="trade" hide />
            <YAxis domain={[minV, maxV]} hide />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const mean = payload.find((p) => p.dataKey === "mean")?.value as number;
                return (
                  <div className="chart-tooltip">
                    <div className="text-[#475569] text-[10px]">Trade #{label}</div>
                    <div className="text-[#8b5cf6] font-bold">${formatCurrency(mean)}</div>
                  </div>
                );
              }}
            />

            {/* Background simulation paths */}
            {Array.from({ length: 15 }, (_, j) => (
              <Line
                key={`path${j}`}
                type="monotoneX"
                dataKey={`path${j}`}
                stroke="#8b5cf6"
                strokeWidth={0.5}
                strokeOpacity={0.12}
                dot={false}
                isAnimationActive={false}
              />
            ))}

            {/* P5 / P95 bands */}
            <Line
              type="monotoneX"
              dataKey="p5"
              stroke="#ff4444"
              strokeWidth={1}
              strokeDasharray="4 2"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotoneX"
              dataKey="p95"
              stroke="#00ff88"
              strokeWidth={1}
              strokeDasharray="4 2"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* Mean path */}
            <Line
              type="monotoneX"
              dataKey="mean"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              style={{ filter: "drop-shadow(0 0 4px #8b5cf6)" }}
            />

            <ReferenceLine
              y={mc.paths.find((p) => p.isMean)?.values[0] ?? 47382}
              stroke="#1a1a2e"
              strokeDasharray="3 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="separator mx-4" />

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-px bg-[#1a1a2e] m-4 rounded overflow-hidden">
        <MCstat label="Mean End" value={`$${formatCurrency(finalMean)}`} color="#8b5cf6" />
        <MCstat label="P5 (bear)" value={`$${formatCurrency(finalP5)}`} color="#ff4444" />
        <MCstat label="P95 (bull)" value={`$${formatCurrency(finalP95)}`} color="#00ff88" />
        <MCstat label="Win Prob" value={`${(winProbability * 100).toFixed(0)}%`} color="#06b6d4" />
      </div>
    </div>
  );
}

function MCstat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#08080f] px-3 py-2.5 text-center">
      <div className="font-mono text-[9px] text-[#334155] uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono text-xs font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function MCskeleton() {
  return (
    <div className="card h-full animate-pulse">
      <div className="p-4 space-y-3">
        <div className="h-3 bg-[#1a1a2e] rounded w-36" />
        <div className="h-32 bg-[#1a1a2e] rounded" />
        <div className="grid grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#1a1a2e] rounded" />)}
        </div>
      </div>
    </div>
  );
}
