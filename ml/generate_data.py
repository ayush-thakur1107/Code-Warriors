"""Generate the SYNTHETIC spill-area datasets (train / validation / test / stress).

    python ml/generate_data.py

NOTHING in these files is real. The "ground truth" is a made-up formula
(`expected_area_km2` below) plus random noise. It is shaped to be qualitatively
plausible (spreading grows with time, wind and current; strong wind disperses
oil) but it is NOT validated oil-spill physics.

Splitting strategy
------------------
One *scenario* = one simulated incident with fixed inputs and a fixed hidden
"scenario factor". It contributes several rows (one per time step). Rows from the
same scenario are strongly correlated, so every split is generated from a
DIFFERENT random seed with its own scenario ids: a scenario never appears in more
than one split. (Splitting rows of one scenario across train and test would leak
information and inflate scores.)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from ml import config  # noqa: E402
from ml.features import (  # noqa: E402
    FEATURE_COLUMNS,
    GENERATOR_RANGES,
    GROUP_COLUMN,
    STRESS_RANGES,
    TARGET_COLUMN,
)

TIMES_PER_SCENARIO = 10
SCENARIO_FACTOR_SIGMA = 0.10  # hidden per-scenario multiplicative variation (log-normal sigma)
ROW_NOISE_SIGMA = 0.03  # per-row multiplicative noise (log-normal sigma)

SEEDS = {"train": 11, "val": 22, "test": 33, "stress": 44}
SIZES = {"train": 300, "val": 80, "test": 80, "stress": 60}  # scenarios per split


def expected_area_km2(
    initial_area_km2: np.ndarray | float,
    wind_speed_ms: np.ndarray | float,
    current_speed_ms: np.ndarray | float,
    elapsed_hours: np.ndarray | float,
) -> np.ndarray:
    """The noise-free toy 'physics' used to label the synthetic data.

    area = A0 * spreading * dispersion
      spreading  = 1 + 0.35 * sqrt(t) * (1 + 0.06*wind + 0.5*current)
      dispersion = exp(-0.002 * t * max(0, wind - 8))   # strong wind breaks up slicks

    Pure invention for demonstration. Do not cite it as oil-spill science.
    """
    a0 = np.asarray(initial_area_km2, dtype=float)
    wind = np.asarray(wind_speed_ms, dtype=float)
    cur = np.asarray(current_speed_ms, dtype=float)
    t = np.asarray(elapsed_hours, dtype=float)
    spreading = 1.0 + 0.35 * np.sqrt(t) * (1.0 + 0.06 * wind + 0.5 * cur)
    dispersion = np.exp(-0.002 * t * np.maximum(0.0, wind - 8.0))
    return a0 * spreading * dispersion


def generate_split(
    prefix: str,
    n_scenarios: int,
    seed: int,
    ranges: dict[str, tuple[float, float]] = GENERATOR_RANGES,
    times_per_scenario: int = TIMES_PER_SCENARIO,
) -> pd.DataFrame:
    """Create one dataset split. Each scenario gets t=0 plus random later times."""
    rng = np.random.default_rng(seed)

    a_lo, a_hi = ranges["initial_area_km2"]
    t_lo, t_hi = ranges["elapsed_hours"]

    area0 = np.exp(rng.uniform(np.log(a_lo), np.log(a_hi), n_scenarios))  # log-uniform
    wind = rng.uniform(*ranges["wind_speed_ms"], n_scenarios)
    current = rng.uniform(*ranges["current_speed_ms"], n_scenarios)
    scenario_factor = rng.lognormal(0.0, SCENARIO_FACTOR_SIGMA, n_scenarios)

    rows = []
    for i in range(n_scenarios):
        # First row sits at the start of the allowed time range; the rest are random.
        times = np.concatenate(([t_lo], np.sort(rng.uniform(t_lo, t_hi, times_per_scenario - 1))))
        base = expected_area_km2(area0[i], wind[i], current[i], times)
        noise = rng.lognormal(0.0, ROW_NOISE_SIGMA, times_per_scenario)
        area = base * scenario_factor[i] * noise
        for t, a in zip(times, area):
            rows.append(
                {
                    GROUP_COLUMN: f"{prefix}-{i:04d}",
                    "initial_area_km2": round(float(area0[i]), 4),
                    "wind_speed_ms": round(float(wind[i]), 4),
                    "current_speed_ms": round(float(current[i]), 4),
                    "elapsed_hours": round(float(t), 4),
                    TARGET_COLUMN: round(float(a), 4),
                }
            )
    df = pd.DataFrame(rows)
    return df[[GROUP_COLUMN, *FEATURE_COLUMNS, TARGET_COLUMN]]


def main() -> None:
    config.DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
    plan = [
        ("train", "train", config.TRAIN_CSV, GENERATOR_RANGES),
        ("val", "val", config.VAL_CSV, GENERATOR_RANGES),
        ("test", "test", config.TEST_CSV, GENERATOR_RANGES),
        ("stress", "stress", config.STRESS_CSV, STRESS_RANGES),
    ]
    for key, prefix, path, ranges in plan:
        df = generate_split(prefix, SIZES[key], SEEDS[key], ranges)
        df.to_csv(path, index=False)
        print(f"wrote {path.relative_to(config.ROOT)}  rows={len(df)}  scenarios={df[GROUP_COLUMN].nunique()}")
    print("Done. All data is SYNTHETIC.")


if __name__ == "__main__":
    main()
