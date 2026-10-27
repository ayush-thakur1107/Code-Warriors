// ILLUSTRATIVE spill visualisation. NOT a validated oil-spill simulation and NOT fluid dynamics:
//  - the centre drifts along one user-chosen heading at (current + 3% of wind) speed,
//  - the shape is an ellipse stretched a little more by wind and current,
//  - the AREA comes from the backend's synthetic-data model when available (else a fallback formula).
import { destinationPoint, ellipsePolygon } from './geo.js'

export const WIND_DRIFT_FACTOR = 0.03 // common rule-of-thumb order of magnitude; used for drawing only

export function fallbackArea(initialAreaKm2, elapsedHours) {
  return initialAreaKm2 * (1 + 0.3 * Math.sqrt(elapsedHours))
}

export function illustrativeFootprint({ lat, lon, areaKm2, windSpeedMs, currentSpeedMs, elapsedHours, headingDeg }) {
  const driftMs = currentSpeedMs + WIND_DRIFT_FACTOR * windSpeedMs
  const driftKm = driftMs * 3.6 * elapsedHours
  const [cLat, cLon] = destinationPoint(lat, lon, headingDeg, driftKm)
  const aspect = 1 + Math.min(2, 0.06 * windSpeedMs + 0.8 * currentSpeedMs)
  return {
    centroid: [cLat, cLon],
    driftKm,
    aspect,
    polygon: ellipsePolygon(cLat, cLon, Math.max(areaKm2, 0.01), aspect, headingDeg),
  }
}
