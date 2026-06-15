# CLAUDE × QUANT — Polymarket Trading Dashboard & Bot

> Autonomous high-frequency trading system for Polymarket binary markets with a real-time cyber-quant dashboard.

---

## ⚠️ RISK WARNING & LEGAL DISCLAIMER

**READ BEFORE USING:**

- Prediction market trading involves **substantial risk of total loss**. Never trade with money you cannot afford to lose.
- Past performance of simulated results does **NOT** predict future live trading results.
- This system is provided for **educational and research purposes only**.
- The authors accept no liability for financial losses incurred through use of this software.
- Ensure prediction market trading is **legal in your jurisdiction** before proceeding.
- In the United States, Polymarket is restricted — consult legal counsel before use.
- Always start in **SIMULATION mode** and run for weeks before considering live funds.
- Suggested max allocation: **1-2% of investable assets** in crypto/prediction markets.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    CLAUDE × QUANT                              │
│                                                                │
│  Frontend (Next.js 14)          Backend (FastAPI + Python)     │
│  ┌─────────────────────┐        ┌──────────────────────────┐  │
│  │ Dashboard (React)   │◄──WS──►│ WebSocket Manager        │  │
│  │ - Header            │        │ - Broadcast all clients  │  │
│  │ - PnL Card          │        │                          │  │
│  │ - Decision Tree     │        │ Trading Agent (asyncio)  │  │
│  │ - Market Chart      │        │ ┌────────────────────┐   │  │
│  │ - Monte Carlo       │        │ │ TICK → SCAN        │   │  │
│  │ - Robustness Matrix │        │ │   → CLASSIFY       │   │  │
│  │ - Live Feed         │        │ │   → MISPRICE?      │   │  │
│  │ - In-Flight Orders  │        │ │   → RESPOND        │   │  │
│  └─────────────────────┘        │ │   → FILL/HOLD      │   │  │
│                                 │ └────────────────────┘   │  │
│  State Management (Zustand)     │                          │  │
│  WebSocket Client               │ Fair Value Engine        │  │
│                                 │ Mispricing Detector      │  │
│                                 │ Risk Manager             │  │
│                                 │ Monte Carlo Simulator    │  │
│                                 └──────────────────────────┘  │
│                                          │                     │
│                               ┌──────────┴──────────┐         │
│                               │   PostgreSQL + Redis  │        │
│                               └─────────────────────-┘        │
└────────────────────────────────────────────────────────────────┘
```

---

## Quick Start (5 minutes to running)

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker + Docker Compose (optional but recommended)

### Option A: Docker (easiest)

```bash
# 1. Clone / navigate to this directory
cd polymarket-dashboard

# 2. Copy environment file
cp .env.example .env

# 3. Start everything
docker compose up -d

# 4. Open dashboard
open http://localhost:3000
```

### Option B: Manual Setup

#### Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp ../.env.example .env
# Edit .env — minimum: BOT_MODE=SIMULATION

# Start the API server
python main.py
# → Running at http://localhost:8000
# → WebSocket at ws://localhost:8000/ws
```

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Set environment (defaults work for local dev)
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws" > .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" >> .env.local

# Start development server
npm run dev
# → Running at http://localhost:3000
```

> **No backend needed for demo**: The frontend auto-detects if the backend is unavailable and runs in client-side simulation mode with animated data. Just run `npm run dev` in the frontend directory.

---

## Dashboard Panels

| Panel | Description |
|-------|-------------|
| **Wallet / PnL** | All-time PnL, trades count, win rate, avg R/R, liquidity risk, Sharpe, max drawdown |
| **Biggest Win** | Highest single-trade profit with market details |
| **PnL Growth Chart** | Smooth area chart of portfolio value over time |
| **Execution Cycle** | Current cycle number, markets scanned, opportunities found, cycles/hr |
| **Strategy Decision Tree** | Live animated visualization of the bot's decision process |
| **BTC/USD Chart** | Candlestick chart with 1-minute bars |
| **In-Flight Orders** | Active orders with fill percentage progress bars |
| **Robustness Matrix** | Win rate heatmap across time horizons × market conditions |
| **Monte Carlo** | 80-path simulation showing P5/median/P95 portfolio trajectories |
| **Live Feed** | Real-time trade feed with EV and edge confidence |

---

## Trading Strategy: Deep Dive

### Core Edge: Order Book Mispricing

The bot exploits short-term pricing inefficiencies in Polymarket binary markets:

```
Fair Value = weighted_average(
  order_book_imbalance × w₁,    ← buy pressure signal
  trade_momentum × w₂,           ← recent fill direction
  btc_momentum × w₃,             ← on-chain price movement
  time_decay × w₄,               ← resolution proximity
  resolution_prior × w₅          ← base rate from similar markets
)

Edge = Fair_Value - Market_Ask_Price

IF Edge > 2% AND Confidence > 60%:
  Size = Kelly_Fraction × Kelly_Full × Bankroll
  FILL order
```

### Kelly Criterion Position Sizing

```python
# For a binary market buying YES at price p:
b = (1/p) - 1          # net odds if YES resolves
q = 1 - fair_value     # estimated loss probability
f = (fair_value × b - q) / b  # full Kelly fraction
size = f × 0.25 × bankroll    # quarter-Kelly for safety
```

### Self-Learning Weight Updates (Markov)

After each market resolution:
```python
# If market resolves YES:
for signal in signals:
    error = 1.0 - signal.value      # how far was signal from truth
    weight[signal] += lr × error × signal.value
