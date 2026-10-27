// All backend communication lives here. Request shapes mirror backend/app/schemas.py.
import { API_BASE } from './config.js'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', howToFix = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.howToFix = howToFix
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(`Cannot reach the backend at ${API_BASE}. Is it running?`, { code: 'network' })
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new ApiError(data?.message || data?.detail || `Request failed (HTTP ${res.status})`, {
      status: res.status,
      code: data?.error || 'http_error',
      howToFix: data?.how_to_fix || null,
    })
  }
  return data
}

export const getHealth = (signal) => request('/health', { signal })

// POST /predict-area
export const buildPredictRequest = ({ initialAreaKm2, windSpeedMs, currentSpeedMs, elapsedHours }) => ({
  initial_area_km2: initialAreaKm2,
  wind_speed_ms: windSpeedMs,
  current_speed_ms: currentSpeedMs,
  elapsed_hours: elapsedHours,
})
export const predictArea = (params, signal) =>
  request('/predict-area', { method: 'POST', body: buildPredictRequest(params), signal })

// POST /rank-vessels
export const buildRankRequest = ({ latitude, longitude, startTime, vessels }) => ({
  spill: { latitude, longitude, start_time: startTime },
  vessels: vessels.map((v) => ({
    vessel_id: v.vessel_id,
    name: v.name,
    vessel_type: v.vessel_type,
    reports: v.reports.map((r) => ({ timestamp: r.timestamp, latitude: r.latitude, longitude: r.longitude })),
  })),
})
export const rankVessels = (args, signal) =>
  request('/rank-vessels', { method: 'POST', body: buildRankRequest(args), signal })
