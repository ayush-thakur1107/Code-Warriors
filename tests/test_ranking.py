"""Behaviour of the transparent ranking heuristic on the bundled SYNTHETIC vessels."""
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.ranking import rank_vessels
from app.schemas import PositionReport, RankingParams, SpillIncident, Vessel
from ml import config


@pytest.fixture(scope="module")
def sample():
    scenario = json.loads(config.SPILL_SCENARIO_JSON.read_text())
    spill = SpillIncident(
        latitude=scenario["location"]["latitude"],
        longitude=scenario["location"]["longitude"],
        start_time=scenario["spill_start_time"],
    )
    vessels = [Vessel(**v) for v in json.loads(config.VESSEL_ROUTES_JSON.read_text())["vessels"]]
    return spill, vessels


def test_expected_order_on_sample_data(sample):
    spill, vessels = sample
    res = rank_vessels(vessels, spill, RankingParams())
    order = [r.vessel_id for r in res.ranked]
    assert order[:2] == ["SYN-001", "SYN-004"]  # close + simultaneous; close + gap
    assert order.index("SYN-002") < order.index("SYN-003") < order.index("SYN-005")
    assert [r.rank for r in res.ranked] == list(range(1, len(order) + 1))
    assert all(0 <= r.lead_score <= 1 for r in res.ranked)


def test_no_data_vessel_is_unassessed_not_scored(sample):
    spill, vessels = sample
    res = rank_vessels(vessels, spill, RankingParams())
    assert [u.vessel_id for u in res.unassessed] == ["SYN-006"]
    assert "not evidence of wrongdoing" in res.unassessed[0].note
    assert "SYN-006" not in [r.vessel_id for r in res.ranked]


def test_ais_gap_is_flagged_and_bonus_is_small(sample):
    spill, vessels = sample
    res = rank_vessels(vessels, spill, RankingParams())
    delta = next(r for r in res.ranked if r.vessel_id == "SYN-004")
    assert delta.metrics.ais_gap_at_start_hours > 2
    assert delta.components.ais_gap_bonus == pytest.approx(0.10)
    assert any("NOT evidence of wrongdoing" in f for f in delta.flags)
    alpha = next(r for r in res.ranked if r.vessel_id == "SYN-001")
    assert alpha.lead_score > delta.lead_score  # a gap alone never outranks a confirmed close pass


def test_far_vessel_scores_near_zero(sample):
    spill, vessels = sample
    res = rank_vessels(vessels, spill, RankingParams())
    echo = next(r for r in res.ranked if r.vessel_id == "SYN-005")
    assert echo.lead_score < 0.05 and echo.lead_strength == "low"


def test_vessel_with_one_report_is_unassessed(sample):
    spill, _ = sample
    v = Vessel(vessel_id="X", reports=[PositionReport(timestamp=spill.start_time, latitude=18.5, longitude=70.0)])
    res = rank_vessels([v], spill, RankingParams())
    assert res.ranked == [] and len(res.unassessed) == 1


def test_vessel_sitting_on_spill_at_start_scores_high():
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    spill = SpillIncident(latitude=10.0, longitude=70.0, start_time=t0)
    reports = [PositionReport(timestamp=t0 + timedelta(hours=h), latitude=10.0, longitude=70.0) for h in (-2, -1, 0, 1)]
    res = rank_vessels([Vessel(vessel_id="STILL", reports=reports)], spill, RankingParams())
    lead = res.ranked[0]
    assert lead.metrics.approach_km < 0.01
    assert lead.lead_score > 0.99
    assert lead.lead_strength == "high"


def test_implausible_speed_lowers_route_consistency():
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    spill = SpillIncident(latitude=10.0, longitude=70.0, start_time=t0)
    reports = [
        PositionReport(timestamp=t0 - timedelta(hours=1), latitude=10.0, longitude=70.0),
        PositionReport(timestamp=t0, latitude=10.0, longitude=70.0),
        PositionReport(timestamp=t0 + timedelta(minutes=30), latitude=13.0, longitude=70.0),  # ~330 km in 0.5 h
    ]
    res = rank_vessels([Vessel(vessel_id="JUMP", reports=reports)], spill, RankingParams(lookahead_hours=1))
    lead = res.ranked[0]
    assert lead.components.route_consistency < 1.0
    assert any("implausible" in f for f in lead.flags)
