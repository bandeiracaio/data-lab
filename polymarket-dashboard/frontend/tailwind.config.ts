import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#030307",
          card: "#08080f",
          elevated: "#0d0d18",
          border: "#1a1a2e",
        },
        accent: {
          green: "#00ff88",
          "green-dim": "#10b981",
          "green-muted": "#064e3b",
          red: "#ff4444",
          "red-dim": "#ef4444",
          "red-muted": "#7f1d1d",
          blue: "#3b82f6",
          "blue-dim": "#1d4ed8",
          purple: "#8b5cf6",
          cyan: "#06b6d4",
          yellow: "#f59e0b",
        },
        text: {
          primary: "#e2e8f0",
          secondary: "#94a3b8",
          muted: "#475569",
          dim: "#334155",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-green": "pulse-green 2s ease-in-out infinite",
        "pulse-red": "pulse-red 2s ease-in-out infinite",
        "glow-border": "glow-border 3s ease-in-out infinite",
        "scan-line": "scan-line 3s linear infinite",
        "flow-right": "flow-right 1.5s linear infinite",
        "count-up": "count-up 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "node-active": "node-active 0.8s ease-in-out",
        "ticker": "ticker 20s linear infinite",
      },
      keyframes: {
        "pulse-green": {
          "0%, 100%": { boxShadow: "0 0 5px #00ff8844, 0 0 20px #00ff8822" },
          "50%": { boxShadow: "0 0 20px #00ff8888, 0 0 40px #00ff8844" },
        },
        "pulse-red": {
          "0%, 100%": { boxShadow: "0 0 5px #ff444444, 0 0 20px #ff444422" },
          "50%": { boxShadow: "0 0 20px #ff444488, 0 0 40px #ff444444" },
        },
        "glow-border": {
          "0%, 100%": { borderColor: "#00ff8844" },
          "50%": { borderColor: "#00ff88cc" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateY(100vh)", opacity: "0" },
        },
        "flow-right": {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
        "count-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "node-active": {
          "0%": { filter: "brightness(1)" },
          "50%": { filter: "brightness(2)" },
          "100%": { filter: "brightness(1)" },
        },
        "ticker": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)",
        "card-gradient": "linear-gradient(135deg, #08080f 0%, #0d0d1a 100%)",
        "green-glow": "radial-gradient(ellipse at top, #00ff8811 0%, transparent 70%)",
        "purple-glow": "radial-gradient(ellipse at bottom, #8b5cf611 0%, transparent 70%)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      boxShadow: {
        "card": "0 0 0 1px #1a1a2e, 0 4px 20px rgba(0,0,0,0.5)",
        "card-hover": "0 0 0 1px #00ff8844, 0 4px 30px rgba(0,255,136,0.1)",
        "green-glow": "0 0 20px rgba(0,255,136,0.4), 0 0 40px rgba(0,255,136,0.2)",
        "red-glow": "0 0 20px rgba(255,68,68,0.4), 0 0 40px rgba(255,68,68,0.2)",
        "blue-glow": "0 0 20px rgba(59,130,246,0.4), 0 0 40px rgba(59,130,246,0.2)",
        "inner-green": "inset 0 0 20px rgba(0,255,136,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
