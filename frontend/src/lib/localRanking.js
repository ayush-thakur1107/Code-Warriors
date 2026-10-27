// Local fallback ranking heuristic that mirrors backend/app/ranking.py exactly.
// Guarantees that Leads are ALWAYS calculated and displayed, even if backend is offline.

const W_TIME = 0.75
const W_ROUTE = 0.25
const AIS_GAP_BONUS = 0.10
const DISTANCE_SCALE_KM = 10.0
const TIME_SCALE_HOURS = 3.0
const GAP_THRESHOLD_HOURS = 2.0

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function rankVesselsLocally(spill, vessels) {
  if (!spill || !vessels || !vessels.length) return { ranked: [], unassessed: [] }

  const spillStartMs = Date.parse(spill.startTime || '2026-01-15T06:00:00Z')
  const ranked = []
  const unassessed = []

  const spillLat = spill.lat ?? spill.latitude
  const spillLon = spill.lon ?? spill.longitude
  if (spillLat == null || spillLon == null) return { ranked: [], unassessed: [] }

  vessels.forEach((v) => {
    const fixes = v.fixes || v.reports?.map((r) => ({
      t: Date.parse(r.timestamp),
      lat: r.latitude,
      lon: r.longitude,
    }))

    if (!fixes || fixes.length < 2) {
      unassessed.push({
        vessel_id: v.vessel_id,
        name: v.name,
        vessel_type: v.vessel_type,
        reason: 'Insufficient position fixes in analysis window.',
      })
      return
    }

    // Find closest approach and whether in an AIS gap
    let minDistanceKm = Infinity
    let bestFix = fixes[0]
    let inGap = false
    let maxGapHours = 0

    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i]
      const dist = haversineKm(spillLat, spillLon, fix.lat, fix.lon)
      if (dist < minDistanceKm) {
        minDistanceKm = dist
        bestFix = fix
      }

      if (i < fixes.length - 1) {
        const gapH = (fixes[i + 1].t - fix.t) / 3600e3
        if (gapH > GAP_THRESHOLD_HOURS) {
          maxGapHours = Math.max(maxGapHours, gapH)
          // check if gap straddles spill start
          if (fix.t <= spillStartMs && fixes[i + 1].t >= spillStartMs) {
            inGap = true
          }
        }
      }
    }

    const timeDeltaH = (bestFix.t - spillStartMs) / 3600e3

    // Heuristic scores
    const proximityScore = Math.exp(-minDistanceKm / DISTANCE_SCALE_KM)
    const timeScore = Math.exp(-Math.abs(timeDeltaH) / TIME_SCALE_HOURS)
    const routeConsistency = 0.95 // plausible speeds

    let leadScore = proximityScore * (W_TIME * timeScore + W_ROUTE * routeConsistency)
    if (inGap && minDistanceKm < 50.0) {
      leadScore += AIS_GAP_BONUS
    }
    leadScore = Math.min(1.0, Math.max(0.0, leadScore))

    let strength = 'low'
    if (leadScore >= 0.5) strength = 'high'
    else if (leadScore >= 0.25) strength = 'medium'

    ranked.push({
      vessel_id: v.vessel_id,
      name: v.name,
      vessel_type: v.vessel_type,
      score: leadScore,
      strength,
      metrics: {
        approach_km: minDistanceKm,
        approach_delta_h: timeDeltaH,
        approach_position: { latitude: bestFix.lat, longitude: bestFix.lon },
        in_gap: inGap,
        gap_hours: maxGapHours,
      },
      components: {
        proximity_score: proximityScore,
        time_score: timeScore,
        gap_score: inGap ? AIS_GAP_BONUS : 0,
      },
    })
  })

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score)
  ranked.forEach((r, idx) => {
    r.rank = idx + 1
  })

  return { ranked, unassessed }
}
