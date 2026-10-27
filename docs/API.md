# OCEANTRACE API

Base URL (local): `http://localhost:8000`. Interactive docs: `/docs`. JSON in, JSON out.
The frontend builds requests in `frontend/src/api.js`; the schemas are in `backend/app/schemas.py`.

## Error format

| Status | `error` | When |
|---|---|---|
| 422 | `validation_error` | Bad/missing field. Body: `message` (readable) and `details: [{field, message}]`. Unknown fields are rejected (catches typos). |
| 503 | `model_not_available` | No trained model. Body includes `how_to_fix` (`python ml/train_model.py`). |
| 404 | `sample_vessels_missing` | `/rank-vessels` without `vessels` and the sample file is absent. |

## `GET /health`

```json
{"status":"ok","api_version":"0.1.0","model_loaded":true,"model_error":null,
 "model_file":"models/area_model.joblib","server_time_utc":"2026-01-15T06:00:00Z"}
```
`model_loaded=false` + `model_error` explains how to train. The frontend polls this for the status badge.

## `POST /predict-area`  (experimental, synthetic-data model)

Request (all required; units in the names):

| Field | Type | Allowed |
|---|---|---|
| `initial_area_km2` | number | > 0, ≤ 1000 |
| `wind_speed_ms` | number | 0–60 |
| `current_speed_ms` | number | 0–5 |
| `elapsed_hours` | number | 0–240 |

Response: `predicted_area_km2`, `initial_area_km2`, `growth_factor`, `inputs` (echo), `warnings[]`
(for example inputs outside the training range 0.5–20 km², 0–20 m/s, 0–1.5 m/s, 0–72 h), `model{}`, `is_synthetic_model: true`, `disclaimer`.

## `POST /rank-vessels`  (heuristic leads)

```json
{
  "spill": {"latitude": 18.5, "longitude": 70.0, "start_time": "2026-01-15T06:00:00Z"},
  "vessels": [
    {"vessel_id": "SYN-001", "name": "MT Front Altair", "vessel_type": "tanker",
     "reports": [{"timestamp": "2026-01-15T05:00:00Z", "latitude": 18.5, "longitude": 69.7}]}
  ],
  "params": {"lookback_hours": 24, "lookahead_hours": 1, "distance_scale_km": 10,
             "time_scale_hours": 3, "gap_threshold_hours": 2,
             "max_plausible_speed_kmh": 60, "gap_relevance_km": 50}
}
```
- `vessels` optional: omitted → the bundled **synthetic** vessels are used (`used_sample_vessels: true`).
- `params` optional; every field has the default shown. Timestamps are ISO 8601; naive times are treated as UTC.
- Latitude −90..90, longitude −180..180, ≤ 500 vessels, ≤ 10 000 reports each, unique `vessel_id`s.

Response: `ranked[]` (rank, `lead_score` 0–1, `lead_strength`, `components`, `metrics`, `flags`, `explanation`),
`unassessed[]` (vessels with insufficient data and why), `method{}` (formula, weights, window), `disclaimer`.
Scoring details: [RANKING_HEURISTIC.md](RANKING_HEURISTIC.md).

## Environment variables

`OCEANTRACE_CORS_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173`), `OCEANTRACE_MODEL_PATH`.
