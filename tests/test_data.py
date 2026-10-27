"""The generated CSVs / JSON have the expected columns, valid values and no leakage."""
import json

import numpy as np
import pandas as pd
import pytest

from ml import config
from ml.features import EXPECTED_CSV_COLUMNS, FEATURE_COLUMNS, GENERATOR_RANGES, GROUP_COLUMN, STRESS_RANGES, TARGET_COLUMN

SPLITS = {
    "train": (config.TRAIN_CSV, GENERATOR_RANGES),
    "val": (config.VAL_CSV, GENERATOR_RANGES),
    "test": (config.TEST_CSV, GENERATOR_RANGES),
    "stress": (config.STRESS_CSV, STRESS_RANGES),
}


@pytest.mark.parametrize("name", SPLITS)
def test_columns_and_values(name):
    path, ranges = SPLITS[name]
    df = pd.read_csv(path)
    assert tuple(df.columns) == EXPECTED_CSV_COLUMNS
    assert not df.isna().any().any()
    assert (df[TARGET_COLUMN] > 0).all()
    for col, (lo, hi) in ranges.items():
        assert df[col].between(lo, hi).all(), f"{name}.{col} outside [{lo}, {hi}]"


def test_scenarios_are_disjoint_across_splits():
    ids = {n: set(pd.read_csv(p)[GROUP_COLUMN]) for n, (p, _) in SPLITS.items()}
    names = list(ids)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            assert not (ids[a] & ids[b]), f"scenario ids shared between {a} and {b}"


def test_no_duplicate_scenarios_across_train_and_test():
    """Different seeds -> different input combinations (no near-duplicate scenarios)."""
    def combos(p):
        df = pd.read_csv(p).drop_duplicates(GROUP_COLUMN)
        return {tuple(np.round(r, 4)) for r in df[list(FEATURE_COLUMNS[:3])].to_numpy()}
    assert not (combos(config.TRAIN_CSV) & combos(config.TEST_CSV))
    assert not (combos(config.TRAIN_CSV) & combos(config.VAL_CSV))


def test_sample_json_files():
    vessels = json.loads(config.VESSEL_ROUTES_JSON.read_text())
    assert vessels["synthetic"] is True and len(vessels["vessels"]) >= 3
    for v in vessels["vessels"]:
        assert v["vessel_id"].startswith("SYN-")
        assert v["reports"] == sorted(v["reports"], key=lambda r: r["timestamp"])
        for r in v["reports"]:
            assert -90 <= r["latitude"] <= 90 and -180 <= r["longitude"] <= 180
    scenario = json.loads(config.SPILL_SCENARIO_JSON.read_text())
    assert scenario["synthetic"] is True
    for k in ("initial_area_km2", "wind_speed_ms", "current_speed_ms", "elapsed_hours"):
        assert k in scenario
