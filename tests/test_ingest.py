"""Tests for the data ingestion pipeline (ml/ingest.py).

Covers:
  - Valid synthetic-format CSV passes all validation
  - Column mapping renames columns correctly
  - Missing required columns raises ValueError
  - Rows with out-of-range physical values are rejected
  - Rows with NaN are dropped with a warning
  - Duplicate (scenario_id, elapsed_hours) rows are deduplicated
  - Shrinking area at t>0 is flagged
  - dry_run does not write files
  - Output is saved to data/real/ (real data dir)
  - Synthetic and real data directories stay separate
"""
from __future__ import annotations

import io
import textwrap

import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_valid_csv() -> str:
    """Minimal valid CSV in the canonical OCEANTRACE schema."""
    return textwrap.dedent("""\
        scenario_id,initial_area_km2,wind_speed_ms,current_speed_ms,elapsed_hours,area_km2
        incident-001,2.0,5.0,0.3,12.0,3.5
        incident-001,2.0,5.0,0.3,24.0,5.1
        incident-002,4.0,10.0,0.8,6.0,5.2
        incident-002,4.0,10.0,0.8,48.0,9.8
    """)


def _write_csv(tmp_path, content: str, name: str = "input.csv") -> "Path":
    p = tmp_path / name
    p.write_text(content)
    return p


# ---------------------------------------------------------------------------
# import ingest here (after sys.path is set by conftest)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _patch_real_dir(tmp_path, monkeypatch):
    """Redirect REAL_DATA_DIR so tests never write to the actual data/real/ folder."""
    from ml import ingest
    monkeypatch.setattr(ingest, "REAL_DATA_DIR", tmp_path / "real")


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------

def test_valid_csv_passes(tmp_path):
    from ml.ingest import ingest
    p = _write_csv(tmp_path, _make_valid_csv())
    result = ingest(p, dry_run=True)
    assert len(result) == 4
    assert set(result["scenario_id"]) == {"incident-001", "incident-002"}


def test_column_mapping_renames_correctly(tmp_path):
    csv = textwrap.dedent("""\
        IncidentID,InitArea,Wind,Cur,Hours,Area
        X-001,2.0,5.0,0.3,12.0,3.5
        X-001,2.0,5.0,0.3,24.0,5.1
    """)
    mapping = {
        "IncidentID": "scenario_id",
        "InitArea": "initial_area_km2",
        "Wind": "wind_speed_ms",
        "Cur": "current_speed_ms",
        "Hours": "elapsed_hours",
        "Area": "area_km2",
    }
    p = _write_csv(tmp_path, csv)
    from ml.ingest import ingest
    result = ingest(p, mapping=mapping, dry_run=True)
    assert len(result) == 2
    assert "scenario_id" in result.columns


def test_missing_required_column_raises(tmp_path):
    csv = "scenario_id,initial_area_km2,wind_speed_ms\nA,1.0,5.0\n"
    p = _write_csv(tmp_path, csv)
    from ml.ingest import ingest
    with pytest.raises(ValueError, match="required column"):
        ingest(p, dry_run=True)


def test_out_of_range_rows_are_rejected(tmp_path):
    # wind_speed_ms = 999 is above the 60 m/s limit
    csv = textwrap.dedent("""\
        scenario_id,initial_area_km2,wind_speed_ms,current_speed_ms,elapsed_hours,area_km2
        good-001,2.0,5.0,0.3,12.0,3.5
        bad-001,2.0,999.0,0.3,12.0,3.5
    """)
    p = _write_csv(tmp_path, csv)
    from ml.ingest import ingest
    result = ingest(p, dry_run=True)
    assert len(result) == 1
    assert result.iloc[0]["scenario_id"] == "good-001"


def test_nan_rows_are_dropped(tmp_path, capsys):
    csv = textwrap.dedent("""\
        scenario_id,initial_area_km2,wind_speed_ms,current_speed_ms,elapsed_hours,area_km2
        ok-001,2.0,5.0,0.3,12.0,3.5
        nan-001,,5.0,0.3,12.0,3.5
    """)
    p = _write_csv(tmp_path, csv)
    from ml.ingest import ingest
    result = ingest(p, dry_run=True)
    captured = capsys.readouterr()
    assert len(result) == 1
    assert "missing values" in captured.out.lower()


def test_duplicate_rows_deduplicated(tmp_path, capsys):
    csv = textwrap.dedent("""\
        scenario_id,initial_area_km2,wind_speed_ms,current_speed_ms,elapsed_hours,area_km2
        dup-001,2.0,5.0,0.3,12.0,3.5
        dup-001,2.0,5.0,0.3,12.0,3.5
        dup-001,2.0,5.0,0.3,24.0,5.1
    """)
    p = _write_csv(tmp_path, csv)
    from ml.ingest import ingest
    result = ingest(p, dry_run=True)
    captured = capsys.readouterr()
    assert len(result) == 2
    assert "duplicate" in captured.out.lower()


def test_shrinking_area_flagged(tmp_path):
    # area_km2 < 50% of initial_area_km2 at t=24h should be rejected
    csv = textwrap.dedent("""\
        scenario_id,initial_area_km2,wind_speed_ms,current_speed_ms,elapsed_hours,area_km2
        shrink-001,10.0,5.0,0.3,24.0,1.0
        ok-001,2.0,5.0,0.3,12.0,3.5
    """)
    p = _write_csv(tmp_path, csv)
    from ml.ingest import ingest
    result = ingest(p, dry_run=True)
    # The shrinking row should be rejected
    assert "shrink-001" not in result["scenario_id"].values
    assert "ok-001" in result["scenario_id"].values


def test_dry_run_writes_nothing(tmp_path):
    p = _write_csv(tmp_path, _make_valid_csv())
    from ml.ingest import ingest, REAL_DATA_DIR
    before = list(REAL_DATA_DIR.glob("**/*")) if REAL_DATA_DIR.exists() else []
    ingest(p, dry_run=True)
    after = list(REAL_DATA_DIR.glob("**/*")) if REAL_DATA_DIR.exists() else []
    assert len(before) == len(after), "dry_run should not write any files"


def test_output_written_to_real_dir(tmp_path, monkeypatch):
    from ml import ingest as ingest_module
    real_dir = tmp_path / "real"
    monkeypatch.setattr(ingest_module, "REAL_DATA_DIR", real_dir)
    p = _write_csv(tmp_path, _make_valid_csv())
    from ml.ingest import ingest
    ingest(p, output_name="test_output", dry_run=False)
    out = real_dir / "test_output.csv"
    assert out.exists(), f"Expected output file at {out}"
    df = pd.read_csv(out)
    assert len(df) == 4


def test_synthetic_real_directories_are_separate():
    """Confirm data/raw and data/real are different paths (no accidental merge)."""
    from ml import config
    from ml.ingest import REAL_DATA_DIR
    assert config.DATA_RAW_DIR != REAL_DATA_DIR
    assert "real" in str(REAL_DATA_DIR)
    assert "raw" in str(config.DATA_RAW_DIR)
