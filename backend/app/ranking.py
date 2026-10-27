"""Transparent vessel-lead heuristic ("heuristic-v1"). Full write-up: docs/RANKING_HEURISTIC.md

For each vessel we look at its reported track in a time window around the estimated spill
start and compute three 0-1 factors:

  proximity         = exp(-approach_km / distance_scale_km)
  time_alignment    = exp(-|hours between the approach and spill start| / time_scale_hours)
  route_consistency = share of track segments whose implied speed is physically plausible

"The approach" is the most relevant moment in the window: candidates are the closest point of
every track segment plus the interpolated position at the spill start; the candidate giving the
highest lead score is used. For an ordinary straight pass this is simply the closest approach;
it also stops a vessel that loiters near the spill from being judged on an arbitrary moment.

  lead_score = proximity * (W_TIME * time_alignment + W_ROUTE * route_consistency)
               + AIS_GAP_BONUS   (only if a reporting gap straddles the spill start AND the
                                   vessel was within gap_relevance_km; total capped at 1.0)

Proximity acts as a gate: a vessel that was never near the spill cannot score highly.

Missing data is handled explicitly and never treated as guilt:
  * No reports bracketing the spill start  -> "unassessed" (cannot be ranked).
  * A reporting gap straddling the start   -> flagged, and a small bonus keeps the vessel on
    the list for follow-up (e.g. request satellite-AIS or port records). The bonus is a prompt to
    look, not evidence of anything.

The score is a *relative investigative lead*, not a probability and not proof.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from .schemas import (
    LatLon,
    LeadMetrics,
    MethodInfo,
    RankingParams,
    RankVesselsResponse,
    ScoreComponents,
    SpillIncident,
    UnassessedVessel,
    Vessel,
    VesselLead,
)

METHOD_NAME = "heuristic-v1"
W_TIME = 0.75
W_ROUTE = 0.25
AIS_GAP_BONUS = 0.10
FORMULA = (
    "lead_score = proximity * (0.75*time_alignment + 0.25*route_consistency) "
    "+ 0.10 if an AIS gap spans the spill start and the vessel was within gap_relevance_km; capped at 1"
)

EARTH_RADIUS_KM = 6371.0088
HIGH_THRESHOLD = 0.5
MEDIUM_THRESHOLD = 0.25


# ----------------------------------------------------------------------------- geometry
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def _local_xy_km(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Equirectangular projection around (lat0, lon0); accurate enough at tens-hundreds of km."""
    x = math.radians(lon - lon0) * math.cos(math.radians(lat0)) * EARTH_RADIUS_KM
    y = math.radians(lat - lat0) * EARTH_RADIUS_KM
    return x, y


@dataclass(frozen=True)
class _Fix:
    t: datetime
    lat: float
    lon: float


def _hours(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 3600.0


def _lerp_fix(a: _Fix, b: _Fix, t: datetime) -> _Fix:
    span = (b.t - a.t).total_seconds()
    f = 0.0 if span == 0 else (t - a.t).total_seconds() / span
    return _Fix(t, a.lat + f * (b.lat - a.lat), a.lon + f * (b.lon - a.lon))


def _segment_closest_approach(a: _Fix, b: _Fix, lat0: float, lon0: float) -> tuple[float, _Fix]:
    """Closest point to the spill on the straight segment a->b (planar). Returns (s, fix)."""
    ax, ay = _local_xy_km(a.lat, a.lon, lat0, lon0)
    bx, by = _local_xy_km(b.lat, b.lon, lat0, lon0)
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    s = 0.0 if len2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / len2))
    t = a.t + timedelta(seconds=s * (b.t - a.t).total_seconds())
    return s, _lerp_fix(a, b, t)


# ----------------------------------------------------------------------------- assessment
def _prepare_fixes(vessel: Vessel) -> list[_Fix]:
    seen: set[datetime] = set()
    fixes: list[_Fix] = []
    for r in sorted(vessel.reports, key=lambda r: r.timestamp):
        if r.timestamp in seen:
            continue
        seen.add(r.timestamp)
        fixes.append(_Fix(r.timestamp, r.latitude, r.longitude))
    return fixes


