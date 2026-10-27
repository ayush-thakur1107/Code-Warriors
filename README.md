# OCEANTRACE

AI-assisted **maritime oil-spill investigation prototype**: a hackathon starter kit.

> **Prototype, not an operational system.** All vessels, tracks and training data are **synthetic**.
> The spill footprint is an illustrative shape, not a validated simulation. Vessel scores are
> *investigative leads*, never proof that any ship caused a spill. Nothing here uses real AIS
> records, satellite imagery, or observed incidents.

## What it does

- Dark Leaflet map with 6 clearly labelled **synthetic** demo vessels and their tracks
- Click to place a simulated spill; timeline slider (T+0 to T+72 h) with play button
- Controls: initial area, wind speed, current speed (+ drift heading for the drawing only)
- Incident panel, backend status indicator, SYNTHETIC labels throughout
- **Experimental** area prediction from a gradient-boosting model trained on synthetic data (FastAPI)
- **Transparent heuristic** ranking of vessels as investigative leads, with missing-AIS handling

## Folder structure

```
oceantrace/
├── frontend/            React + Vite + Leaflet UI
│   └── src/             api.js (all backend calls), components/, hooks/, lib/
├── backend/
│   ├── app/             FastAPI: main.py, schemas.py, ranking.py, model_service.py
│   ├── requirements.txt          runtime deps (API + ML scripts)
│   └── requirements-dev.txt      + pytest, httpx
├── ml/                  features.py (feature contract), generate_data.py, train_model.py,
│                        predict.py, evaluate.py, generate_sample_json.py
├── data/
│   ├── raw/             synthetic train / val / test / stress CSVs
│   └── samples/         vessel_routes.json, spill_scenario.json
├── models/              trained artifacts (git-ignored, created by training)
├── docs/                API.md, DATA.md, MODEL_CARD.md, model_evaluation.md,
│                        RANKING_HEURISTIC.md, COLLABORATION.md, GEMMA_INTEGRATION.md
├── tests/               pytest suite (data, ML contract, ranking, API)
└── README.md
```

## Prerequisites (Windows)

- Python 3.10+ (check: `python --version`)
- Node.js 18+ and npm (check: `node --version`)
- Git

## Setup: exact PowerShell commands

