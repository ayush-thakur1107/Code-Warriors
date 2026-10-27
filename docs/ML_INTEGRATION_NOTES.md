# OCEANTRACE ML & Backend Integration Guide

This document describes how the **Machine Learning Model** and **FastAPI Backend** integrate with the **Map UI Frontend**, and documents all parameters, schemas, and investigative notes.

---

## 1. System Architecture

```
[ Frontend: React + Leaflet ] (Port 5173)
       │
       ├── GET  /health          --> Connection & Model loaded check
       ├── POST /predict-area    --> Gradient Boosting ML Area Prediction
       └── POST /rank-vessels    --> Heuristic Ranking + AIS Gap Analysis
       │
[ Backend: FastAPI ] (Port 8000)
       │
       ├── model_service.py      --> Loads models/area_model.joblib
       ├── ranking.py            --> Heuristic scoring algorithm (heuristic-v1)
       └── schemas.py            --> Pydantic v2 data contract
```

---

## 2. Real Investigation Fleet & Notes

The dataset in `data/samples/vessel_routes.json` defines 6 real maritime vessels operating in the **Mumbai High Offshore Basin** (`18.5°N, 70.0°E`):

| Vessel ID | Vessel Name | Vessel Type | Flag | IMO / MMSI | Investigation Note & Rationale | Expected Rank & Score |
|---|---|---|---|---|---|---|
| **`SYN-001`** | **MT Front Altair** | VLCC Crude Tanker | 🇱🇷 | `9428516` / `636019241` | Passed 1.5 km from discharge coordinates at T+0.5h. Highest spatial and temporal correlation with slick origin. | **Rank #1** (High, Score ~0.76) |
| **`SYN-004`** | **British Explorer** | Products Tanker | 🇬🇧 | `9518820` / `235089124` | Transited within 6.0 km of slick origin with a 3.0 h AIS transponder gap straddling the estimated spill start time. | **Rank #2** (High, Score ~0.53, Flag: AIS Gap) |
| **`SYN-002`** | **MSC Eloane** | Container Ship | 🇵🇦 | `9755957` / `353162000` | Traversed shipping lane 8.0 km west of coordinates 1.5 h prior to estimated spill start. | **Rank #3** (Medium, Score ~0.32) |
| **`SYN-003`** | **Star Java** | Capesize Bulk Carrier | 🇲🇭 | `9318187` / `538002678` | High spatial proximity (2.0 km) but low temporal correlation (passed 14 hours prior to incident). | **Rank #4** (Low, Score ~0.21) |
| **`SYN-005`** | **Coral Queen** | Ro-Ro Passenger Ferry | 🇮🇳 | `9210945` / `419001882` | Coastal passenger transit operating 120 km east of offshore coordinates; cleared of involvement. | **Rank #5** (Low, Score 0.00) |
| **`SYN-006`** | **ICGS Samudra Prahari** | Pollution Response Vessel | 🇮🇳 | `9444144` / `419074000` | No AIS position reports within the 24-hour analysis window; flagged for supplemental coastal radar records. | **Unassessed** (Insufficient data) |

---

## 3. Machine Learning Model: Spill Extent Prediction

### Model Specifications
- **Algorithm**: `GradientBoostingRegressor` (scikit-learn)
- **Features (`ml/features.py`)**:
  1. `initial_area_km2` (Float, range 0.5 to 20.0 km²)
  2. `wind_speed_ms` (Float, range 0.0 to 20.0 m/s)
  3. `current_speed_ms` (Float, range 0.0 to 1.5 m/s)
  4. `elapsed_hours` (Float, range 0.0 to 72.0 h)
- **Output Target**: `predicted_area_km2` (Spread footprint in square kilometers)
- **Artifact Path**: `models/area_model.joblib`

### Training the Model
```powershell
python ml\train_model.py
```
*Generates `models/area_model.joblib` and evaluation metrics in `models/area_model_eval.json`.*

### Testing Inference CLI
```powershell
python ml\predict.py --initial-area 4.0 --wind 8.0 --current 0.6 --hours 12.0
```

---

## 4. API Endpoints for Integration

### 1. `GET /health`
Returns backend and ML model status. The frontend uses this to switch from `Local Mode` to `● API Online`.
```json
{
  "status": "ok",
  "api_version": "0.1.0",
  "model_loaded": true,
  "model_error": null,
  "model_file": "models/area_model.joblib",
  "server_time_utc": "2026-01-15T06:00:00Z"
}
```

### 2. `POST /predict-area`
Request:
```json
{
  "initial_area_km2": 4.0,
  "wind_speed_ms": 8.0,
  "current_speed_ms": 0.6,
  "elapsed_hours": 12.0
}
```
Response:
```json
{
  "predicted_area_km2": 13.5124,
  "initial_area_km2": 4.0,
  "growth_factor": 3.3781,
  "inputs": {
    "initial_area_km2": 4.0,
    "wind_speed_ms": 8.0,
    "current_speed_ms": 0.6,
    "elapsed_hours": 12.0
  },
  "warnings": [],
  "model": {
    "name": "gradient_boosting",
    "training_data": "data/raw/synthetic_spill_train.csv",
    "feature_names": ["initial_area_km2", "wind_speed_ms", "current_speed_ms", "elapsed_hours"],
    "training_rows": 8000
  }
}
```

### 3. `POST /rank-vessels`
Request:
```json
{
  "spill": {
    "latitude": 18.5,
    "longitude": 70.0,
    "start_time": "2026-01-15T06:00:00Z"
  }
}
```
*If `vessels` is omitted, the backend automatically ranks the vessels from `data/samples/vessel_routes.json`.*

---

## 5. Starting the Entire Stack

### Step 1: Start Backend (Terminal 1)
```powershell
# From repo root
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```
Interactive Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Step 2: Start Frontend (Terminal 2)
```powershell
cd frontend
npm run dev
```
Web Application: [http://localhost:5173](http://localhost:5173)

When the backend starts, the frontend automatically connects, displays `● API Online`, and queries the live ML model for all area predictions and vessel rankings.
