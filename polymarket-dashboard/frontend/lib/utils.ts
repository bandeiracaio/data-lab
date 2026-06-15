import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, decimals = 2): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(decimals);
}

export function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${formatCurrency(value)}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatTimeShort(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function timeSince(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function winRateColor(rate: number): string {
  if (rate >= 0.6) return "#00ff88";
  if (rate >= 0.5) return "#10b981";
  if (rate >= 0.45) return "#f59e0b";
  return "#ef4444";
}

export function pnlColor(value: number): string {
  return value >= 0 ? "#00ff88" : "#ff4444";
}

export function heatmapColor(score: number): string {
  // score 0..1, green = high, red = low
  if (score >= 0.65) return "#00ff8844";
  if (score >= 0.55) return "#10b98144";
  if (score >= 0.5) return "#f59e0b33";
  if (score >= 0.45) return "#ef444433";
  return "#ff444444";
}

export function heatmapTextColor(score: number): string {
  if (score >= 0.6) return "#00ff88";
  if (score >= 0.5) return "#10b981";
  if (score >= 0.45) return "#f59e0b";
  return "#ef4444";
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function smoothNumber(current: number, target: number, speed = 0.15): number {
  return current + (target - current) * speed;
}