Run from the repository root (`oceantrace\`).

```powershell
# 1. Python environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# If PowerShell blocks the script:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -r backend\requirements.txt

# 2. Train the model (about 10 seconds; creates models\area_model.joblib)
python ml\train_model.py

# 3. Start the backend (leave this window open)
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

Open a **second** PowerShell window:

```powershell
cd path\to\oceantrace\frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The header badge should say *Backend connected*.
API docs (auto-generated): http://localhost:8000/docs

If you start the backend before training, the app still works; the badge says *model missing*.
Run `python ml\train_model.py` and the next request picks the model up, with no restart needed.

## Everyday commands

| Task | Command (repo root, venv active) |
|---|---|
| Regenerate synthetic CSVs | `python ml\generate_data.py` |
| Regenerate sample vessels/scenario | `python ml\generate_sample_json.py` |
| Train + evaluate + write report | `python ml\train_model.py` |
| Re-evaluate only | `python ml\evaluate.py` |
| Predict from the command line | `python ml\predict.py --initial-area 4 --wind 8 --current 0.6 --hours 24` |
| Run all tests | `pip install -r backend\requirements-dev.txt` then `python -m pytest` |
| Production-build the frontend | `cd frontend; npm run build` |

Configuration (all optional): `VITE_API_URL` (frontend, see `frontend/.env.example`),
`OCEANTRACE_CORS_ORIGINS` (comma-separated, backend), `OCEANTRACE_MODEL_PATH` (backend).

## Example API requests

```powershell
# Health
Invoke-RestMethod http://localhost:8000/health

# Predict area (synthetic-data model)
$body = @{ initial_area_km2 = 4; wind_speed_ms = 8; current_speed_ms = 0.6; elapsed_hours = 24 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8000/predict-area -ContentType 'application/json' -Body $body

# Rank the bundled synthetic vessels for a spill
$rank = @{ spill = @{ latitude = 18.5; longitude = 70.0; start_time = '2026-01-15T06:00:00Z' } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://localhost:8000/rank-vessels -ContentType 'application/json' -Body $rank | ConvertTo-Json -Depth 8
```

`curl.exe` equivalent: `curl.exe -X POST http://localhost:8000/predict-area -H "Content-Type: application/json" -d "{\"initial_area_km2\":4,\"wind_speed_ms\":8,\"current_speed_ms\":0.6,\"elapsed_hours\":24}"`

Full schemas and error formats: [docs/API.md](docs/API.md).

## How the pieces fit (plain English)

1. `ml/generate_data.py` invents labelled data from a toy formula (documented in [docs/DATA.md](docs/DATA.md)).
2. `ml/train_model.py` trains a **gradient boosting regressor** (a good default for small tabular data; no tuning decisions needed), checks it on validation data, saves it to `models/`.
3. The API loads that file **once at startup**. `POST /predict-area` returns the model's answer plus warnings if inputs are outside the training range.
4. The React app calls the API through `frontend/src/api.js` and shows the result.
5. `ml/features.py` is the single definition of feature names, order and units, shared by training and inference. A test fails if they drift apart.

**What the metrics mean:** the model reproduces *our invented formula* well, and a direct formula would do the same job.
Training is here to prove the train → save → serve → display pipeline, ready to be pointed at real labelled data later.
See [docs/model_evaluation.md](docs/model_evaluation.md) and [docs/MODEL_CARD.md](docs/MODEL_CARD.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Badge says **Backend offline** | Backend not running or wrong port. Start it (step 3). Check `VITE_API_URL`. |
| Badge says **model missing** | `python ml\train_model.py` from the repo root. |
| `python` not found / wrong version | Install Python from python.org and tick *Add to PATH*, or try `py -3`. |
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then reopen PowerShell. |
| `ModuleNotFoundError: ml` / `app` | Run commands from the repo root exactly as shown (`--app-dir backend`). |
| Browser shows CORS error | Frontend must be on `localhost:5173` / `127.0.0.1:5173`, or set `OCEANTRACE_CORS_ORIGINS`. |
| Model fails to load after upgrading Python/scikit-learn | Retrain: `python ml\train_model.py`. |
| Blank grey map | Basemap tiles need internet (CARTO/OpenStreetMap). Markers and tracks still draw. |
| Port already in use | Use `--port 8001` and set `VITE_API_URL=http://localhost:8001` in `frontend/.env.local`. |
| `npm install` errors | Check Node 18+; delete `frontend\node_modules` and retry. |

## Dataset limitations

- All CSVs are **synthetic**, generated from one invented formula plus noise. Not real observations.
- Train, validation and test come from the same generator, so test scores measure fit to *that process only*, not real-world accuracy.
- Splits use different seeds and disjoint scenario ids; rows of one scenario are never split across sets.
- A separate *stress* set (inputs far outside the training range) shows the model failing to extrapolate.
- Vessel tracks are invented ("Demo ..." names, `SYN-` ids), not AIS records.

## Known prototype limitations

- No real oceanography: no wind/current direction in the model, no oil type, weathering, coastlines or bathymetry.
- Footprint = ellipse + straight drift line, for illustration only.
- The vessel heuristic ignores drift back-tracking, vessel size/type, cargo, and non-AIS evidence; sample vessels only sit near the default location.
- Straight-line interpolation between position reports; no uncertainty modelling.
- Elapsed time is limited to 0–72 h; demo vessel tracks cover T−24 h to T+24 h.
- No authentication, persistence or deployment config. Local development only.
- Gemma 4 integration is a documented future extension ([docs/GEMMA_INTEGRATION.md](docs/GEMMA_INTEGRATION.md)); nothing needs a cloud API key.

## Two-person GitHub workflow (short version)

Branches `feature/map-ui` (frontend) and `feature/ml-model` (ml + backend), small PRs into `main`, never push to `main` directly,
`git pull --rebase origin main` before you push. Full guide: [docs/COLLABORATION.md](docs/COLLABORATION.md).
Pushing to GitHub does **not** deploy or integrate anything; each person still runs the app locally.
