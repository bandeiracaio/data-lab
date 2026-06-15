"""
Monte Carlo Simulation
=======================
Runs N path simulations of the trading strategy forward over M trades.
Used to estimate:
  - Expected final portfolio value (mean, P5, P95)
  - Probability of profit
  - Worst-case and best-case scenarios
  - Value-at-Risk (VaR)

Algorithm:
  For each path i in 1..N:
    v = starting_value
    For each trade j in 1..M:
      won = Bernoulli(win_rate)
      pnl = avg_win if won else -avg_loss
      v += pnl + noise
    record v
"""

from __future__ import annotations
import random
import numpy as np
from dataclasses import dataclass
from models.schemas import MonteCarloResult, MonteCarloPath


class MonteCarloSimulator:
    """Fast Monte Carlo engine using numpy for vectorized simulation."""

    def run(
        self,
        starting_value: float,
        win_rate: float,
        avg_win: float,
        avg_loss: float,
        n_trades: int = 100,
        n_paths: int = 80,
        win_vol: float = 0.3,   # relative vol of win size
        loss_vol: float = 0.25, # relative vol of loss size
    ) -> MonteCarloResult:
        """
        Simulate n_paths × n_trades outcomes.

        Returns MonteCarloResult with paths shaped for the dashboard.
        """
        rng = np.random.default_rng()

        # Vectorized: shape (n_paths, n_trades)
        outcomes = rng.random((n_paths, n_trades))  # uniform [0,1]
        wins = outcomes < win_rate

        # Win/loss amounts with log-normal noise
        win_amounts = rng.lognormal(
            mean=np.log(avg_win) - 0.5 * win_vol**2,
            sigma=win_vol,
            size=(n_paths, n_trades),
        )
        loss_amounts = rng.lognormal(
            mean=np.log(avg_loss) - 0.5 * loss_vol**2,
            sigma=loss_vol,
            size=(n_paths, n_trades),
        )

        pnl = np.where(wins, win_amounts, -loss_amounts)  # (n_paths, n_trades)
        cumulative = starting_value + np.cumsum(pnl, axis=1)  # (n_paths, n_trades)

        # Compute percentile paths
        final_values = cumulative[:, -1]
        p5_idx = int(np.argsort(final_values)[int(n_paths * 0.05)])
        p95_idx = int(np.argsort(final_values)[int(n_paths * 0.95)])
        mean_values = cumulative.mean(axis=0)

        # Find path closest to mean at end
        mean_final = float(mean_values[-1])
        closest_to_mean = int(np.argmin(np.abs(final_values - mean_final)))

        paths = []
        for i in range(n_paths):
            is_mean = i == closest_to_mean
            is_p5 = i == p5_idx
            is_p95 = i == p95_idx
            paths.append(MonteCarloPath(
                path_id=i,
                values=[round(float(v), 2) for v in cumulative[i]],
                is_mean=is_mean,
                is_p5=is_p5,
                is_p95=is_p95,
            ))

        win_probability = float(np.mean(final_values > starting_value))
        expected_return = float((mean_final - starting_value) / max(starting_value, 1))

        return MonteCarloResult(
            paths=paths,
            trade_count=n_trades,
            final_mean=float(mean_final),
            final_p5=float(final_values[p5_idx]),
            final_p95=float(final_values[p95_idx]),
            win_probability=win_probability,
            expected_return=expected_return,
        )

    def var(self, result: MonteCarloResult, confidence: float = 0.95) -> float:
        """Value at Risk at given confidence level."""
        final_values = [p.values[-1] for p in result.paths]
        return float(np.percentile(final_values, (1 - confidence) * 100))

    def cvar(self, result: MonteCarloResult, confidence: float = 0.95) -> float:
        """Conditional Value at Risk (Expected Shortfall)."""
        final_values = np.array([p.values[-1] for p in result.paths])
        var = self.var(result, confidence)
        return float(np.mean(final_values[final_values <= var]))