weights = normalize(weights)         # keep sum = 1
```

### Target Markets

The bot focuses on **short-duration BTC binary markets**:
- "Will BTC be above/below $X in N hours?"
- Duration: 1-8 hours (faster resolution = more cycles)
- Minimum liquidity: $5,000 USDC

---

## Connecting Real Polymarket Wallet

### 1. Get API credentials
1. Go to [polymarket.com](https://polymarket.com) → Settings → API Keys
2. Create API key with trading permissions
3. Note: API key, secret, passphrase

### 2. Fund a Polygon wallet
1. Create a dedicated Metamask wallet (NEVER use your main wallet)
2. Bridge USDC to Polygon: [bridge.polygon.technology](https://bridge.polygon.technology)
3. Export private key from Metamask
4. Recommend: start with $100-500 USDC maximum

### 3. Configure .env
```env
BOT_MODE=LIVE
POLY_API_KEY=your_api_key
POLY_API_SECRET=your_api_secret
POLY_PASSPHRASE=your_passphrase
POLY_PRIVATE_KEY=0xyour_private_key_hex
STARTING_BANKROLL=500  # your actual USDC balance
```

### 4. Switch mode via API
```bash
curl -X POST http://localhost:8000/api/bot/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "LIVE"}'
```

---

## Production Deployment

### Railway (backend) + Vercel (frontend)

**Backend on Railway:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
cd backend
railway init
railway up

# Set environment variables in Railway dashboard
# Copy all values from .env.example
```

**Frontend on Vercel:**
```bash
cd frontend
npx vercel

# Set env vars:
# NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app
# NEXT_PUBLIC_WS_URL=wss://your-railway-url.railway.app/ws
```

### VPS Deployment (DigitalOcean / Hetzner)

```bash
# On your VPS:
git clone your-repo
cd polymarket-dashboard

# Edit .env for production
cp .env.example .env
nano .env

# Start with Docker
docker compose -f docker-compose.yml up -d

# Setup nginx reverse proxy
# See nginx.conf.example in this directory
```

---

## API Reference

```
GET  /health                → { ok: true }
GET  /api/status            → Bot status + cycle info
GET  /api/state             → Full dashboard state (REST)
GET  /api/trades?limit=50   → Recent trades
GET  /api/performance       → Performance metrics
POST /api/bot/start         → Start bot
POST /api/bot/stop          → Stop bot
POST /api/bot/mode          → { mode: "SIMULATION" | "LIVE" }
WS   /ws                    → Real-time state stream
```

---

## Extending the Edge

### More Signal Sources
- **Sentiment analysis**: Scan Twitter/X for BTC sentiment via Claude API
- **On-chain data**: Use Glassnode/IntoTheBlock for miner flow, exchange flows
- **Options market**: Use BTC options IV to estimate market-implied move probabilities
- **Cross-market arbitrage**: Find price discrepancies between Polymarket and Kalshi

### More Market Types
- ETH, SOL binary markets
- Macro events (Fed rate decisions, CPI prints)
- Sports/politics markets (different edge dynamics)

### Model Improvements
- Replace weighted average with XGBoost/LightGBM trained on historical resolutions
- Add Kalman filter for price tracking
- Use transformer attention over order book sequences

---

## Backtesting

```bash
cd backend

# Download historical Polymarket data
python -m tools.download_history --market-type BTC --days 30

# Run backtest
python -m tools.backtest \
  --start 2024-01-01 \
  --end 2024-03-01 \
  --min-edge 0.02 \
  --kelly 0.25

# Output: win rate, PnL curve, Sharpe ratio, max drawdown
```

---

## Paper Trading Checklist

Before going live, verify in simulation for at least 2 weeks:

- [ ] Win rate consistently > 52% (accounting for spread)
- [ ] Sharpe ratio > 2.0
- [ ] Max drawdown < 10%
- [ ] Profit factor > 1.5
- [ ] No single trade > 5% of bankroll
- [ ] Daily PnL variance acceptable
- [ ] Execution latency < 500ms
- [ ] Daily drawdown circuit breaker triggers correctly

---

## File Structure

```
polymarket-dashboard/
├── frontend/                 Next.js 14 dashboard
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx         Main dashboard page
│   │   └── globals.css      Dark cyber-quant theme
│   ├── components/dashboard/
│   │   ├── Header.tsx
│   │   ├── WalletPnlCard.tsx
│   │   ├── BiggestWinCard.tsx
│   │   ├── ExecutionCycleCard.tsx
│   │   ├── DecisionTree.tsx  ← Key visual component
│   │   ├── MarketChart.tsx
│   │   ├── PnlChart.tsx
│   │   ├── RobustnessMatrix.tsx
│   │   ├── MonteCarloChart.tsx
│   │   ├── LiveFeed.tsx
│   │   └── InFlightOrders.tsx
│   ├── lib/
│   │   ├── types.ts          TypeScript types
│   │   ├── store.ts          Zustand state management
│   │   ├── utils.ts          Formatting utilities
│   │   └── mockData.ts       Simulation data generator
│   └── hooks/
│       └── useWebSocket.ts   WS connection + simulation fallback
│
├── backend/                  Python FastAPI backend
│   ├── main.py               App entrypoint
│   ├── config.py             Settings from .env
│   ├── bot/
│   │   ├── agent_loop.py     Main trading loop
│   │   ├── fair_value.py     Multi-signal FV estimation
│   │   ├── mispricing_detector.py  Opportunity scanner
│   │   └── risk_manager.py   Position sizing + risk limits
│   ├── simulation/
│   │   └── monte_carlo.py    Vectorized MC simulation
│   ├── api/
│   │   └── websocket.py      WS connection manager
│   └── models/
│       └── schemas.py        Pydantic data models
│
├── docker-compose.yml
├── .env.example
└── README.md
```
