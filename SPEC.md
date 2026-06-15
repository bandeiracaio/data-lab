# Trading Terminal — Technical Specification

## What This Is

An algorithmic trading terminal: real market data always, rule-based automated strategies,
paper and live execution modes. No AI generation, no black-box ML, no social media theatre.

The video reference shows a bot with real-time P&L, a strategy decision tree, sector heatmap,
in-flight order tracking, and Monte Carlo risk paths. We build the mechanics — not the bait.

---

## Architecture

```
backend/
  main.py          — FastAPI app, WebSocket relay, REST endpoints
  broker.py        — Alpaca client (paper + live, identical interface)
  data.py          — Market data: real-time stream + historical bars
  strategy.py      — Signal engine: rules, filters, sizing
  risk.py          — Position limits, daily loss cap, liquidation score
  execution.py     — Order lifecycle: submit → fill → reconcile
  portfolio.py     — P&L engine, win rate, drawdown, performance

index.html         — Single-file frontend, vanilla JS, no build step
```

**Backend**: Python 3.12, FastAPI, asyncio  
**Frontend**: Vanilla JS, single `index.html`  
**Broker**: Alpaca Markets (paper and live via same SDK, different credentials)  
**Charts**: Lightweight Charts (TradingView open source, CDN)  
**Real-time**: WebSocket — Alpaca stream → backend relay → frontend  

---

## Modes

Two modes, one codebase. The only difference is which credentials are loaded.

| Mode  | Base URL                        | Money at risk |
|-------|---------------------------------|---------------|
| Paper | `paper-api.alpaca.markets`      | No            |
| Live  | `api.alpaca.markets`            | Yes           |

Mode is selected at startup via environment variable `TRADE_MODE=paper|live`.
The frontend displays the active mode in the header at all times. Switching modes
requires restarting the backend — no hot-switch, by design.

Credentials are stored in `.env`, never in code, never sent to the frontend.

---

## Data Sources

### Alpaca
- **Account**: positions, orders, portfolio history, buying power
- **Market data**: real-time quotes + trades via WebSocket (IEX feed, free)
- **Historical bars**: OHLCV, 1m/5m/15m/1h/1d timeframes, via REST

### No other paid data sources required for v1.

Historical data beyond Alpaca's retention can be filled from `yfinance` (Python),
used only for backtesting, never for live signal generation.

---

## Backend API (FastAPI)

All endpoints served at `http://localhost:8000`.

### WebSocket `/ws`
Frontend connects here. Backend relays:
```
{ type: "quote",     symbol, bid, ask, last, timestamp }
{ type: "trade",     symbol, price, size, timestamp }
{ type: "bar",       symbol, open, high, low, close, volume, timestamp }
{ type: "position",  symbol, qty, side, avg_entry, unrealized_pnl, market_value }
{ type: "order",     id, symbol, side, qty, type, status, filled_qty, filled_avg }
{ type: "account",   equity, cash, buying_power, daily_pnl, total_pnl }
{ type: "signal",    symbol, strategy, direction, confidence, reason }
{ type: "fill",      order_id, symbol, side, qty, price, timestamp }
```

### REST Endpoints
```
GET  /state              — Full snapshot: account, positions, open orders, watchlist
GET  /bars/:symbol       — Historical OHLCV bars (params: timeframe, limit)
POST /order              — Place order { symbol, side, qty, type, limit_price? }
DELETE /order/:id        — Cancel order
POST /watchlist          — Add symbol
DELETE /watchlist/:symbol
GET  /performance        — Win rate, avg win, avg loss, max drawdown, Sharpe
GET  /strategy/status    — Active strategies, last signal per symbol, decision log
POST /strategy/:name/toggle — Enable/disable a strategy
```

---

## Frontend Layout

Single-page, no routing. Fixed layout, dense information, no animations.

