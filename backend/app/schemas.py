"""Request / response schemas (Pydantic v2). These ARE the API contract.

The frontend (`frontend/src/api.js`) builds requests that match these models exactly.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DISCLAIMER = (
    "Prototype built on SYNTHETIC data. Not an operational environmental-response tool. "
    "Outputs are investigative leads, never proof that any vessel caused a spill."
)


def _to_utc(value: datetime) -> datetime:
    """Treat naive timestamps as UTC; convert aware ones to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# --------------------------------------------------------------------------- health
class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    api_version: str
    model_loaded: bool
    model_error: str | None = Field(None, description="Why the model is not loaded, if it is not.")
    model_file: str = Field(..., description="Expected model location, relative to the repo root.")
    server_time_utc: datetime


# --------------------------------------------------------------------- predict-area
class PredictAreaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # catches typos such as "wind_speed"

    initial_area_km2: float = Field(..., gt=0, le=1000, allow_inf_nan=False, description="Area at t=0, km^2.")
    wind_speed_ms: float = Field(..., ge=0, le=60, allow_inf_nan=False, description="Wind speed, m/s.")
    current_speed_ms: float = Field(..., ge=0, le=5, allow_inf_nan=False, description="Current speed, m/s.")
    elapsed_hours: float = Field(..., ge=0, le=240, allow_inf_nan=False, description="Hours since spill start.")


class ModelInfo(BaseModel):
    name: str
    trained_at: str | None = None
    training_data: str
    feature_names: list[str]
    training_rows: int | None = None
    scikit_learn_version: str | None = None


class PredictAreaResponse(BaseModel):
    predicted_area_km2: float
    initial_area_km2: float
    growth_factor: float = Field(..., description="predicted_area_km2 / initial_area_km2")
    inputs: PredictAreaRequest
    warnings: list[str] = Field(default_factory=list, description="e.g. inputs outside the training range")
    model: ModelInfo
    is_synthetic_model: bool = True
    disclaimer: str = DISCLAIMER


