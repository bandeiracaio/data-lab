"use client";

import { useDashboardStore } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, CheckCircle2, Circle, Loader2, XCircle, AlertCircle } from "lucide-react";
import type { TreeNodeState } from "@/lib/types";

// Node positions in the SVG canvas
const NODE_DEFS = {
  TICK:     { x: 60,  y: 120, label: "TICK",      sub: "Market Pulse",     color: "#3b82f6" },
  SCAN:     { x: 180, y: 120, label: "SCAN",      sub: "Market Scanner",   color: "#06b6d4" },
  CLASSIFY: { x: 300, y: 120, label: "CLASSIFY",  sub: "Signal Class",     color: "#8b5cf6" },
  MISPRICE: { x: 420, y: 120, label: "MISPRICE?", sub: "Deviation Check",  color: "#f59e0b" },
  RESPOND:  { x: 540, y: 120, label: "RESPOND",   sub: "Action Engine",    color: "#00ff88" },
  FILL:     { x: 480, y: 230, label: "FILL",      sub: "Order Execution",  color: "#00ff88" },
  HOLD:     { x: 600, y: 230, label: "HOLD",      sub: "Wait Signal",      color: "#475569" },
  SKIP:     { x: 420, y: 230, label: "SKIP",      sub: "No Edge",          color: "#334155" },
};

const EDGES = [
  { from: "TICK", to: "SCAN" },
  { from: "SCAN", to: "CLASSIFY" },
  { from: "CLASSIFY", to: "MISPRICE" },
  { from: "MISPRICE", to: "RESPOND" },
  { from: "MISPRICE", to: "SKIP", label: "NO" },
  { from: "RESPOND", to: "FILL", label: "FILL" },
  { from: "RESPOND", to: "HOLD", label: "HOLD" },
];

function stateIcon(state: TreeNodeState, size = 12) {
  switch (state) {
    case "SUCCESS":     return <CheckCircle2 size={size} />;
    case "PROCESSING":  return <Loader2 size={size} className="animate-spin" />;
    case "ACTIVE":      return <AlertCircle size={size} />;
    case "SKIP":        return <XCircle size={size} />;
    default:            return <Circle size={size} />;
  }
}

