"""Data ingestion pipeline for the OCEANTRACE spill-area model.

    python ml/ingest.py --help

Accepts an external CSV of labelled spill observations and validates, normalises and
saves it into `data/real/` so the training pipeline can pick it up.

IMPORTANT
---------
* This module NEVER fabricates observations or labels.
* Synthetic data (data/raw/) and real data (data/real/) are kept in separate
  directories and never silently merged.
* If real labelled data is unavailable the pipeline continues with synthetic data only.
* Column mapping lets you translate arbitrary source column names to the pipeline's
  canonical names without modifying the feature contract.

Column mapping JSON (--mapping flag)
-------------------------------------
Provide a JSON file that maps source column names → canonical names, e.g.::

    {
        "InitialArea_sqkm": "initial_area_km2",
        "Wind_ms":          "wind_speed_ms",
        "Current_ms":       "current_speed_ms",
        "Hours":            "elapsed_hours",
        "Area_sqkm":        "area_km2",
        "IncidentID":       "scenario_id"
    }

Any columns not in the mapping are dropped.  The ``scenario_id`` column is
required (used for grouped CV / leakage control).

Physical validation
-------------------
The following hard limits are applied after mapping.  Rows that fail are
**rejected** (written to ``--rejected`` path) and a warning is printed.
The surviving rows are written to the output CSV.

| Feature             | Min  | Max    | Notes                                    |
|---------------------|------|--------|------------------------------------------|
| initial_area_km2    | >0   | 10 000 | Unrealistically large spills are flagged |
| wind_speed_ms       | 0    | 60     | Typhoon-force upper bound                |
| current_speed_ms    | 0    | 5      | Realistic ocean-surface current          |
| elapsed_hours       | 0    | 720    | Up to 30 days                            |
| area_km2 (target)   | >0   | 50 000 | Must be larger than initial at t>0       |

Real-world data sources (no credentials supplied by this script)
----------------------------------------------------------------
* ITOPF (International Tanker Owners Pollution Federation) — historical spill data
  https://www.itopf.org/knowledge-resources/data-statistics/statistics/
* NOAA Office of Response and Restoration — incident database
  https://incidentnews.noaa.gov/
* Copernicus Emergency Management Service — spill extent shapefiles
  https://emergency.copernicus.eu/mapping/
* EMSA CleanSeaNet — satellite detections (restricted)
  https://www.emsa.europa.eu/csn-menu.html

None of the above provide a ready-made labelled regression dataset; manual
annotation and cleaning will be required.  Steps:
  1. Download raw incident records.
  2. For each incident: note initial area (from satellite or report), wind/current
     from hindcast (e.g. ERA5/CMEMS), and satellite-observed area at each time step.
  3. Map to the canonical schema using --mapping.
  4. Run this script to validate.
  5. Store validated CSV in data/real/ (add to .gitignore if large).
  6. Retrain with --include-real flag in train_model.py.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from ml import config  # noqa: E402
from ml.features import FEATURE_COLUMNS, GROUP_COLUMN, TARGET_COLUMN  # noqa: E402

# ---------------------------------------------------------------------------
# Physical limits for validation (documented in module docstring above)
# ---------------------------------------------------------------------------
PHYSICAL_LIMITS: dict[str, tuple[float, float]] = {
    "initial_area_km2":  (1e-6, 10_000.0),
    "wind_speed_ms":     (0.0,  60.0),
    "current_speed_ms":  (0.0,  5.0),
    "elapsed_hours":     (0.0,  720.0),
    "area_km2":          (1e-6, 50_000.0),
}

REAL_DATA_DIR = config.ROOT / "data" / "real"
CANONICAL_COLUMNS = (GROUP_COLUMN, *FEATURE_COLUMNS, TARGET_COLUMN)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_raw(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix in (".xls", ".xlsx"):
        return pd.read_excel(path)
    raise ValueError(f"Unsupported file type '{suffix}'. Use CSV or Excel.")


def _apply_mapping(df: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    """Rename source columns to canonical names; drop unmapped columns."""
    if mapping:
        df = df.rename(columns=mapping)
    available = [c for c in CANONICAL_COLUMNS if c in df.columns]
    missing = [c for c in CANONICAL_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"After applying column mapping, required column(s) are still missing: {missing}.\n"
            f"Available columns: {list(df.columns)}.\n"
            "Check your --mapping file or add the missing column to the source data."
        )
    return df[list(available)]


def _validate_rows(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (good_rows, rejected_rows).  Rejection reasons are appended as a column."""
    reasons: list[str] = []
    for col, (lo, hi) in PHYSICAL_LIMITS.items():
        if col not in df.columns:
            continue
        mask_bad = ~df[col].between(lo, hi, inclusive="both")
        for idx in df.index[mask_bad]:
            val = df.at[idx, col]
            reasons_existing = reasons[idx] if idx < len(reasons) else ""
            # pad list if needed
            while len(reasons) <= idx:
                reasons.append("")
            reasons[idx] += f"{col}={val} outside [{lo}, {hi}]; "

    # Check area_km2 >= initial_area_km2 when elapsed_hours > 0
    if "area_km2" in df.columns and "initial_area_km2" in df.columns and "elapsed_hours" in df.columns:
        growing = (df["elapsed_hours"] > 0) & (df["area_km2"] < df["initial_area_km2"] * 0.5)
        for idx in df.index[growing]:
            while len(reasons) <= idx:
                reasons.append("")
            reasons[idx] += "area_km2 < 50% of initial_area_km2 at t>0 (suspicious shrinkage); "

    # Reset index so we can index by position
    df = df.reset_index(drop=True)
    while len(reasons) < len(df):
        reasons.append("")
    reason_series = pd.Series(reasons, index=df.index)

    bad_mask = reason_series.str.len() > 0
    bad = df[bad_mask].copy()
    bad["_rejection_reason"] = reason_series[bad_mask]
    good = df[~bad_mask].copy()
    return good, bad


