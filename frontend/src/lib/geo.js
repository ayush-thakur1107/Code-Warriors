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
const VESSEL_REGISTRY_METADATA = {
  'SYN-001': { flag: '🇱🇷', mmsi: 636019241, imo: 9428516, destination: 'IN BOM (Mumbai Port)', speedKnots: 14.2, draught: '12.4 m' },
  'SYN-002': { flag: '🇵🇦', mmsi: 352002489, imo: 9381024, destination: 'AE JEA (Jebel Ali)', speedKnots: 16.8, draught: '11.0 m' },
  'SYN-003': { flag: '🇲🇭', mmsi: 538007123, imo: 9601429, destination: 'SG SIN (Singapore)', speedKnots: 11.5, draught: '13.2 m' },
  'SYN-004': { flag: '🇬🇧', mmsi: 235089124, imo: 9518820, destination: 'IN KAN (Kandla)', speedKnots: 13.9, draught: '10.8 m' },
  'SYN-005': { flag: '🇮🇳', mmsi: 419001882, imo: 9210945, destination: 'IN GOA (Mormugao)', speedKnots: 18.0, draught: '5.2 m' },
  'SYN-006': { flag: '🇮🇳', mmsi: 419000101, imo: 9112233, destination: 'COAST GUARD PATROL', speedKnots: 22.4, draught: '3.8 m' },
}

// Pre-parse timestamps once so the per-frame lookup is cheap.
export function prepareVessel(v) {
  const fixes = v.reports
    .map((r) => ({ t: Date.parse(r.timestamp), lat: r.latitude, lon: r.longitude }))
    .sort((a, b) => a.t - b.t)
  const meta = VESSEL_REGISTRY_METADATA[v.vessel_id] || { flag: '🚩', mmsi: 235000000, imo: 9000000, destination: 'HIGH SEAS', speedKnots: 12.0, draught: '8.0 m' }
  return { ...v, ...meta, fixes }
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