function TreeNodeBox({ id, activeNode, nodes }: {
  id: string;
  activeNode: string;
  nodes: Record<string, { state: TreeNodeState; value?: number | string; unit?: string }>;
}) {
  const def = NODE_DEFS[id as keyof typeof NODE_DEFS];
  const nodeData = nodes[id];
  const state: TreeNodeState = nodeData?.state ?? "IDLE";
  const isActive = id === activeNode || state === "ACTIVE" || state === "PROCESSING";

  const glowStyle = isActive ? {
    boxShadow: `0 0 16px ${def.color}66, 0 0 32px ${def.color}22`,
    borderColor: `${def.color}99`,
  } : {
    borderColor: `${def.color}22`,
  };

  const opacity = state === "IDLE" ? 0.3 : 1;

  return (
    <foreignObject
      x={def.x - 52}
      y={def.y - 38}
      width={104}
      height={76}
      style={{ overflow: "visible" }}
    >
      <motion.div
        animate={{ opacity, scale: isActive ? 1.04 : 1 }}
        transition={{ duration: 0.35 }}
        className={`tree-node tree-node-${state.toLowerCase()} h-full rounded-lg border bg-[#08080f] flex flex-col items-center justify-center gap-0.5 px-1 cursor-default select-none`}
        style={{ ...glowStyle, background: `linear-gradient(135deg, #08080f, #0d0d18)` }}
      >
        {/* Top: icon + state */}
        <div className="flex items-center gap-1" style={{ color: def.color }}>
          {stateIcon(state, 10)}
          <span className="font-mono text-[10px] font-bold tracking-wider">{def.label}</span>
        </div>

        {/* Value */}
        {nodeData?.value !== undefined && (
          <AnimatePresence mode="wait">
            <motion.div
              key={String(nodeData.value)}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="font-mono text-[11px] font-bold"
              style={{ color: def.color }}
            >
              {nodeData.value}{nodeData.unit ? <span className="text-[9px] opacity-60 ml-0.5">{nodeData.unit}</span> : null}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Sub label */}
        <div className="font-mono text-[9px] text-[#334155] truncate w-full text-center">
          {NODE_DEFS[id as keyof typeof NODE_DEFS].sub}
        </div>
      </motion.div>
    </foreignObject>
  );
}

function AnimatedEdge({ from, to, label, isActive }: {
  from: string; to: string; label?: string; isActive: boolean;
}) {
  const f = NODE_DEFS[from as keyof typeof NODE_DEFS];
  const t = NODE_DEFS[to as keyof typeof NODE_DEFS];

  const x1 = f.x + 52;
  const y1 = f.y;
  const x2 = t.x - 52;
  const y2 = t.y;

  // Handle diagonal edges (MISPRICE → SKIP, RESPOND → FILL/HOLD)
  const isDiagonal = f.y !== t.y;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const path = isDiagonal
    ? `M ${f.x} ${f.y + 38} C ${f.x} ${f.y + 70} ${t.x} ${t.y - 70} ${t.x} ${t.y - 38}`
    : `M ${x1} ${y1} L ${x2} ${y2}`;

  const color = isActive ? "#00ff88" : "#1a1a2e";
  const dashLength = 80;

  return (
    <g>
      {/* Background edge */}
      <path d={path} stroke="#1a1a2e" strokeWidth={1.5} fill="none" />

      {/* Active animated overlay */}
      {isActive && (
        <path
          d={path}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          strokeDasharray={`${dashLength} ${dashLength}`}
          strokeOpacity={0.8}
          style={{
            animation: "flow-edge 1.2s linear infinite",
            filter: `drop-shadow(0 0 3px ${color})`,
          }}
        />
      )}

      {/* Arrow */}
      <motion.circle
        cx={isDiagonal ? f.x : x2}
        cy={isDiagonal ? f.y + 38 : y1}
        r={3}
        fill={color}
        animate={{ opacity: isActive ? 1 : 0.2 }}
      />

      {/* Label */}
      {label && (
        <text
          x={isDiagonal ? midX + 8 : midX}
          y={isDiagonal ? midY : y1 - 8}
          fill={isActive ? color : "#334155"}
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function DecisionTree() {
  const decisionTree = useDashboardStore((s) => s.dashboardState?.decisionTree);

  if (!decisionTree) return <DecisionTreeSkeleton />;

  const { activeNode, action, edgeConfidence, orderFlowImbalance,
    fairValue, marketPrice, mispricePercent, mispriceDetected,
    profitProjection, nodes } = decisionTree;

  // Determine which edges are "active" based on current state
  const activeEdges = new Set<string>();
  const nodeOrder = ["TICK", "SCAN", "CLASSIFY", "MISPRICE", "RESPOND", "FILL", "HOLD", "SKIP"];
  const activeIdx = nodeOrder.indexOf(activeNode);

  if (activeIdx > 0) activeEdges.add("TICK-SCAN");
  if (activeIdx > 1) activeEdges.add("SCAN-CLASSIFY");
  if (activeIdx > 2) activeEdges.add("CLASSIFY-MISPRICE");
  if (activeIdx > 3 && mispriceDetected) activeEdges.add("MISPRICE-RESPOND");
  if (activeIdx > 3 && !mispriceDetected) activeEdges.add("MISPRICE-SKIP");
  if (action === "FILL") activeEdges.add("RESPOND-FILL");
  if (action === "HOLD") activeEdges.add("RESPOND-HOLD");

  return (
    <div className="card card-glow-green h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-[#00ff88]" />
          <span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">Strategy Decision Tree</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#00ff88]">
            Edge: {(edgeConfidence * 100).toFixed(1)}%
          </span>
          <span className={`badge ${mispriceDetected ? "badge-green" : "badge-blue"}`}>
            {mispriceDetected ? "MISPRICE" : "SCANNING"}
          </span>
        </div>
      </div>

      <div className="separator mx-4" />

      {/* SVG Tree */}
      <div className="flex-1 relative overflow-hidden">
        <style>{`
          @keyframes flow-edge {
            0% { stroke-dashoffset: 160; }
            100% { stroke-dashoffset: 0; }
          }
        `}</style>

        <svg
          viewBox="0 0 660 290"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid overlay */}
          <defs>
            <pattern id="treegrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,255,136,0.04)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="660" height="290" fill="url(#treegrid)" />

          {/* Edges */}
          {EDGES.map((edge) => (
            <AnimatedEdge
              key={`${edge.from}-${edge.to}`}
              from={edge.from}
              to={edge.to}
              label={edge.label}
              isActive={activeEdges.has(`${edge.from}-${edge.to}`)}
            />
          ))}

          {/* Nodes */}
          {Object.keys(NODE_DEFS).map((id) => (
            <TreeNodeBox
              key={id}
              id={id}
              activeNode={activeNode}
              nodes={nodes}
            />
          ))}

          {/* Profit pop-up */}
          <AnimatePresence>
            {action === "FILL" && profitProjection > 0 && (
              <motion.g
                key={`profit-${profitProjection}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <rect x="440" y="172" width="80" height="22" rx="4" fill="#064e3b" stroke="#00ff88" strokeWidth="1" />
                <text x="480" y="187" fill="#00ff88" fontSize={11} fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight="bold">
                  +${profitProjection.toFixed(1)}
                </text>
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>

      <div className="separator mx-4" />

      {/* Bottom metrics row */}
      <div className="grid grid-cols-4 gap-px bg-[#1a1a2e] m-4 rounded overflow-hidden">
        <MetricCell label="Order Flow" value={`${(orderFlowImbalance * 100).toFixed(0)}%`} color="#06b6d4" />
        <MetricCell label="Fair Value" value={fairValue.toFixed(3)} color="#8b5cf6" />
        <MetricCell label="Mkt Price" value={marketPrice.toFixed(3)} color="#94a3b8" />
        <MetricCell
          label="Misprice"
          value={`${(mispricePercent * 100).toFixed(2)}%`}
          color={mispriceDetected ? "#00ff88" : "#475569"}
          glow={mispriceDetected}
        />
      </div>
    </div>
  );
}

function MetricCell({ label, value, color, glow }: {
  label: string; value: string; color: string; glow?: boolean;
}) {
  return (
    <div className="bg-[#08080f] px-3 py-2.5 text-center">
      <div className="font-mono text-[9px] text-[#334155] uppercase tracking-wider mb-1">{label}</div>
      <div
        className="font-mono text-xs font-bold"
        style={{ color, textShadow: glow ? `0 0 8px ${color}` : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function DecisionTreeSkeleton() {
  return (
    <div className="card h-full animate-pulse">
      <div className="p-4">
        <div className="h-3 bg-[#1a1a2e] rounded w-48 mb-4" />
        <div className="h-48 bg-[#1a1a2e] rounded" />
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#1a1a2e] rounded" />)}
        </div>
      </div>
    </div>
  );
}
