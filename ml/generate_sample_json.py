"""Generate the SYNTHETIC sample vessel routes and the sample spill scenario (JSON).

    python ml/generate_sample_json.py

The vessels are INVENTED ("Demo ..." names, SYN-xxx ids). They are not real ships and the
position reports are not real AIS records. Each vessel is built around the default demo
spill location so that the ranking heuristic has something instructive to show:

  SYN-001 passes very close, right around the spill start time      -> strongest lead
  SYN-002 passes a few km away, shortly before                      -> medium lead
  SYN-003 passes close but ~14 h before the spill                   -> weak (time mismatch)
  SYN-004 passes close, shortly before, but has an AIS reporting gap
          around the spill start time                               -> flagged: position uncertain
  SYN-005 passes ~120 km away                                       -> negligible lead
  SYN-006 first report is 3 h AFTER the spill start                 -> cannot be assessed (no data)
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from ml import config  # noqa: E402

SPILL_LAT, SPILL_LON = 18.5, 70.0  # open Arabian Sea, arbitrary demo location
SPILL_START = datetime(2026, 1, 15, 6, 0, tzinfo=timezone.utc)  # synthetic date
KM_PER_DEG_LAT = 111.19

# (id, name, type, heading_deg, speed_km_h, pass_hour_rel_spill, cross_track_km, report_hours, gap_hours, note)
VESSELS = [
    ("SYN-001", "Demo Tanker Alpha", "tanker", 90, 24, 0.5, 1.5, (-24, 24), None,
     "Passes ~1.5 km from the demo spill 0.5 h after its start."),
    ("SYN-002", "Demo Cargo Bravo", "cargo", 20, 28, -1.5, 8.0, (-24, 24), None,
     "Passes ~8 km away 1.5 h before the spill start."),
    ("SYN-003", "Demo Bulk Charlie", "bulk_carrier", 135, 22, -14.0, 2.0, (-24, 24), None,
     "Passes ~2 km away but 14 h before the spill start."),
    ("SYN-004", "Demo Tanker Delta", "tanker", 200, 20, -1.0, 6.0, (-24, 24), (-4, 2),
     "Passes ~6 km away 1 h before; no AIS reports from -4 h to +2 h (gap spans spill start)."),
    ("SYN-005", "Demo Ferry Echo", "passenger", 300, 30, 1.0, 120.0, (-24, 24), None,
     "Passes ~120 km away."),
    ("SYN-006", "Demo Trawler Foxtrot", "fishing", 45, 14, 6.0, 5.0, (3, 24), None,
     "Reports only start 3 h after the spill: no data at the spill start time."),
]
COLORS = ["#f59e0b", "#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fb923c"]


def _position(heading_deg: float, speed_kmh: float, pass_hour: float, cross_km: float, hour: float):
    """Straight-line track passing `cross_km` to the left of the spill at `pass_hour`."""
    h = math.radians(heading_deg)
    dir_e, dir_n = math.sin(h), math.cos(h)  # unit vector of travel (east, north)
    left_e, left_n = -dir_n, dir_e  # unit vector 90 deg to the left of travel
    along = speed_kmh * (hour - pass_hour)
    east = along * dir_e + cross_km * left_e
    north = along * dir_n + cross_km * left_n
    lat = SPILL_LAT + north / KM_PER_DEG_LAT
    lon = SPILL_LON + east / (KM_PER_DEG_LAT * math.cos(math.radians(SPILL_LAT)))
    return lat, lon


def build_vessels() -> dict:
    rng = np.random.default_rng(7)
    vessels = []
    for i, (vid, name, vtype, heading, speed, pass_h, cross, (h0, h1), gap, note) in enumerate(VESSELS):
        reports = []
        for hour in range(h0, h1 + 1):
            if gap and gap[0] < hour < gap[1]:
                continue  # AIS gap
            lat, lon = _position(heading, speed, pass_h, cross, hour)
            lat += float(rng.normal(0, 0.0005))  # ~50 m GPS-like jitter
            lon += float(rng.normal(0, 0.0005))
            ts = (SPILL_START + timedelta(hours=hour)).strftime("%Y-%m-%dT%H:%M:%SZ")
            reports.append({"timestamp": ts, "latitude": round(lat, 5), "longitude": round(lon, 5)})
        vessels.append(
            {
                "vessel_id": vid,
                "name": name,
                "vessel_type": vtype,
                "color": COLORS[i % len(COLORS)],
                "demo_note": note,
                "reports": reports,
            }
        )
    return {
        "synthetic": True,
        "disclaimer": (
            "SYNTHETIC DEMONSTRATION DATA. These vessels are invented and the position reports "
            "are NOT real AIS records."
        ),
        "reference_time": SPILL_START.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "vessels": vessels,
    }


def build_scenario() -> dict:
    return {
        "synthetic": True,
        "scenario_id": "SYN-SCENARIO-001",
        "description": "Demonstration spill scenario. Not a real incident.",
        "location": {"latitude": SPILL_LAT, "longitude": SPILL_LON},
        "spill_start_time": SPILL_START.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "initial_area_km2": 4.0,
        "wind_speed_ms": 8.0,
        "current_speed_ms": 0.6,
        "elapsed_hours": 12.0,
        "drift_heading_deg": 60,
        "notes": "drift_heading_deg is used only by the illustrative map footprint, not by the ML model.",
    }


def main() -> None:
    config.DATA_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    config.VESSEL_ROUTES_JSON.write_text(json.dumps(build_vessels(), indent=1), encoding="utf-8")
    config.SPILL_SCENARIO_JSON.write_text(json.dumps(build_scenario(), indent=2), encoding="utf-8")
    print(f"wrote {config.VESSEL_ROUTES_JSON.relative_to(config.ROOT)}")
    print(f"wrote {config.SPILL_SCENARIO_JSON.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
