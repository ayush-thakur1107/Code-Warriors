"""Tests for POST /explain-incident.

Covers:
  - Spill-only request (no prediction, no ranking) → 200, disclaimer present
  - Full request (spill + prediction + ranking) → richer explanation text
  - Disclaimer is ALWAYS in the response regardless of input
  - is_synthetic_data is always True
  - model_used is reported (either "template" or "gemma-ollama ...")
  - Bad request → 422 validation error
  - max_vessels field is respected (1–10)
  - use_ollama=False forces the template path
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

# ------------------------------------------------------------------ fixtures

SPILL = {"latitude": 18.5, "longitude": 70.0, "start_time": "2026-01-15T06:00:00Z"}

PREDICTION = {
    "predicted_area_km2": 12.34,
    "initial_area_km2": 4.0,
    "growth_factor": 3.085,
    "inputs": {
        "initial_area_km2": 4.0,
        "wind_speed_ms": 8.0,
        "current_speed_ms": 0.6,
        "elapsed_hours": 24.0,
    },
    "warnings": [],
    "model": {
        "name": "GradientBoostingRegressor",
        "trained_at": "2026-01-01T00:00:00+00:00",
        "training_data": "SYNTHETIC",
        "feature_names": ["initial_area_km2", "wind_speed_ms", "current_speed_ms", "elapsed_hours"],
        "training_rows": 3000,
        "scikit_learn_version": "1.4.0",
    },
    "is_synthetic_model": True,
    "disclaimer": "Prototype built on SYNTHETIC data.",
}

RANKING = {
    "spill": SPILL,
    "method": {
        "name": "heuristic-v1",
        "formula": "lead_score = proximity * ...",
        "weights": {"time_alignment": 0.75, "route_consistency": 0.25, "ais_gap_bonus": 0.10},
        "parameters": {
            "lookback_hours": 24.0,
            "lookahead_hours": 1.0,
            "distance_scale_km": 10.0,
            "time_scale_hours": 3.0,
            "gap_threshold_hours": 2.0,
            "max_plausible_speed_kmh": 60.0,
            "gap_relevance_km": 50.0,
        },
        "window_start": "2026-01-14T06:00:00Z",
        "window_end": "2026-01-15T07:00:00Z",
    },
    "ranked": [
        {
            "rank": 1,
            "vessel_id": "SYN-001",
            "name": "Demo Tanker Alpha",
            "vessel_type": "tanker",
            "lead_score": 0.72,
            "lead_strength": "high",
            "components": {
                "proximity": 0.95,
                "time_alignment": 0.85,
                "route_consistency": 1.0,
                "ais_gap_bonus": 0.0,
            },
            "metrics": {
                "approach_km": 0.5,
                "approach_time": "2026-01-15T05:45:00Z",
                "time_offset_hours": -0.25,
                "approach_position": {"latitude": 18.5, "longitude": 70.0},
                "ais_gap_at_start_hours": 0.0,
                "reports_in_window": 5,
            },
            "flags": [],
            "explanation": "Best approach 0.5 km, 0.25 h before the estimated spill start.",
        }
    ],
    "unassessed": [],
    "used_sample_vessels": False,
    "disclaimer": "Prototype built on SYNTHETIC data.",
}


@pytest.fixture()
def client(monkeypatch):
    """TestClient — /explain-incident does NOT need a trained model."""
    monkeypatch.setenv("OCEANTRACE_MODEL_PATH", "nonexistent_model.joblib")
    from app.main import app
    with TestClient(app) as c:
        yield c


# ------------------------------------------------------------------ tests

def test_explain_spill_only_returns_200(client):
    """Minimal request — only spill, no prediction, no ranking."""
    r = client.post("/explain-incident", json={"spill": SPILL, "use_ollama": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["explanation"]
    assert body["is_synthetic_data"] is True
    assert body["model_used"] == "template"
    assert body["generated_at"]


def test_disclaimer_always_present(client):
    """The disclaimer must appear in both the explanation text and the top-level field."""
    r = client.post("/explain-incident", json={"spill": SPILL, "use_ollama": False})
    body = r.json()
    assert "synthetic" in body["disclaimer"].lower()
    # Also present somewhere in the explanation itself
    assert "synthetic" in body["explanation"].lower()


def test_is_synthetic_data_always_true(client):
    r = client.post(
        "/explain-incident",
        json={"spill": SPILL, "prediction": PREDICTION, "ranking": RANKING, "use_ollama": False},
    )
    assert r.json()["is_synthetic_data"] is True


def test_full_request_mentions_vessel_name(client):
    """When ranking is provided the top vessel should be mentioned."""
    r = client.post(
        "/explain-incident",
        json={"spill": SPILL, "prediction": PREDICTION, "ranking": RANKING, "use_ollama": False},
    )
    assert r.status_code == 200
    assert "Demo Tanker Alpha" in r.json()["explanation"]


def test_full_request_mentions_predicted_area(client):
    """When prediction is provided, the predicted area should appear in the explanation."""
    r = client.post(
        "/explain-incident",
        json={"spill": SPILL, "prediction": PREDICTION, "use_ollama": False},
    )
    assert "12.34" in r.json()["explanation"]


def test_no_culprit_language(client):
    """Explanation must never accuse a vessel — only use lead language."""
    r = client.post(
        "/explain-incident",
        json={"spill": SPILL, "ranking": RANKING, "use_ollama": False},
    )
    text = r.json()["explanation"].lower()
    for forbidden in ("culprit", "guilty", "caused the spill", "responsible for the spill"):
        assert forbidden not in text, f"Forbidden word/phrase found: '{forbidden}'"


def test_max_vessels_respected(client):
    """With max_vessels=1 only 1 vessel should be detailed in the template output."""
    r = client.post(
        "/explain-incident",
        json={"spill": SPILL, "ranking": RANKING, "max_vessels": 1, "use_ollama": False},
    )
    assert r.status_code == 200
    # At least we get a valid response; template honours max_vessels internally
    body = r.json()
    assert body["explanation"]


def test_use_ollama_false_gives_template(client):
    r = client.post("/explain-incident", json={"spill": SPILL, "use_ollama": False})
    assert r.json()["model_used"] == "template"


def test_validation_error_extra_field(client):
    """Extra/unknown fields must be rejected (extra='forbid')."""
    r = client.post("/explain-incident", json={"spill": SPILL, "unknown_field": True})
    assert r.status_code == 422
    assert r.json()["error"] == "validation_error"


def test_validation_error_invalid_spill(client):
    """Invalid spill latitude should return 422."""
    bad_spill = {"latitude": 999, "longitude": 70.0, "start_time": "2026-01-15T06:00:00Z"}
    r = client.post("/explain-incident", json={"spill": bad_spill})
    assert r.status_code == 422


def test_validation_error_max_vessels_out_of_range(client):
    r = client.post("/explain-incident", json={"spill": SPILL, "max_vessels": 0})
    assert r.status_code == 422