# --------------------------------------------------------------------- rank-vessels
class PositionReport(BaseModel):
    """One AIS-style position report. (In this prototype: synthetic.)"""

    model_config = ConfigDict(extra="ignore")

    timestamp: datetime
    latitude: float = Field(..., ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(..., ge=-180, le=180, allow_inf_nan=False)

    @field_validator("timestamp")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return _to_utc(v)


class Vessel(BaseModel):
    model_config = ConfigDict(extra="ignore")  # the UI may attach extra display fields (colour, notes)

    vessel_id: str = Field(..., min_length=1, max_length=64)
    name: str | None = Field(None, max_length=120)
    vessel_type: str | None = Field(None, max_length=60)
    reports: list[PositionReport] = Field(default_factory=list, max_length=10000)


class SpillIncident(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(..., ge=-180, le=180, allow_inf_nan=False)
    start_time: datetime = Field(..., description="Estimated time the spill started (ISO 8601).")

    @field_validator("start_time")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return _to_utc(v)


class RankingParams(BaseModel):
    """Tunable scales for the heuristic. Defaults are documented in docs/RANKING_HEURISTIC.md."""

    model_config = ConfigDict(extra="forbid")

    lookback_hours: float = Field(24.0, gt=0, le=168, description="How far before the start to search.")
    lookahead_hours: float = Field(1.0, ge=0, le=24, description="How far after the start to search.")
    distance_scale_km: float = Field(10.0, gt=0, le=1000, description="Distance at which proximity score falls to 37%.")
    time_scale_hours: float = Field(3.0, gt=0, le=168, description="Time offset at which time score falls to 37%.")
    gap_threshold_hours: float = Field(2.0, gt=0, le=48, description="Report spacing above which a gap is flagged.")
    max_plausible_speed_kmh: float = Field(60.0, gt=0, le=200, description="Faster implied speeds are treated as data errors.")
    gap_relevance_km: float = Field(50.0, gt=0, le=1000, description="Gap bonus applies only if the closest approach is within this distance.")


class RankVesselsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spill: SpillIncident
    vessels: list[Vessel] | None = Field(
        None,
        max_length=500,
        description="Vessel tracks to assess. If omitted, the bundled SYNTHETIC sample vessels are used.",
    )
    params: RankingParams = Field(default_factory=RankingParams)

    @model_validator(mode="after")
    def _unique_ids(self) -> "RankVesselsRequest":
        if self.vessels:
            ids = [v.vessel_id for v in self.vessels]
            dup = sorted({i for i in ids if ids.count(i) > 1})
            if dup:
                raise ValueError(f"Duplicate vessel_id(s): {dup}")
        return self


class LatLon(BaseModel):
    latitude: float
    longitude: float


class ScoreComponents(BaseModel):
    proximity: float = Field(..., description="0-1, from the approach distance.")
    time_alignment: float = Field(..., description="0-1, from time between the approach and spill start.")
    route_consistency: float = Field(..., description="0-1, share of track segments with plausible speed.")
    ais_gap_bonus: float = Field(0.0, description="Small additive bonus when a reporting gap spans the spill start.")


class LeadMetrics(BaseModel):
    approach_km: float = Field(..., description="Distance from the spill at the most relevant approach (see docs).")
    approach_time: datetime
    time_offset_hours: float = Field(..., description="Approach time minus spill start (negative = before).")
    approach_position: LatLon
    ais_gap_at_start_hours: float = Field(..., description="Reporting gap straddling the spill start (0 if none).")
    reports_in_window: int


class VesselLead(BaseModel):
    rank: int
    vessel_id: str
    name: str | None
    vessel_type: str | None
    lead_score: float = Field(..., ge=0, le=1)
    lead_strength: Literal["high", "medium", "low"]
    components: ScoreComponents
    metrics: LeadMetrics
    flags: list[str] = Field(default_factory=list)
    explanation: str


class UnassessedVessel(BaseModel):
    vessel_id: str
    name: str | None
    vessel_type: str | None
    reason: str
    note: str = (
        "Missing or insufficient data means this vessel could not be assessed. "
        "It is a reason to request more data, not evidence of wrongdoing."
    )


class MethodInfo(BaseModel):
    name: str
    formula: str
    weights: dict[str, float]
    parameters: RankingParams
    window_start: datetime
    window_end: datetime


class RankVesselsResponse(BaseModel):
    spill: SpillIncident
    method: MethodInfo
    ranked: list[VesselLead]
    unassessed: list[UnassessedVessel]
    used_sample_vessels: bool
    disclaimer: str = DISCLAIMER


# ------------------------------------------------------------------ explain-incident
class ExplainRequest(BaseModel):
    """Input for POST /explain-incident.

    Pass the spill, and optionally the outputs of /predict-area and /rank-vessels.
    All fields are optional except spill so the frontend can call this at any stage.
    """

    model_config = ConfigDict(extra="forbid")

    spill: SpillIncident
    prediction: PredictAreaResponse | None = Field(
        None,
        description="Response from POST /predict-area. Include for a richer summary.",
    )
    ranking: RankVesselsResponse | None = Field(
        None,
        description="Response from POST /rank-vessels. Include for vessel lead commentary.",
    )
    max_vessels: int = Field(
        3,
        ge=1,
        le=10,
        description="How many top-ranked vessels to mention in the explanation.",
    )
    use_ollama: bool = Field(
        True,
        description="If True, attempt a local Ollama/Gemma model before the template fallback.",
    )


class ExplainResponse(BaseModel):
    """Plain-English incident summary produced by the explanation service."""

    explanation: str = Field(..., description="Markdown-formatted investigation summary.")
    model_used: str = Field(
        ...,
        description="Which generator produced the text: 'gemma-ollama (<model>)' or 'template'.",
    )
    generated_at: datetime
    is_synthetic_data: bool = True
    disclaimer: str = DISCLAIMER
