# Vessel-lead heuristic (`heuristic-v1`)

Code: `backend/app/ranking.py`. It ranks vessels as **investigative leads**. It is not a probability
and not proof of anything. It is deliberately simple so that every number can be explained.

## Inputs
The estimated spill location and start time T0, and each vessel's position reports (timestamp, lat, lon).
Positions between reports are linearly interpolated.

## Search window
From `T0 − lookback_hours` (default 24 h) to `T0 + lookahead_hours` (default 1 h), clipped to the vessel's reports.

## Factors (each 0–1)
| Factor | Definition | Default scale |
|---|---|---|
| proximity | `exp(−d / distance_scale_km)` | 10 km |
| time_alignment | `exp(−|Δt| / time_scale_hours)`, Δt = approach time − T0 | 3 h |
| route_consistency | share of track segments whose implied speed ≤ `max_plausible_speed_kmh` (flags data errors) | 60 km/h |

`d` and `Δt` come from the **most relevant approach**: candidates are the closest point of every track
segment in the window plus the interpolated position at T0; the one with the highest score is used.

## Score
```
lead_score = proximity × (0.75 × time_alignment + 0.25 × route_consistency)  [+ 0.10 AIS-gap bonus]   capped at 1
```
Proximity multiplies everything, so a vessel that was never near the spill cannot rank highly.
`lead_strength`: high ≥ 0.5, medium ≥ 0.25, else low (relative labels, not statistics).

## Missing data
- **No reports bracketing T0** (or fewer than 2 reports) → listed under `unassessed`, with the reason. Not scored.
- **Reporting gap spanning T0** (longer than `gap_threshold_hours`) → flagged. If the vessel was within `gap_relevance_km` (50 km), a small **+0.10** bonus keeps it visible for follow-up (satellite AIS, port records). The bonus is a prompt to ask for more data, **not** evidence of wrongdoing; tests verify a gap alone never outranks a confirmed close pass.

## Limitations
Ignores drift (a vessel upstream earlier may matter), vessel size/cargo, intent, other evidence, spoofing, and position error.
Weights and scales are judgement calls, not calibrated on real cases. Tune via `params` and discuss, don't trust blindly.