```
┌─────────────────────────────────────────────────────────┐
│ HEADER: mode badge | account equity | daily P&L | time  │
├───────────────────────┬─────────────────────────────────┤
│                       │ POSITIONS PANEL                 │
│  CHART                │ symbol | qty | entry | P&L      │
│  candlestick + volume │─────────────────────────────────│
│  indicators overlay   │ ORDERS PANEL                    │
│                       │ id | symbol | type | status     │
├───────────────────────┴─────────────────────────────────┤
│ WATCHLIST: symbol | last | change% | bid/ask spread     │
├─────────────────────────────────────────────────────────┤
│ STRATEGY LOG: timestamp | symbol | signal | action      │
├────────────────────────┬────────────────────────────────┤
│ PERFORMANCE            │ RISK                           │
│ total P&L | win rate   │ liq risk | daily loss % cap    │
│ avg win | avg loss     │ max drawdown | position conc.  │
└────────────────────────┴────────────────────────────────┘
```

### Chart Panel
- Lightweight Charts candlestick series
- Volume histogram below
- Overlay: SMA 20, SMA 50, VWAP
- Separate pane: RSI (14), MACD
- Symbol selector — click watchlist row to switch

### Positions Panel
- One row per open position
- Columns: symbol, side (long/short), qty, avg entry, last price, unrealized P&L ($), unrealized P&L (%)
- Color: green for profit, red for loss
- Sorted by unrealized P&L descending
- Click row: closes position at market (with confirmation)

### Orders Panel
- Open + recently filled orders
- Columns: symbol, side, type, qty, limit price, status, filled qty, filled avg
- Cancel button for open orders

### Watchlist
- User-managed list of symbols
- Real-time last price, change from prev close, bid/ask spread
- Click: loads symbol into chart

### Order Entry
- Triggered by keyboard shortcut or clicking a symbol
- Fields: symbol, side (buy/sell), qty, type (market/limit/stop/stop-limit), prices
- Estimated cost and % of buying power shown before submit
- Paper mode: submits to Alpaca paper API
- Live mode: submits to Alpaca live API with explicit confirmation prompt

### Strategy Log
- Scrolling log of every signal generated and action taken
- Format: `[HH:MM:SS] AAPL  MOMENTUM  LONG  conf=0.74  → BUY 10 @ market`
- Color-coded by outcome once filled: green fill, red fill, grey skipped

---

## Strategy Engine

Rule-based only. Every decision is traceable to a specific condition being true or false.

### Signal Pipeline
```
MarketData → Indicators → Conditions → Filter → Sizer → OrderRequest
```

1. **Indicators**: computed on each new bar for each watched symbol
2. **Conditions**: a set of boolean rules, all must be true for a signal
3. **Filter**: risk engine checks — if any filter fails, signal is dropped (logged why)
4. **Sizer**: Kelly fraction on estimated edge, capped by max position size
5. **OrderRequest**: submitted to execution engine

### Built-in Strategies (Phase 2)

**Momentum**
- Condition: close > SMA20 > SMA50, RSI between 50–70, volume > 1.5x avg20
- Direction: long only
- Exit: close < SMA20, or stop at entry × (1 - stop_pct)

**Mean Reversion**
- Condition: RSI < 30, price > lower Bollinger Band (2σ), volume spike
- Direction: long only (short disabled by default)
- Exit: RSI > 50, or take profit at +X%

**Opening Range Breakout**
- Condition: price breaks above/below first 30-min candle range with volume
- Direction: both sides
- Exit: end of day (no overnight positions)

### Strategy Config (per strategy, in config.json)
```json
{
  "enabled": true,
  "symbols": ["AAPL", "MSFT", "SPY"],
  "max_position_pct": 0.05,
  "stop_pct": 0.02,
  "take_profit_pct": 0.04,
  "kelly_fraction": 0.25
}
```

### Phase 1 (no automation)
In Phase 1, strategies are disabled. The terminal is a manual trading dashboard.
Signal engine is wired up in Phase 2.

---

## Risk Engine

Checked before every order submission. If any check fails, order is rejected.

| Check                  | Default Limit         | Description                              |
|------------------------|-----------------------|------------------------------------------|
| Max position size      | 5% of equity          | No single position > N% of account      |
| Daily loss cap         | 2% of equity          | Halt all trading if daily P&L < -N%     |
| Max open positions     | 10                    | No new orders if count ≥ N              |
| Concentration          | 20% in one sector     | Based on symbol's GICS sector           |
| Liquidity risk score   | Reject if score > 7   | See below                               |

