from typing import Optional


def sma(closes: list[float], period: int) -> list[Optional[float]]:
    out: list[Optional[float]] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        out[i] = sum(closes[i - period + 1:i + 1]) / period
    return out


def ema(closes: list[float], period: int) -> list[Optional[float]]:
    out: list[Optional[float]] = [None] * len(closes)
    if len(closes) < period:
        return out
    k = 2.0 / (period + 1)
    out[period - 1] = sum(closes[:period]) / period
    for i in range(period, len(closes)):
        out[i] = closes[i] * k + out[i - 1] * (1.0 - k)
    return out


def rsi(closes: list[float], period: int = 14) -> list[Optional[float]]:
    out: list[Optional[float]] = [None] * len(closes)
    if len(closes) < period + 1:
        return out

    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    def _val(ag: float, al: float) -> float:
        return 100.0 if al == 0 else 100.0 - 100.0 / (1.0 + ag / al)

    out[period] = _val(avg_gain, avg_loss)
    for i in range(period + 1, len(closes)):
        avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period
        out[i] = _val(avg_gain, avg_loss)

    return out


def bollinger(
    closes: list[float], period: int = 20, n_std: float = 2.0
) -> tuple[list[Optional[float]], list[Optional[float]], list[Optional[float]]]:
    mid = sma(closes, period)
    upper: list[Optional[float]] = [None] * len(closes)
    lower: list[Optional[float]] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1:i + 1]
        m = mid[i]
        variance = sum((x - m) ** 2 for x in window) / period
        std = variance ** 0.5
        upper[i] = m + n_std * std
        lower[i] = m - n_std * std
    return mid, upper, lower


def atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> list[Optional[float]]:
    out: list[Optional[float]] = [None] * len(closes)
    if len(closes) < period + 1:
        return out
    tr_list = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        tr_list.append(tr)
    out[period] = sum(tr_list[:period]) / period
    for i in range(period + 1, len(closes)):
        out[i] = (out[i - 1] * (period - 1) + tr_list[i - 1]) / period
    return out
