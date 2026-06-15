# Trading Terminal

Algorithmic trading terminal — real market data, paper and live execution, rule-based strategies.

## Modes

- **Paper**: Alpaca paper account. Real data, simulated fills. No money at risk.
- **Live**: Alpaca live account. Real fills. Real money.

Same codebase, different credentials. Mode is set in `.env`, shown permanently in the UI header.

## Stack

- **Backend**: Python / FastAPI / asyncio — broker API, WebSocket relay, strategy engine
- **Frontend**: Single `index.html` — vanilla JS, no build step
- **Broker**: [Alpaca Markets](https://alpaca.markets) — free paper + live trading API
- **Charts**: [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) — TradingView open source

## Setup

```bash
# 1. Copy env template and fill in your Alpaca credentials
cp .env.example .env

# 2. Install backend dependencies
pip install -r backend/requirements.txt

# 3. Start backend
cd backend && uvicorn main:app --port 8000

# 4. Open index.html in your browser
```

## Spec

See [SPEC.md](SPEC.md) for full technical specification, architecture, and implementation phases.
