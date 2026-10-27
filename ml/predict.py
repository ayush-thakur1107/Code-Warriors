"""Inference: load the saved model artifact and predict spill footprint area.

Used by the FastAPI backend (loaded ONCE at startup) and runnable by hand:

    python ml/predict.py --initial-area 4 --wind 8 --current 0.6 --hours 24

The prediction comes from a model trained on SYNTHETIC data. It is a pipeline
demonstration, not a forecast of a real spill.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import joblib  # noqa: E402
import pandas as pd  # noqa: E402

from ml import config  # noqa: E402
from ml.features import FEATURE_COLUMNS, to_feature_frame  # noqa: E402

TRAIN_HINT = "Generate it with:  python ml/train_model.py   (from the repository root)"


class ModelNotAvailableError(RuntimeError):
    """The model file is missing or unreadable."""


class ModelContractError(RuntimeError):
    """The saved model does not match the current feature definition."""


class AreaPredictor:
    def __init__(self, bundle: dict[str, Any], path: Path):
        self._bundle = bundle
        self._model = bundle["model"]
        self.path = path
        self.feature_columns: list[str] = list(bundle["feature_columns"])
        if self.feature_columns != list(FEATURE_COLUMNS):
            raise ModelContractError(
                f"Saved model expects features {self.feature_columns} but the code uses "
                f"{list(FEATURE_COLUMNS)}. Retrain the model. {TRAIN_HINT}"
            )
        self.feature_ranges: dict[str, list[float]] = bundle.get("feature_ranges", {})

    @classmethod
    def load(cls, path: str | Path | None = None) -> "AreaPredictor":
        path = Path(path) if path else config.DEFAULT_MODEL_PATH
        if not path.exists():
            raise ModelNotAvailableError(f"Model file not found at '{path}'. {TRAIN_HINT}")
        try:
            bundle = joblib.load(path)
        except Exception as exc:  # corrupt file, incompatible scikit-learn version, ...
            raise ModelNotAvailableError(
                f"Could not read model file '{path}' ({type(exc).__name__}: {exc}). "
                f"If you changed Python or scikit-learn versions, retrain. {TRAIN_HINT}"
            ) from exc
        if not isinstance(bundle, dict) or "model" not in bundle or "feature_columns" not in bundle:
            raise ModelNotAvailableError(f"'{path}' is not a valid OCEANTRACE model bundle. {TRAIN_HINT}")
        return cls(bundle, path)

    # ------------------------------------------------------------------ info
    @property
    def info(self) -> dict[str, Any]:
        b = self._bundle
        return {
            "name": b.get("model_name", "unknown"),
            "trained_at": b.get("trained_at"),
            "training_data": b.get("data_source", "synthetic"),
            "feature_names": self.feature_columns,
            "training_rows": b.get("training_rows"),
            "scikit_learn_version": b.get("sklearn_version"),
        }

    def range_warnings(self, values: dict[str, float]) -> list[str]:
        warnings = []
        for name, (lo, hi) in self.feature_ranges.items():
            v = values.get(name)
            if v is not None and (v < lo or v > hi):
                warnings.append(
                    f"{name}={v:g} is outside the synthetic training range [{lo:g}, {hi:g}]; "
                    "the model is extrapolating and the result is unreliable."
                )
        return warnings

    # --------------------------------------------------------------- predict
    def predict_frame(self, frame: pd.DataFrame) -> list[float]:
        X = frame[self.feature_columns]  # enforce training column order
        return [max(0.0, float(v)) for v in self._model.predict(X)]

    def predict(
        self,
        initial_area_km2: float,
        wind_speed_ms: float,
        current_speed_ms: float,
        elapsed_hours: float,
    ) -> dict[str, Any]:
        values = {
            "initial_area_km2": initial_area_km2,
            "wind_speed_ms": wind_speed_ms,
            "current_speed_ms": current_speed_ms,
            "elapsed_hours": elapsed_hours,
        }
        area = self.predict_frame(to_feature_frame([values]))[0]
        return {
            "predicted_area_km2": area,
            "inputs": values,
            "warnings": self.range_warnings(values),
        }


def main() -> None:
    p = argparse.ArgumentParser(description="Predict synthetic-model spill area.")
    p.add_argument("--initial-area", type=float, required=True, help="initial area, km^2")
    p.add_argument("--wind", type=float, required=True, help="wind speed, m/s")
    p.add_argument("--current", type=float, required=True, help="current speed, m/s")
    p.add_argument("--hours", type=float, required=True, help="elapsed hours")
    p.add_argument("--model", type=str, default=None, help="path to model .joblib")
    args = p.parse_args()
    try:
        predictor = AreaPredictor.load(args.model)
    except (ModelNotAvailableError, ModelContractError) as exc:
        raise SystemExit(f"ERROR: {exc}")
    out = predictor.predict(args.initial_area, args.wind, args.current, args.hours)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