def _strength(score: float) -> str:
    if score >= HIGH_THRESHOLD:
        return "high"
    if score >= MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def assess_vessel(
    vessel: Vessel, spill: SpillIncident, params: RankingParams
) -> VesselLead | UnassessedVessel:
    """Return a scored lead (rank=0 placeholder) or an UnassessedVessel with the reason."""

    def unassessed(reason: str) -> UnassessedVessel:
        return UnassessedVessel(
            vessel_id=vessel.vessel_id, name=vessel.name, vessel_type=vessel.vessel_type, reason=reason
        )

    fixes = _prepare_fixes(vessel)
    t0 = spill.start_time
    if len(fixes) < 2:
        return unassessed("Fewer than 2 position reports supplied.")
    if not (fixes[0].t <= t0 <= fixes[-1].t):
        return unassessed(
            "No position reports bracket the estimated spill start time "
            f"(reports span {fixes[0].t:%Y-%m-%d %H:%M}Z to {fixes[-1].t:%Y-%m-%d %H:%M}Z, "
            f"spill start {t0:%Y-%m-%d %H:%M}Z), so its position then cannot be estimated."
        )

    window_start = max(t0 - timedelta(hours=params.lookback_hours), fixes[0].t)
    window_end = min(t0 + timedelta(hours=params.lookahead_hours), fixes[-1].t)

    candidates: list[tuple[_Fix, float]] = []  # (fix, distance_km)
    segments_in_window = 0
    plausible_segments = 0
    reports_in_window = sum(1 for f in fixes if window_start <= f.t <= window_end)
    gaps_in_window = 0
    gap_at_start_hours = 0.0

    def add_candidate(fix: _Fix) -> None:
        candidates.append((fix, haversine_km(fix.lat, fix.lon, spill.latitude, spill.longitude)))

    for a, b in zip(fixes, fixes[1:]):
        if b.t <= window_start or a.t >= window_end:
            continue
        seg_hours = _hours(a.t, b.t)

        # route consistency uses the full (unclipped) segment
        segments_in_window += 1
        speed = haversine_km(a.lat, a.lon, b.lat, b.lon) / seg_hours
        if speed <= params.max_plausible_speed_kmh:
            plausible_segments += 1

        # AIS gaps
        if seg_hours > params.gap_threshold_hours:
            if a.t < t0 < b.t:
                gap_at_start_hours = seg_hours
            else:
                gaps_in_window += 1

        # closest point to the spill on the part of the segment inside the window
        ca = a if a.t >= window_start else _lerp_fix(a, b, window_start)
        cb = b if b.t <= window_end else _lerp_fix(a, b, window_end)
        _, fix = _segment_closest_approach(ca, cb, spill.latitude, spill.longitude)
        add_candidate(fix)
        if a.t <= t0 <= b.t:  # where was the vessel at the spill start itself?
            add_candidate(_lerp_fix(a, b, t0))

    if not candidates:  # should not happen because t0 is bracketed, but never crash
        return unassessed("No usable track segment in the search window.")

    route_consistency = plausible_segments / segments_in_window if segments_in_window else 1.0

    def core_score(fix: _Fix, dist: float) -> float:
        prox = math.exp(-dist / params.distance_scale_km)
        tal = math.exp(-abs(_hours(t0, fix.t)) / params.time_scale_hours)
        return prox * (W_TIME * tal + W_ROUTE * route_consistency)

    best_fix, best_dist = max(candidates, key=lambda c: (core_score(c[0], c[1]), -c[1]))
    time_offset = _hours(t0, best_fix.t)
    proximity = math.exp(-best_dist / params.distance_scale_km)
    time_alignment = math.exp(-abs(time_offset) / params.time_scale_hours)

    flags: list[str] = []
    bonus = 0.0
    if gap_at_start_hours > 0:
        flags.append(
            f"AIS reporting gap of {gap_at_start_hours:.1f} h spans the spill start: "
            "position at that time is interpolated and uncertain."
        )
        if best_dist <= params.gap_relevance_km:
            bonus = AIS_GAP_BONUS
            flags.append(
                "Gap bonus applied: worth requesting further data (e.g. satellite AIS, port records). "
                "This is NOT evidence of wrongdoing."
            )
    if gaps_in_window:
        flags.append(f"{gaps_in_window} other reporting gap(s) longer than {params.gap_threshold_hours:g} h in the window.")
    if route_consistency < 1.0:
        flags.append("Some track segments imply implausible speeds (possible data errors).")

    core = proximity * (W_TIME * time_alignment + W_ROUTE * route_consistency)
    score = min(1.0, core + bonus)
    when = "after" if time_offset > 0 else "before"
    explanation = (
        f"Best approach {best_dist:.1f} km, {abs(time_offset):.1f} h {when} the estimated spill start. "
        f"Proximity {proximity:.2f}, time alignment {time_alignment:.2f}, route consistency {route_consistency:.2f}"
        + (f", plus {bonus:.2f} AIS-gap bonus" if bonus else "")
        + f". Relative lead strength: {_strength(score)}. An investigative lead only, not proof."
    )

    return VesselLead(
        rank=0,
        vessel_id=vessel.vessel_id,
        name=vessel.name,
        vessel_type=vessel.vessel_type,
        lead_score=round(score, 4),
        lead_strength=_strength(score),  # type: ignore[arg-type]
        components=ScoreComponents(
            proximity=round(proximity, 4),
            time_alignment=round(time_alignment, 4),
            route_consistency=round(route_consistency, 4),
            ais_gap_bonus=bonus,
        ),
        metrics=LeadMetrics(
            approach_km=round(best_dist, 3),
            approach_time=best_fix.t,
            time_offset_hours=round(time_offset, 3),
            approach_position=LatLon(latitude=round(best_fix.lat, 5), longitude=round(best_fix.lon, 5)),
            ais_gap_at_start_hours=round(gap_at_start_hours, 3),
            reports_in_window=reports_in_window,
        ),
        flags=flags,
        explanation=explanation,
    )


def rank_vessels(
    vessels: list[Vessel], spill: SpillIncident, params: RankingParams, used_sample: bool = False
) -> RankVesselsResponse:
    leads: list[VesselLead] = []
    skipped: list[UnassessedVessel] = []
    for v in vessels:
        result = assess_vessel(v, spill, params)
        (leads if isinstance(result, VesselLead) else skipped).append(result)  # type: ignore[arg-type]

    leads.sort(key=lambda l: (-l.lead_score, l.metrics.approach_km, l.vessel_id))
    for i, lead in enumerate(leads, start=1):
        lead.rank = i

    return RankVesselsResponse(
        spill=spill,
        method=MethodInfo(
            name=METHOD_NAME,
            formula=FORMULA,
            weights={"time_alignment": W_TIME, "route_consistency": W_ROUTE, "ais_gap_bonus": AIS_GAP_BONUS},
            parameters=params,
            window_start=spill.start_time - timedelta(hours=params.lookback_hours),
            window_end=spill.start_time + timedelta(hours=params.lookahead_hours),
        ),
        ranked=leads,
        unassessed=skipped,
        used_sample_vessels=used_sample,
    )
