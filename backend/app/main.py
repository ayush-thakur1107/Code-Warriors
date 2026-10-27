"""OCEANTRACE API.

Run from the repository root:

    python -m uvicorn app.main:app --app-dir backend --reload --port 8000

Interactive docs: http://localhost:8000/docs
"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .model_service import ModelUnavailable, ml_config, model_service
from .ranking import rank_vessels
from .schemas import (
    HealthResponse,
    ModelInfo,
    PredictAreaRequest,
    PredictAreaResponse,
    RankVesselsRequest,
    RankVesselsResponse,
    Vessel,
)

API_VERSION = "0.1.0"
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@asynccontextmanager
async def lifespan(_: FastAPI):
    model_service.load()  # once, at startup
    if model_service.error:
        print(f"[oceantrace] WARNING: model not loaded. {model_service.error}")
    else:
        print(f"[oceantrace] model loaded from {model_service.display_path}")
    yield


app = FastAPI(
    title="OCEANTRACE API",
    version=API_VERSION,
    description=(
        "Prototype maritime oil-spill investigation API. Uses SYNTHETIC data and a toy model. "
        "Not an operational response system; vessel ranks are investigative leads, not proof."
    ),
    lifespan=lifespan,
)

origins = [o.strip() for o in os.environ.get("OCEANTRACE_CORS_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ error handling
@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    details = [
        {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
        for e in exc.errors()
    ]
    summary = "; ".join(f"{d['field']}: {d['message']}" for d in details[:5])
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "message": f"Invalid request. {summary}", "details": details},
    )


@app.exception_handler(ModelUnavailable)
async def model_unavailable_handler(_: Request, exc: ModelUnavailable):
    return JSONResponse(
        status_code=503,
        content={
            "error": "model_not_available",
            "message": exc.message,
            "how_to_fix": "From the repository root run:  python ml/train_model.py",
        },
    )


# ------------------------------------------------------------------------ routes
@app.get("/", include_in_schema=False)
def root():
    return {"service": "OCEANTRACE API", "docs": "/docs", "health": "/health"}


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    model_service.ensure_loaded()
    return HealthResponse(
        api_version=API_VERSION,
        model_loaded=model_service.predictor is not None,
        model_error=model_service.error,
        model_file=model_service.display_path,
        server_time_utc=datetime.now(timezone.utc),
    )


@app.post("/predict-area", response_model=PredictAreaResponse, tags=["prediction"])
def predict_area(req: PredictAreaRequest) -> PredictAreaResponse:
    """Experimental: footprint area from a model trained on SYNTHETIC data."""
    predictor = model_service.require()
    out = predictor.predict(
        initial_area_km2=req.initial_area_km2,
        wind_speed_ms=req.wind_speed_ms,
        current_speed_ms=req.current_speed_ms,
        elapsed_hours=req.elapsed_hours,
    )
    area = out["predicted_area_km2"]
    return PredictAreaResponse(
        predicted_area_km2=round(area, 4),
        initial_area_km2=req.initial_area_km2,
        growth_factor=round(area / req.initial_area_km2, 4),
        inputs=req,
        warnings=out["warnings"],
        model=ModelInfo(**predictor.info),
    )


def _load_sample_vessels() -> list[Vessel]:
    """The bundled SYNTHETIC vessels (data/samples/vessel_routes.json)."""
    raw = json.loads(ml_config.VESSEL_ROUTES_JSON.read_text(encoding="utf-8"))
    return [Vessel(**v) for v in raw["vessels"]]


@app.post("/rank-vessels", response_model=RankVesselsResponse, tags=["investigation"])
def rank_vessels_endpoint(req: RankVesselsRequest) -> RankVesselsResponse | JSONResponse:
    """Rank vessels as investigative leads with a transparent heuristic (see docs/RANKING_HEURISTIC.md)."""
    used_sample = req.vessels is None
    if used_sample:
        try:
            vessels = _load_sample_vessels()
        except FileNotFoundError:
            return JSONResponse(
                status_code=404,
                content={
                    "error": "sample_vessels_missing",
                    "message": "No vessels supplied and data/samples/vessel_routes.json was not found.",
                    "how_to_fix": "Send a 'vessels' list, or run: python ml/generate_sample_json.py",
                },
            )
    else:
        vessels = req.vessels or []
    return rank_vessels(vessels, req.spill, req.params, used_sample=used_sample)
