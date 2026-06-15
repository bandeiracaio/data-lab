"""Central configuration — reads from environment / .env file."""

from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # ── App ─────────────────────────────────────────────────────────────────
    APP_NAME: str = "CLAUDE × QUANT"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── Mode ─────────────────────────────────────────────────────────────────
    BOT_MODE: Literal["SIMULATION", "LIVE"] = "SIMULATION"

    # ── Polymarket ───────────────────────────────────────────────────────────
    POLY_API_KEY: str = ""
    POLY_API_SECRET: str = ""
    POLY_PASSPHRASE: str = ""
    POLY_PRIVATE_KEY: str = ""           # Polygon wallet private key (hex)
    POLY_CLOB_URL: str = "https://clob.polymarket.com"
    POLY_GAMMA_URL: str = "https://gamma-api.polymarket.com"
    POLY_DATA_URL: str = "https://data-api.polymarket.com"

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/claudequant"
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Strategy ─────────────────────────────────────────────────────────────
    # Kelly fraction (0.25 = quarter-Kelly, conservative)
    KELLY_FRACTION: float = 0.25
    # Minimum edge to enter (e.g. 0.02 = 2% misprice above fair value)
    MIN_EDGE_PERCENT: float = 0.02
    # Minimum confidence score [0..1] from mispricing model
    MIN_EDGE_CONFIDENCE: float = 0.60
    # Max position size as % of total bankroll
    MAX_POSITION_PCT: float = 0.05
    # Max daily drawdown before halting (5%)
    MAX_DAILY_DRAWDOWN_PCT: float = 0.05
    # Max concurrent open positions
    MAX_CONCURRENT_POSITIONS: int = 10
    # Target cycles per hour
    TARGET_CYCLES_PER_HOUR: int = 32
    # Markets to scan (contract IDs or search terms)
    TARGET_MARKETS: list[str] = ["BTC", "bitcoin", "crypto"]
    # Minimum market liquidity (USDC)
    MIN_MARKET_LIQUIDITY: float = 5_000.0

    # ── Risk ─────────────────────────────────────────────────────────────────
    STARTING_BANKROLL: float = 10_000.0

    # ── Auth (dashboard) ─────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-32-chars-min"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://your-production-domain.com",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
