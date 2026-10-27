"""Evaluate the trained model against simple baselines and write a Markdown report.

    python ml/evaluate.py

Run automatically at the end of `train_model.py`. Reads the saved model, so train first.

IMPORTANT: every dataset here comes from the same synthetic generator. These numbers
measure how well the model reproduces THAT synthetic process. They say nothing about
real oil-spill prediction accuracy.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.linear_model import LinearRegression  # noqa: E402

from ml import config  # noqa: E402
from ml.features import FEATURE_COLUMNS, GROUP_COLUMN, TARGET_COLUMN, validate_dataset_columns  # noqa: E402
from ml.generate_data import expected_area_km2  # noqa: E402
from ml.predict import AreaPredictor, ModelContractError, ModelNotAvailableError  # noqa: E402

MODEL_LABEL = "Gradient boosting (our model)"


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    err = y_pred - y_true
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err**2)))
    ss_res = float(np.sum(err**2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    mdape = float(np.median(np.abs(err) / np.maximum(y_true, 1e-9)) * 100.0)
    return {"MAE_km2": mae, "RMSE_km2": rmse, "R2": r2, "median_abs_pct_error": mdape}


def load_split(path: Path, name: str) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Generate data with: python ml/generate_data.py")
    df = pd.read_csv(path)
    validate_dataset_columns(df, name)
    return df


def evaluate_all(predictor: AreaPredictor) -> dict[str, Any]:
    """Return {split_name: {"rows", "scenarios", "metrics": {model_name: {...}}}}."""
    train = load_split(config.TRAIN_CSV, "train")
    splits = {
        "validation": load_split(config.VAL_CSV, "validation"),
        "test": load_split(config.TEST_CSV, "test"),
        "stress (out-of-range)": load_split(config.STRESS_CSV, "stress"),
    }

    mean_area = float(train[TARGET_COLUMN].mean())
    linear = LinearRegression().fit(train[list(FEATURE_COLUMNS)], train[TARGET_COLUMN])

    results: dict[str, Any] = {}
    for name, df in splits.items():
        X = df[list(FEATURE_COLUMNS)]
        y = df[TARGET_COLUMN].to_numpy()
        preds = {
            "Baseline: always predict the training mean": np.full(len(df), mean_area),
            "Baseline: no growth (area = initial area)": df["initial_area_km2"].to_numpy(),
            "Baseline: linear regression": linear.predict(X),
            MODEL_LABEL: np.array(predictor.predict_frame(df)),
            "Reference: generator's own noise-free formula": expected_area_km2(
                df["initial_area_km2"], df["wind_speed_ms"], df["current_speed_ms"], df["elapsed_hours"]
            ),
        }
        results[name] = {
            "rows": int(len(df)),
            "scenarios": int(df[GROUP_COLUMN].nunique()),
            "metrics": {k: compute_metrics(y, v) for k, v in preds.items()},
        }
    return results


def _table(metrics: dict[str, dict[str, float]]) -> str:
    lines = [
        "| Model | MAE (km²) | RMSE (km²) | R² | Median abs. % error |",
        "|---|---:|---:|---:|---:|",
    ]
    for name, m in metrics.items():
        lines.append(
            f"| {name} | {m['MAE_km2']:.3f} | {m['RMSE_km2']:.3f} | {m['R2']:.3f} | {m['median_abs_pct_error']:.1f}% |"
        )
    return "\n".join(lines)


def build_report(results: dict[str, Any], predictor: AreaPredictor) -> str:
    test_m = results["test"]["metrics"][MODEL_LABEL]
    stress_m = results["stress (out-of-range)"]["metrics"][MODEL_LABEL]
    ref_m = results["test"]["metrics"]["Reference: generator's own noise-free formula"]
    ratio = stress_m["MAE_km2"] / test_m["MAE_km2"] if test_m["MAE_km2"] > 0 else float("nan")

    parts = [
        "# OCEANTRACE model evaluation report",
        "",
        "> **Read this first.** All data below is SYNTHETIC and comes from one invented generator "
        "(`ml/generate_data.py`). These metrics show how well the model reproduces that synthetic "
        "process. They do **not** establish accuracy on real oil spills. No real observations, "
        "satellite imagery or AIS records were used.",
        "",
        f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `ml/evaluate.py` "
        f"· model trained {predictor.info.get('trained_at')} "
        f"· scikit-learn {predictor.info.get('scikit_learn_version')}. "
        "Re-running training can change numbers slightly across library versions._",
        "",
        "## Setup",
        "",
        f"- **Task:** regression, predict footprint area `{TARGET_COLUMN}` (km²).",
        f"- **Features (in order):** {', '.join(f'`{c}`' for c in FEATURE_COLUMNS)}.",
        "- **Model:** scikit-learn `GradientBoostingRegressor` (fixed hyper-parameters, no tuning on the test set).",
        "- **Splits:** train / validation / test come from different random seeds with disjoint "
        "scenario ids, so no simulated incident appears in two splits. Rows inside one scenario "
        "are never separated.",
        "- **Stress set:** every input deliberately outside the training range, to show extrapolation failure.",
        "",
    ]
    for name, res in results.items():
        parts += [
            f"## {name.capitalize()} set  ({res['rows']} rows, {res['scenarios']} scenarios)",
            "",
            _table(res["metrics"]),
            "",
        ]
    parts += [
        "## What these numbers do and do not establish",
        "",
        f"- On the held-out **test** set the model's MAE is {test_m['MAE_km2']:.2f} km². The generator's own "
        f"noise-free formula scores MAE {ref_m['MAE_km2']:.2f} km² there; that gap is roughly the "
        "irreducible noise built into the synthetic data (a hidden per-scenario factor the inputs can't reveal). "
        "A model cannot beat it by much.",
        "- The model beating the *mean* and *no-growth* baselines shows it learned the synthetic relationship "
        "between inputs and area. That is the whole claim.",
        "- **A model adds little beyond a direct calculation here.** Because we wrote the formula that creates the "
        "labels, the formula is a perfect 'model' (see the reference row). Training is included to demonstrate a "
        "complete train → save → serve → display workflow that you can later point at real labelled data.",
        f"- On the **stress** set the model's MAE is {stress_m['MAE_km2']:.2f} km² "
        f"({ratio:.1f}× the test MAE). Tree-based models cannot extrapolate beyond the range they saw, so "
        "predictions flatten out. The API therefore returns a warning when an input is outside the training range.",
        "- Nothing here validates the generator itself. Whether real slicks behave like the formula is untested.",
        "",
    ]
    return "\n".join(parts)


def run_evaluation(predictor: AreaPredictor, write_report: bool = True) -> dict[str, Any]:
    results = evaluate_all(predictor)
    if write_report:
        config.DOCS_DIR.mkdir(parents=True, exist_ok=True)
        config.EVALUATION_REPORT_PATH.write_text(build_report(results, predictor), encoding="utf-8")
    return results


def print_summary(results: dict[str, Any]) -> None:
    for name, res in results.items():
        print(f"\n[{name}] rows={res['rows']} scenarios={res['scenarios']}")
        for model, m in res["metrics"].items():
            print(f"  {model:<50} MAE={m['MAE_km2']:8.3f}  RMSE={m['RMSE_km2']:8.3f}  R2={m['R2']:6.3f}")


def main() -> None:
    try:
        predictor = AreaPredictor.load()
    except (ModelNotAvailableError, ModelContractError) as exc:
        raise SystemExit(f"ERROR: {exc}")
    results = run_evaluation(predictor, write_report=True)
    print_summary(results)
    print(f"\nReport written to {config.EVALUATION_REPORT_PATH.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