**Liquidity Risk Score** (1–10):
- Portfolio beta vs SPY weighted by position sizes
- Inverse of average bid/ask spread across positions
- Days-to-cover on smallest position
- Higher = more dangerous in a fast market

---

## P&L and Performance

Computed on the backend from fill history, updated on every fill event.

| Metric          | Formula                                         |
|-----------------|-------------------------------------------------|
| Total P&L       | Sum of all realized P&L + current unrealized    |
| Daily P&L       | Same, scoped to today's fills + open positions  |
| Win rate        | wins / (wins + losses), where win = realized > 0 |
| Avg win         | Mean realized P&L of profitable closed trades   |
| Avg loss        | Mean realized P&L of losing closed trades       |
| Profit factor   | Sum(wins) / abs(Sum(losses))                    |
| Max drawdown    | Peak-to-trough on running portfolio equity      |
| Sharpe (daily)  | mean(daily_returns) / std(daily_returns) × √252 |

---

## Monte Carlo Risk Paths

Available as a panel (toggleable, heavy computation runs in background thread).

- Input: historical daily returns of current portfolio (last 252 trading days)
- Method: bootstrap resampling of returns, 1,000 paths, 21 days forward
- Output: 5th/50th/95th percentile equity curves, probability of hitting daily loss cap
- Runs once per minute, or on demand
- Displayed as a line fan chart (Lightweight Charts)

---

## Sector Heatmap

- Symbols in watchlist grouped by GICS sector (from static lookup table, no API call)
- Color: green = up from prev close, red = down, intensity = magnitude
- Updated on each quote tick
- Click sector: filter watchlist to that sector

---

## Environment Setup

```
backend/
  requirements.txt     alpaca-py, fastapi, uvicorn, websockets, pandas, numpy, python-dotenv
.env                   TRADE_MODE, ALPACA_KEY, ALPACA_SECRET, ALPACA_PAPER_KEY, ALPACA_PAPER_SECRET
config.json            strategy configs, watchlist, risk limits
```

`.env` is gitignored. Never committed.

Start:
```bash
cd backend && uvicorn main:app --reload --port 8000
# open index.html in browser
```

---

## Implementation Phases

### Phase 1 — Foundation (Manual Terminal)
- [ ] Backend skeleton: FastAPI, WebSocket relay, Alpaca connection
- [ ] Paper/live mode switching via env var
- [ ] Real-time quote streaming to frontend
- [ ] Account state endpoint (equity, cash, buying power)
- [ ] Positions and orders display
- [ ] Manual order entry (market + limit)
- [ ] Candlestick chart with real-time bar updates
- [ ] Watchlist with live quotes
- [ ] Basic P&L display (unrealized only, from Alpaca)

### Phase 2 — Strategy Engine
- [ ] Indicator computation (SMA, EMA, RSI, MACD, Bollinger, VWAP)
- [ ] Momentum strategy
- [ ] Risk engine checks before every order
- [ ] Strategy log panel
- [ ] Kelly position sizer
- [ ] Signal confidence display

### Phase 3 — Advanced
- [ ] Mean reversion strategy
- [ ] Opening range breakout strategy
- [ ] Realized P&L tracking and performance metrics
- [ ] Sector heatmap
- [ ] Monte Carlo risk paths
- [ ] Strategy enable/disable toggle per symbol
- [ ] Historical backtesting (offline, not real-time)

### Phase 4 — Polish
- [ ] Keyboard shortcuts for order entry, chart navigation
- [ ] Alert system (price level, RSI threshold)
- [ ] Export: fill history CSV, performance report
- [ ] Dark theme only (no theme switcher — this is a tool, not a demo)

---

## What This Is Not

- Not a chatbot or LLM integration
- Not a social media dashboard
- Not a demo of constantly-increasing fake P&L
- Not a backtesting-only tool
- Not a signal subscription service

The win rate is whatever it actually is. The P&L shows the real number, positive or negative.
