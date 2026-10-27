"""The feature contract shared by training, evaluation and inference.

If you add or reorder a feature, change it HERE ONLY. Training, the saved model
artifact, `predict.py` and the API all read from this file, which is what keeps
feature order, names and units consistent.
"""
from __future__ import annotations

from typing import Iterable, Mapping

import pandas as pd

# ORDER MATTERS: this is the column order the model is trained and queried with.
FEATURE_COLUMNS: tuple[str, ...] = (
    "initial_area_km2",
    "wind_speed_ms",
    "current_speed_ms",
    "elapsed_hours",
)
TARGET_COLUMN = "area_km2"
GROUP_COLUMN = "scenario_id"  # which simulated incident a row belongs to

FEATURE_INFO: dict[str, dict[str, str]] = {
    "initial_area_km2": {
        "unit": "km^2",
        "description": "Spill footprint area at elapsed_hours = 0.",
    },
    "wind_speed_ms": {
        "unit": "m/s",
        "description": "Wind speed at ~10 m height (scalar, direction not modelled).",
    },
    "current_speed_ms": {
        "unit": "m/s",
        "description": "Surface current speed (scalar, direction not modelled).",
    },
    "elapsed_hours": {
        "unit": "hours",
        "description": "Time since the spill started.",
    },
}
TARGET_INFO = {
    "unit": "km^2",
    "description": "Synthetic footprint area at elapsed_hours.",
}

# Ranges the SYNTHETIC GENERATOR samples from for train / validation / test.
# Inputs outside these ranges are extrapolation; the API warns about that.
GENERATOR_RANGES: dict[str, tuple[float, float]] = {
    "initial_area_km2": (0.5, 20.0),  # sampled log-uniformly
    "wind_speed_ms": (0.0, 20.0),
    "current_speed_ms": (0.0, 1.5),
    "elapsed_hours": (0.0, 72.0),
}

# Deliberately out-of-range ranges for the extrapolation stress test.
STRESS_RANGES: dict[str, tuple[float, float]] = {
    "initial_area_km2": (20.0, 40.0),
    "wind_speed_ms": (20.0, 30.0),
    "current_speed_ms": (1.5, 2.5),
    "elapsed_hours": (72.0, 120.0),
}

EXPECTED_CSV_COLUMNS: tuple[str, ...] = (GROUP_COLUMN, *FEATURE_COLUMNS, TARGET_COLUMN)


def to_feature_frame(rows: Iterable[Mapping[str, float]]) -> pd.DataFrame:
    """Build a DataFrame with exactly FEATURE_COLUMNS, in order, from dict rows."""
    df = pd.DataFrame(list(rows))
    missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing feature(s): {missing}. Expected {list(FEATURE_COLUMNS)}.")
    return df[list(FEATURE_COLUMNS)].astype(float)


def validate_dataset_columns(df: pd.DataFrame, name: str = "dataset") -> None:
    missing = [c for c in EXPECTED_CSV_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"{name} is missing column(s) {missing}. Expected {list(EXPECTED_CSV_COLUMNS)}. "
            "Regenerate with: python ml/generate_data.py"
        )
