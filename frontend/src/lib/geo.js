// Small geometry helpers (flat-earth approximations: fine for tens of km, illustrative only).
export const KM_PER_DEG_LAT = 111.19
const rad = (d) => (d * Math.PI) / 180

export function offsetLatLon(lat, lon, eastKm, northKm) {
  return [lat + northKm / KM_PER_DEG_LAT, lon + eastKm / (KM_PER_DEG_LAT * Math.cos(rad(lat)))]
}

export function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  return offsetLatLon(lat, lon, distanceKm * Math.sin(rad(bearingDeg)), distanceKm * Math.cos(rad(bearingDeg)))
}

// Ellipse of given area whose long axis points along bearingDeg. Returns [[lat, lon], ...].
export function ellipsePolygon(lat, lon, areaKm2, aspect, bearingDeg, n = 72) {
  const a = Math.sqrt((areaKm2 * aspect) / Math.PI) // semi-major, km
  const b = areaKm2 / (Math.PI * a) // semi-minor, km
  const e = Math.sin(rad(bearingDeg)), nn = Math.cos(rad(bearingDeg))
  const pts = []
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n
    const x = a * Math.cos(th), y = b * Math.sin(th)
    pts.push(offsetLatLon(lat, lon, x * e - y * nn, x * nn + y * e))
  }
  return pts
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const dy = lat2 - lat1
  const dx = (lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2))
  return (Math.atan2(dx, dy) * 180) / Math.PI
}

// ---- vessel tracks -------------------------------------------------------------------------
// Pre-parse timestamps once so the per-frame lookup is cheap.
export function prepareVessel(v) {
  const fixes = v.reports
    .map((r) => ({ t: Date.parse(r.timestamp), lat: r.latitude, lon: r.longitude }))
    .sort((a, b) => a.t - b.t)
  return { ...v, fixes }
}

// Position at time tMs: { lat, lon, bearing, state } where state is 'active' | 'gap' | 'ended'
// | 'not-started'. Linear interpolation between reports (this is what the backend assumes too).
export function positionAt(vessel, tMs, gapMs) {
  const f = vessel.fixes
  if (!f.length) return null
  if (tMs < f[0].t) return { ...f[0], bearing: 0, state: 'not-started' }
  const last = f[f.length - 1]
  if (tMs > last.t) return { ...last, bearing: 0, state: 'ended' }
  for (let i = 0; i < f.length - 1; i++) {
    const a = f[i], b = f[i + 1]
    if (tMs >= a.t && tMs <= b.t) {
      const k = b.t === a.t ? 0 : (tMs - a.t) / (b.t - a.t)
      return {
        lat: a.lat + k * (b.lat - a.lat),
        lon: a.lon + k * (b.lon - a.lon),
        bearing: bearingDeg(a.lat, a.lon, b.lat, b.lon),
        state: b.t - a.t > gapMs ? 'gap' : 'active',
      }
    }
  }
  return { ...last, bearing: 0, state: 'ended' }
}

// Split a track into solid pieces (normal reporting) and dashed bridges (reporting gaps).
export function trackPieces(vessel, gapMs) {
  const solid = []
  const gaps = []
  let cur = []
  const f = vessel.fixes
  for (let i = 0; i < f.length; i++) {
    cur.push([f[i].lat, f[i].lon])
    const next = f[i + 1]
    if (next && next.t - f[i].t > gapMs) {
      solid.push(cur)
      gaps.push([[f[i].lat, f[i].lon], [next.lat, next.lon]])
      cur = []
    }
  }
  if (cur.length) solid.push(cur)
  return { solid, gaps }
}