def _check_missing(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows with any NaN in the canonical columns and warn."""
    before = len(df)
    df = df.dropna(subset=list(CANONICAL_COLUMNS))
    dropped = before - len(df)
    if dropped:
        print(f"  [ingest] WARNING: dropped {dropped} rows with missing values.")
    return df


def _check_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Warn about duplicate (scenario_id, elapsed_hours) combinations."""
    key_cols = [GROUP_COLUMN, "elapsed_hours"]
    dups = df.duplicated(subset=key_cols, keep="first")
    n_dup = int(dups.sum())
    if n_dup:
        print(f"  [ingest] WARNING: {n_dup} duplicate (scenario_id, elapsed_hours) rows removed.")
        df = df[~dups]
    return df


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ingest(
    source_path: Path,
    output_name: str | None = None,
    mapping: dict[str, str] | None = None,
    rejected_path: Path | None = None,
    dry_run: bool = False,
) -> pd.DataFrame:
    """Validate and save a real-labelled CSV.

    Args:
        source_path:   Path to the source CSV/Excel file.
        output_name:   Stem for the output file (default: source stem + '_ingested').
        mapping:       Column-name mapping {source_name: canonical_name}.
        rejected_path: Where to write rejected rows. Defaults to source dir.
        dry_run:       If True, validate but do not write any output files.

    Returns:
        The validated DataFrame that was (or would be) written.

    Raises:
        FileNotFoundError: Source file missing.
        ValueError: After mapping, required columns are still absent.
    """
    mapping = mapping or {}
    print(f"[ingest] Reading: {source_path}")
    raw = _load_raw(source_path)
    print(f"  Loaded {len(raw)} rows, {len(raw.columns)} columns.")

    df = _apply_mapping(raw, mapping)
    print(f"  After column mapping: {len(df)} rows, columns: {list(df.columns)}")

    df = _check_missing(df)
    df = _check_duplicates(df)

    good, bad = _validate_rows(df)
    print(f"  Physical validation: {len(good)} valid rows, {len(bad)} rejected rows.")

    if len(bad):
        rej_path = rejected_path or (source_path.parent / (source_path.stem + "_rejected.csv"))
        if not dry_run:
            bad.to_csv(rej_path, index=False)
        print(f"  Rejected rows written to: {rej_path}")

    if len(good) == 0:
        print("  [ingest] ERROR: No valid rows remaining after validation. Nothing written.")
        return good

    # Summary statistics for quick sanity check
    print("\n  [ingest] Validated data summary:")
    print(f"    Scenarios (unique {GROUP_COLUMN}): {good[GROUP_COLUMN].nunique()}")
    for col in list(FEATURE_COLUMNS) + [TARGET_COLUMN]:
        s = good[col]
        print(f"    {col:25s}: min={s.min():.3g}  max={s.max():.3g}  mean={s.mean():.3g}")

    if dry_run:
        print("\n  [ingest] Dry-run — nothing written.")
        return good

    # Write to data/real/
    REAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    stem = output_name or (source_path.stem + "_ingested")
    out_path = REAL_DATA_DIR / f"{stem}.csv"
    good.to_csv(out_path, index=False)
    print(f"\n  [ingest] Written to: {out_path}")
    print(
        "\n  IMPORTANT: This file contains REAL LABELLED DATA. "
        "Keep it separate from the synthetic datasets in data/raw/. "
        "Add data/real/ to .gitignore if it contains large or sensitive files."
    )
    return good


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Validate and ingest a real-labelled spill-area CSV into OCEANTRACE. "
            "See module docstring for column mapping format and data-source guidance."
        )
    )
    parser.add_argument("source", type=Path, help="Path to source CSV or Excel file.")
    parser.add_argument(
        "--mapping",
        type=Path,
        default=None,
        help="Path to JSON file mapping source column names to canonical names.",
    )
    parser.add_argument(
        "--output-name",
        default=None,
        help="Output file stem (default: <source_stem>_ingested). Saved to data/real/.",
    )
    parser.add_argument(
        "--rejected",
        type=Path,
        default=None,
        help="Path for rejected-rows CSV (default: <source>_rejected.csv).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print summary but do not write any files.",
    )
    args = parser.parse_args()

    mapping: dict[str, str] = {}
    if args.mapping:
        if not args.mapping.exists():
            raise SystemExit(f"ERROR: mapping file not found: {args.mapping}")
        mapping = json.loads(args.mapping.read_text(encoding="utf-8"))

    try:
        result = ingest(
            source_path=args.source,
            output_name=args.output_name,
            mapping=mapping,
            rejected_path=args.rejected,
            dry_run=args.dry_run,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise SystemExit(f"ERROR: {exc}")

    if len(result) == 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
