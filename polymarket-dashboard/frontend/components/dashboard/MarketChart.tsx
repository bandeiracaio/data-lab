"use client";

import { useDashboardStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { BarChart2, TrendingUp, TrendingDown } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

function CandleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { open: number; high: number; low: number; close: number; volume: number; time: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isGreen = d.close >= d.open;
  return (
    <div className="chart-tooltip text-[10px]">
      <div className="text-[#475569] mb-1">{new Date(d.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
      <div className="grid grid-cols-2 gap-x-3">
        <span className="text-[#475569]">O</span><span style={{ color: isGreen ? "#00ff88" : "#ff4444" }}>{d.open.toFixed(0)}</span>
        <span className="text-[#475569]">H</span><span className="text-[#e2e8f0]">{d.high.toFixed(0)}</span>
        <span className="text-[#475569]">L</span><span className="text-[#e2e8f0]">{d.low.toFixed(0)}</span>
        <span className="text-[#475569]">C</span><span style={{ color: isGreen ? "#00ff88" : "#ff4444" }}>{d.close.toFixed(0)}</span>
      </div>
    </div>
  );
}

// Custom candlestick bar rendered as a composable Bar in Recharts
function CandleBar(props: { x?: number; y?: number; width?: number; height?: number; open?: number; high?: number; low?: number; close?: number }) {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  // Recharts passes y as the top of the bar, height as the bar height
  // We use open/close/high/low from payload directly

  const payload = (props as unknown as { payload: { open: number; high: number; low: number; close: number } }).payload;
  if (!payload) return null;

  const { open, high, low, close } = payload;
  const isGreen = close >= open;
  const color = isGreen ? "#00ff88" : "#ff4444";

  // We need the chart scale — work with the recharts-provided y/height
  // The Bar gives us the body rect; we extend for wicks
  const barCenterX = x + width / 2;

  return (
    <g>
      {/* Wick - line from high to low, but since recharts gives relative coords we approximate */}
      <rect
        x={x}
        y={y}
        width={Math.max(width - 1, 1)}
        height={Math.max(height, 1)}
        fill={color}
        fillOpacity={isGreen ? 0.8 : 0.7}
        stroke={color}
        strokeWidth={0.5}
      />
    </g>
  );
}

export function MarketChart() {
  const marketData = useDashboardStore((s) => s.dashboardState?.marketData);

  if (!marketData) return <ChartSkeleton />;

  const { symbol, price, change24h, changePercent24h, candles } = marketData;
  const isUp = changePercent24h >= 0;

  // Prepare data for recharts — use open, high, low, close as stacked ranges
  const chartData = candles.slice(-60).map((c) => {
    const bodyTop = Math.max(c.open, c.close);
    const bodyBot = Math.min(c.open, c.close);
    return {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      // For stacked bar: [low, bodyBottom, bodyTop, high]
      wickLow: c.low,
      bodyLow: bodyBot,
      bodySize: bodyTop - bodyBot,
      wickHigh: c.high - bodyTop,
      wickBase: bodyTop,
      volume: c.volume,
      isGreen: c.close >= c.open,
    };
  });

  const prices = candles.map((c) => c.close);
  const minP = Math.min(...prices) * 0.999;
  const maxP = Math.max(...prices) * 1.001;

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <BarChart2 size={14} className="text-[#f59e0b]" />
            <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">{symbol}</span>
          </div>
          <span className="font-mono text-lg font-bold text-[#e2e8f0] tabular-nums">
            ${formatCurrency(price, 0)}
          </span>
        </div>
        <div className={`flex items-center gap-1 font-mono text-sm font-bold ${isUp ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {isUp ? "+" : ""}{formatCurrency(change24h, 0)} ({isUp ? "+" : ""}{(changePercent24h * 100).toFixed(2)}%)
        </div>
      </div>

      <div className="separator mx-4" />

      {/* Chart area */}
      <div className="flex-1 px-2 py-2 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <XAxis dataKey="time" hide />
            <YAxis domain={[minP, maxP]} hide />
            <Tooltip content={<CandleTooltip />} />
            <ReferenceLine y={price} stroke="#1a1a2e" strokeDasharray="2 2" />

            {/* Simple price line as fallback */}
            <Line
              type="monotoneX"
              dataKey="close"
              stroke={isUp ? "#00ff8888" : "#ff444488"}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />

            {/* Candle bodies via Bar */}
            <Bar
              dataKey="bodySize"
              stackId="candle"
              isAnimationActive={false}
              minPointSize={1}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.isGreen ? "#00ff88" : "#ff4444"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between px-4 pb-3">
        <span className="font-mono text-[10px] text-[#334155]">1M candles · {candles.length} bars</span>
        <span className="font-mono text-[10px] text-[#334155]">
          Vol 24h: ${(marketData.volume24h / 1e9).toFixed(1)}B
        </span>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="card h-full animate-pulse">
      <div className="p-4 space-y-3">
        <div className="h-4 bg-[#1a1a2e] rounded w-32" />
        <div className="h-40 bg-[#1a1a2e] rounded" />
      </div>
    </div>
  );
}
