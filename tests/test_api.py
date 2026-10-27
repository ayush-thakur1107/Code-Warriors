"""API behaviour via FastAPI's TestClient (no network, no real server)."""
import json

import pytest
from fastapi.testclient import TestClient

from ml import config

SPILL = {"latitude": 18.5, "longitude": 70.0, "start_time": "2026-01-15T06:00:00Z"}


@pytest.fixture()
def client_with_model(trained_model_path, monkeypatch):
    monkeypatch.setenv("OCEANTRACE_MODEL_PATH", str(trained_model_path))
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def client_without_model(tmp_path, monkeypatch):
    monkeypatch.setenv("OCEANTRACE_MODEL_PATH", str(tmp_path / "missing.joblib"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_health_ok_with_model(client_with_model):
    r = client_with_model.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["model_loaded"] is True and body["model_error"] is None


def test_health_reports_missing_model(client_without_model):
    body = client_without_model.get("/health").json()
    assert body["model_loaded"] is False
    assert "train_model.py" in body["model_error"]


def test_predict_area_success(client_with_model):
    payload = {"initial_area_km2": 4, "wind_speed_ms": 8, "current_speed_ms": 0.6, "elapsed_hours": 24}
    r = client_with_model.post("/predict-area", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["predicted_area_km2"] > 4
    assert body["growth_factor"] == pytest.approx(body["predicted_area_km2"] / 4, rel=1e-3)
    assert body["is_synthetic_model"] is True and body["warnings"] == []
    assert body["model"]["feature_names"] == ["initial_area_km2", "wind_speed_ms", "current_speed_ms", "elapsed_hours"]


def test_predict_area_warns_outside_training_range(client_with_model):
    payload = {"initial_area_km2": 4, "wind_speed_ms": 40, "current_speed_ms": 0.6, "elapsed_hours": 24}
    body = client_with_model.post("/predict-area", json=payload).json()
    assert any("wind_speed_ms" in w for w in body["warnings"])


def test_predict_area_missing_model_is_503_with_instructions(client_without_model):
    payload = {"initial_area_km2": 4, "wind_speed_ms": 8, "current_speed_ms": 0.6, "elapsed_hours": 24}
    r = client_without_model.post("/predict-area", json=payload)
    assert r.status_code == 503
    body = r.json()
    assert body["error"] == "model_not_available"
    assert "python ml/train_model.py" in body["how_to_fix"]


@pytest.mark.parametrize(
    "payload",
    [
        {"initial_area_km2": -1, "wind_speed_ms": 8, "current_speed_ms": 0.6, "elapsed_hours": 24},
        {"initial_area_km2": 4, "wind_speed_ms": 8, "current_speed_ms": 0.6},  # missing field
        {"initial_area_km2": 4, "wind_speed": 8, "current_speed_ms": 0.6, "elapsed_hours": 24},  # typo
        {"initial_area_km2": "big", "wind_speed_ms": 8, "current_speed_ms": 0.6, "elapsed_hours": 24},
    ],
)
def test_predict_area_validation_errors(client_with_model, payload):
    r = client_with_model.post("/predict-area", json=payload)
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "validation_error" and body["details"] and body["message"]


def test_rank_vessels_with_sample_vessels(client_without_model):
    r = client_without_model.post("/rank-vessels", json={"spill": SPILL})  # works without a model
    assert r.status_code == 200
    body = r.json()
    assert body["used_sample_vessels"] is True
    assert body["ranked"][0]["vessel_id"] == "SYN-001"
    assert body["unassessed"][0]["vessel_id"] == "SYN-006"
    assert "not proof" in body["disclaimer"].lower() or "never proof" in body["disclaimer"].lower()


def test_rank_vessels_with_explicit_vessels_like_the_frontend_sends(client_with_model):
    sample = json.loads(config.VESSEL_ROUTES_JSON.read_text())
    r = client_with_model.post("/rank-vessels", json={"spill": SPILL, "vessels": sample["vessels"]})
    assert r.status_code == 200
    assert r.json()["used_sample_vessels"] is False


def test_rank_vessels_validation(client_with_model):
    bad = {"spill": {"latitude": 123, "longitude": 70, "start_time": "2026-01-15T06:00:00Z"}}
    r = client_with_model.post("/rank-vessels", json=bad)
    assert r.status_code == 422 and "latitude" in r.json()["message"]
    dup = {"spill": SPILL, "vessels": [{"vessel_id": "A", "reports": []}, {"vessel_id": "A", "reports": []}]}
    assert client_with_model.post("/rank-vessels", json=dup).status_code == 422


def test_cors_allows_vite_dev_origin(client_with_model):
    r = client_with_model.options(
        "/predict-area",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
    other = client_with_model.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in other.headers
