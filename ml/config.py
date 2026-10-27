"""Central place for file locations.

Every path is derived from this file's location (not from the current working
directory), so scripts work no matter where you launch them from.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DATA_RAW_DIR = ROOT / "data" / "raw"
DATA_SAMPLES_DIR = ROOT / "data" / "samples"
MODELS_DIR = ROOT / "models"
DOCS_DIR = ROOT / "docs"

TRAIN_CSV = DATA_RAW_DIR / "synthetic_train.csv"
VAL_CSV = DATA_RAW_DIR / "synthetic_val.csv"
TEST_CSV = DATA_RAW_DIR / "synthetic_test.csv"
STRESS_CSV = DATA_RAW_DIR / "synthetic_stress_extrapolation.csv"

VESSEL_ROUTES_JSON = DATA_SAMPLES_DIR / "vessel_routes.json"
SPILL_SCENARIO_JSON = DATA_SAMPLES_DIR / "spill_scenario.json"

DEFAULT_MODEL_PATH = MODELS_DIR / "area_model.joblib"
DEFAULT_METADATA_PATH = MODELS_DIR / "area_model_metadata.json"
EVALUATION_REPORT_PATH = DOCS_DIR / "model_evaluation.md"
