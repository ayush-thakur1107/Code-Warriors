"""Create a deterministic, explicitly synthetic port-to-port demo fleet.

Run from the repository root: python ml/generate_ship_traffic.py
The paths are illustrative corridors, not official shipping lanes or observed AIS.
"""
from __future__ import annotations

import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml import config

FLEET_SIZE = 1000
SEED = 2047
REPORT_STEP_HOURS = 2
VESSEL_TYPES = ("cargo", "tanker", "container", "bulk_carrier", "passenger")
TYPE_SPEED_KMH = {
    "cargo": (24.0, 34.0),
    "tanker": (18.0, 27.0),
    "container": (30.0, 41.0),
    "bulk_carrier": (20.0, 29.0),
    "passenger": (28.0, 38.0),
}
COLORS = {
    "cargo": "#4fc3d7",
    "tanker": "#f2a65a",
    "container": "#7c9cff",
    "bulk_carrier": "#b794f4",
    "passenger": "#60d394",
}


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def point_on_route(points: list[tuple[float, float]], along_km: float) -> tuple[float, float]:
    """Interpolate by distance along the hand-drawn ocean corridor."""
    for a, b in zip(points, points[1:]):
        leg = distance_km(a, b)
        if along_km <= leg:
            f = 0.0 if leg == 0 else along_km / leg
            return a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])
        along_km -= leg
    return points[-1]


def offset_route(points: list[tuple[float, float]], cross_track_km: float) -> list[tuple[float, float]]:
    """Create a subtle parallel track, tapering to the exact port coordinates at each end."""
    result = []
    for i, (lat, lon) in enumerate(points):
        a, b = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
        east = (b[1] - a[1]) * math.cos(math.radians(lat))
        north = b[0] - a[0]
        norm = math.hypot(east, north) or 1.0
        taper = min(1.0, i / 2, (len(points) - 1 - i) / 2)
        shift = cross_track_km * taper
        east_km, north_km = (-north / norm) * shift, (east / norm) * shift
        result.append((lat + north_km / 111.19, lon + east_km / (111.19 * math.cos(math.radians(lat)))))
    return result


def make_reports(points: list[tuple[float, float]], speed_kmh: float, depart: datetime) -> tuple[list[dict], float]:
    total_km = sum(distance_km(a, b) for a, b in zip(points, points[1:]))
    duration = total_km / speed_kmh
    count = max(1, math.ceil(duration / REPORT_STEP_HOURS))
    reports = []
    for i in range(count + 1):
        hour = duration * i / count
        lat, lon = point_on_route(points, total_km * i / count)
        timestamp = (depart + timedelta(hours=hour)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        reports.append({"timestamp": timestamp, "latitude": round(lat, 5), "longitude": round(lon, 5)})
    return reports, duration


def build_fleet() -> dict:
    rng = random.Random(SEED)
    network = json.loads(config.SHIPPING_NETWORK_JSON.read_text(encoding="utf-8"))
    scenario = json.loads(config.SPILL_SCENARIO_JSON.read_text(encoding="utf-8"))
    reference = datetime.fromisoformat(scenario["spill_start_time"].replace("Z", "+00:00"))
    demo_hour = float(scenario["elapsed_hours"])
    ports = {p["id"]: p for p in network["ports"]}
    routes = []
    for edge in network["routes"]:
        route_points = [(ports[edge["from"]]["latitude"], ports[edge["from"]]["longitude"])]
        route_points += [tuple(p) for p in edge["waypoints"]]
        route_points += [(ports[edge["to"]]["latitude"], ports[edge["to"]]["longitude"])]
        routes.append((edge, route_points))

    vessels = []
    for n in range(1, FLEET_SIZE + 1):
        edge, route_points = rng.choice(routes)
        forward = bool(rng.getrandbits(1))
        if not forward:
            route_points = list(reversed(route_points))
            origin, destination = edge["to"], edge["from"]
        else:
            origin, destination = edge["from"], edge["to"]
        vessel_type = rng.choice(VESSEL_TYPES)
        speed = rng.uniform(*TYPE_SPEED_KMH[vessel_type])
        cross_track = rng.uniform(-1.6, 1.6)
        route_points = offset_route(route_points, cross_track)
        duration = sum(distance_km(a, b) for a, b in zip(route_points, route_points[1:])) / speed
        # Stage the fleet so ships are underway in the default T+12 h view. The timeline
        # still shows earlier departures and later arrivals at their origin/destination ports.
        progress_at_demo = rng.uniform(0.10, 0.90)
        depart = reference + timedelta(hours=demo_hour - duration * progress_at_demo)
        reports, duration = make_reports(route_points, speed, depart)
        # Tiny name variation is deterministic; IDs stay visibly synthetic and cannot be
        # mistaken for MMSI or IMO identifiers.
        name = f"Demo {rng.choice(('Meridian', 'Pelagic', 'Bluewater', 'Tideway', 'Seaward'))} {n:04d}"
        vessels.append({
            "vessel_id": f"SIM-{n:05d}",
            "name": name,
            "vessel_type": vessel_type,
            "color": COLORS[vessel_type],
            "origin_port": origin,
            "destination_port": destination,
            "speed_kmh": round(speed, 1),
            "demo_note": "Procedurally generated port-to-port route; not observed AIS.",
            "reports": reports,
        })
    return {
        "synthetic": True,
        "disclaimer": "SIMULATED FLEET. All vessel identities, departures, speeds, and position reports are invented; not live or historical AIS.",
        "reference_time": scenario["spill_start_time"],
        "fleet_size": len(vessels),
        "report_interval_hours": REPORT_STEP_HOURS,
        "ports": network["ports"],
        "route_note": network["route_note"],
        "vessels": vessels,
    }


def validate_fleet(fleet: dict) -> None:
    """Sanity-check that every simulated journey starts/ends at listed port coordinates."""
    ports = {p["id"]: (p["latitude"], p["longitude"]) for p in fleet["ports"]}
    assert len(fleet["vessels"]) == FLEET_SIZE
    for vessel in fleet["vessels"]:
        reports = vessel["reports"]
        assert vessel["origin_port"] in ports and vessel["destination_port"] in ports
        assert (reports[0]["latitude"], reports[0]["longitude"]) == tuple(round(v, 5) for v in ports[vessel["origin_port"]])
        assert (reports[-1]["latitude"], reports[-1]["longitude"]) == tuple(round(v, 5) for v in ports[vessel["destination_port"]])
        assert all(-90 <= r["latitude"] <= 90 and -180 <= r["longitude"] <= 180 for r in reports)
        assert all(reports[i]["timestamp"] < reports[i + 1]["timestamp"] for i in range(len(reports) - 1))


def main() -> None:
    fleet = build_fleet()
    validate_fleet(fleet)
    config.VESSEL_TRAFFIC_JSON.write_text(json.dumps(fleet, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(fleet['vessels']):,} synthetic port-to-port vessels to {config.VESSEL_TRAFFIC_JSON}")


if __name__ == "__main__":
    main()
