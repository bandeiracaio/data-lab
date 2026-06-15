"""
Polymarket API Client
=====================
Two modes:

READ-ONLY (no credentials):
  - Fetch active markets via Gamma API
  - Fetch real-time order books via CLOB API
  - Fetch current prices
  → Enables real data on the dashboard with zero account setup

TRADING (credentials required):
  - Place limit/market orders via py-clob-client
  - Cancel orders
  - Query positions and balances
  → Requires Polygon wallet + API keys from polymarket.com/settings

Polymarket API docs: https://docs.polymarket.com
py-clob-client: https://github.com/Polymarket/py-clob-client
"""

from __future__ import annotations
import asyncio
import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Public endpoints (no auth) ────────────────────────────────────────────────
GAMMA_URL   = "https://gamma-api.polymarket.com"
CLOB_URL    = "https://clob.polymarket.com"
DATA_URL    = "https://data-api.polymarket.com"

# Polygon mainnet chain ID
CHAIN_ID = 137


class PolymarketReadClient:
    """
    Public read-only client. Requires no credentials.
    Uses only official public REST endpoints.

    Install: pip install httpx
    """

    def __init__(self, timeout: float = 10.0):
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={"User-Agent": "claude-quant-bot/1.0"},
        )
        self._rate_limit_delay = 0.2  # 200ms between requests (5 req/sec conservative)
        self._last_request = 0.0

    async def _get(self, url: str, params: dict | None = None) -> dict | list:
        # Gentle rate limiting
        elapsed = time.time() - self._last_request
        if elapsed < self._rate_limit_delay:
            await asyncio.sleep(self._rate_limit_delay - elapsed)
        self._last_request = time.time()

        resp = await self._client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    # ── Market discovery ─────────────────────────────────────────────────────

    async def get_markets(
        self,
        keyword: str = "bitcoin",
        active: bool = True,
        limit: int = 50,
    ) -> list[dict]:
        """
        Fetch active markets from Gamma API.

        Returns list of market dicts with keys:
          conditionId, question, slug, tokens (YES/NO token IDs),
          volume, liquidity, startDate, endDate, active, closed
        """
        data = await self._get(f"{GAMMA_URL}/markets", params={
            "active":   "true" if active else "false",
            "closed":   "false",
            "limit":    limit,
            "order":    "volume",
            "ascending":"false",
        })
        markets = data if isinstance(data, list) else data.get("markets", [])

        # Filter by keyword if provided
        if keyword:
            kw = keyword.lower()
            markets = [
                m for m in markets
                if kw in m.get("question", "").lower()
                or kw in m.get("slug", "").lower()
            ]
        return markets

    async def get_market(self, condition_id: str) -> dict:
        """Fetch a single market by conditionId."""
        data = await self._get(f"{GAMMA_URL}/markets/{condition_id}")
        return data

    # ── Order book ───────────────────────────────────────────────────────────

    async def get_order_book(self, token_id: str) -> dict:
        """
        Fetch the live order book for a token (YES or NO outcome).

        token_id is the outcome token ID (NOT the conditionId).
        Each market has two tokens: YES and NO.
        Get them via market["tokens"][0]["token_id"] (YES)
                     market["tokens"][1]["token_id"] (NO)

        Returns:
          {
            "bids": [{"price": "0.52", "size": "150.00"}, ...],
            "asks": [{"price": "0.54", "size": "200.00"}, ...],
          }
        Prices are in USDC per share (0..1).
        """
        data = await self._get(f"{CLOB_URL}/book", params={"token_id": token_id})
        return data

    async def get_price(self, token_id: str, side: str = "buy") -> float:
        """
        Fetch the current best price for a token.

        side: "buy" (best ask) or "sell" (best bid)
        Returns float 0..1
        """
        data = await self._get(f"{CLOB_URL}/price", params={
            "token_id": token_id,
            "side": side,
        })
        return float(data.get("price", 0.5))

    async def get_midpoint(self, token_id: str) -> float:
        """Fetch the current midpoint price."""
        data = await self._get(f"{CLOB_URL}/midpoint", params={"token_id": token_id})
        return float(data.get("mid", 0.5))

    async def get_spread(self, token_id: str) -> dict:
        """Fetch bid/ask/spread for a token."""
        data = await self._get(f"{CLOB_URL}/spread", params={"token_id": token_id})
        return data  # {"bid": "0.51", "ask": "0.53", "spread": "0.02"}

    # ── Trade history ─────────────────────────────────────────────────────────

    async def get_recent_trades(self, token_id: str, limit: int = 20) -> list[dict]:
        """
        Fetch recent fill history for a token.

        Returns list of trades with: price, size, side, timestamp
        """
        data = await self._get(f"{CLOB_URL}/trades", params={
            "token_id": token_id,
            "limit": limit,
        })
        return data if isinstance(data, list) else data.get("history", [])

    # ── Convenience: full snapshot ────────────────────────────────────────────

    async def get_full_snapshot(self, market: dict) -> dict | None:
        """
        Given a market dict from get_markets(), fetch order book + prices
        for the YES token. Returns combined dict ready for FairValueEngine.

        Returns None on error (market might be illiquid or closed).
        """
        tokens = market.get("tokens", [])
        if not tokens:
            return None

        # Convention: tokens[0] = YES, tokens[1] = NO
        yes_token = tokens[0].get("token_id", "")
        if not yes_token:
            return None

        try:
            ob, recent_trades = await asyncio.gather(
                self.get_order_book(yes_token),
                self.get_recent_trades(yes_token, limit=20),
                return_exceptions=True,
            )
            if isinstance(ob, Exception) or isinstance(recent_trades, Exception):
                return None

            bids = ob.get("bids", [])
            asks = ob.get("asks", [])
            best_bid = float(bids[0]["price"]) if bids else 0.45
            best_ask = float(asks[0]["price"]) if asks else 0.55
            bid_vol  = sum(float(b.get("size", 0)) for b in bids[:5])
            ask_vol  = sum(float(a.get("size", 0)) for a in asks[:5])

            return {
                "condition_id":  market.get("conditionId", ""),
                "question":      market.get("question", ""),
                "yes_token_id":  yes_token,
                "best_bid":      best_bid,
                "best_ask":      best_ask,
                "mid_price":     (best_bid + best_ask) / 2,
                "spread":        best_ask - best_bid,
                "bid_volume":    bid_vol,
                "ask_volume":    ask_vol,
                "total_liquidity": bid_vol + ask_vol,
                "recent_trades": recent_trades if isinstance(recent_trades, list) else [],
                "volume":        float(market.get("volume", 0)),
                "end_date":      market.get("endDate", ""),
            }
        except Exception as e:
            logger.debug(f"Snapshot error for {market.get('conditionId','?')}: {e}")
            return None

    async def close(self):
        await self._client.aclose()


# ── Trading client (requires credentials) ────────────────────────────────────

class PolymarketTradingClient(PolymarketReadClient):
    """
    Full trading client. Wraps py-clob-client for order placement.

    Required install: pip install py-clob-client

    Credentials needed:
      1. api_key, api_secret, api_passphrase  ← from polymarket.com/settings
      2. private_key                           ← Polygon wallet hex key (0x...)

    IMPORTANT: Use a dedicated trading wallet. Never use a wallet that
    holds significant funds beyond your trading allocation.
    """

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        api_passphrase: str,
        private_key: str,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._api_key = api_key
        self._api_secret = api_secret
        self._api_passphrase = api_passphrase
        self._private_key = private_key
        self._clob_client = None
        self._initialized = False

    def _init_clob_client(self):
        """Lazy-initialize py-clob-client (import only when actually needed)."""
        if self._initialized:
            return

        try:
            from py_clob_client.client import ClobClient
            from py_clob_client.clob_types import ApiCreds

            creds = ApiCreds(
                api_key=self._api_key,
                api_secret=self._api_secret,
                api_passphrase=self._api_passphrase,
            )

            self._clob_client = ClobClient(
                host=CLOB_URL,
                chain_id=CHAIN_ID,
                private_key=self._private_key,
                creds=creds,
                signature_type=1,  # EIP-712
            )
            self._initialized = True
            logger.info("Polymarket CLOB client initialized")

        except ImportError:
            raise RuntimeError(
                "py-clob-client not installed.\n"
                "Run: pip install py-clob-client"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to initialize CLOB client: {e}")

    async def place_limit_order(
        self,
        token_id: str,
        price: float,     # 0..1 (e.g. 0.52 = 52¢)
        size_usdc: float, # how much USDC to risk
        side: str = "BUY",
    ) -> dict:
        """
        Place a limit order.

        token_id: YES outcome token ID
        price:    limit price in USDC per share (0..1)
        size_usdc: USDC amount to spend (NOT shares — we convert)
        side:     "BUY" or "SELL"

        Returns the order response dict from Polymarket.
        """
        self._init_clob_client()

        try:
            from py_clob_client.clob_types import OrderArgs, OrderType, MarketOrderArgs

            # Convert USDC budget to shares
            # If buying at 0.52, $100 buys 100/0.52 = 192.3 shares
            shares = size_usdc / max(price, 0.01) if side == "BUY" else size_usdc

            order_args = OrderArgs(
                token_id=token_id,
                price=round(price, 4),
                size=round(shares, 2),
                side=side,
                order_type=OrderType.GTC,   # Good Till Cancelled
            )

            # Create and sign the order
            signed_order = await asyncio.to_thread(
                self._clob_client.create_order, order_args
            )

            # Post to CLOB
            response = await asyncio.to_thread(
                self._clob_client.post_order, signed_order, OrderType.GTC
            )
            logger.info(f"Order placed: {side} {shares:.1f} shares @ {price:.3f} → {response}")
            return response

        except Exception as e:
            logger.error(f"Order placement failed: {e}")
            raise

    async def cancel_order(self, order_id: str) -> dict:
        """Cancel an open order by ID."""
        self._init_clob_client()
        return await asyncio.to_thread(self._clob_client.cancel, order_id)

    async def cancel_all_orders(self) -> dict:
        """Cancel all open orders (emergency stop)."""
        self._init_clob_client()
        return await asyncio.to_thread(self._clob_client.cancel_all)

    async def get_open_orders(self) -> list[dict]:
        """Fetch all open orders for this account."""
        self._init_clob_client()
        result = await asyncio.to_thread(self._clob_client.get_orders)
        return result if isinstance(result, list) else []

    async def get_positions(self) -> list[dict]:
        """Fetch current positions."""
        self._init_clob_client()
        result = await asyncio.to_thread(self._clob_client.get_positions)
        return result if isinstance(result, list) else []

    async def get_balance_usdc(self) -> float:
        """Return available USDC balance."""
        self._init_clob_client()
        result = await asyncio.to_thread(self._clob_client.get_balance_allowance, {})
        return float(result.get("balance", 0)) / 1e6  # USDC has 6 decimals

    async def derive_api_key(self) -> dict:
        """
        First-time setup: derive API key from wallet signature.
        Run this ONCE to get your api_key/secret/passphrase, then
        store them in .env. You do NOT need to run this every time.

        Returns: {"apiKey": "...", "secret": "...", "passphrase": "..."}
        """
        self._init_clob_client()
        result = await asyncio.to_thread(self._clob_client.derive_api_key)
        return result
