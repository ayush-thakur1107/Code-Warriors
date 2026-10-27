// Base URL of the FastAPI backend. Not a secret: it is public in the browser bundle.
export const API_BASE = (import.meta.env?.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

// Mirrors ml/features.py GENERATOR_RANGES. The sliders stay inside what the model was trained on.
export const MODEL_RANGES = {
  initialAreaKm2: [0.5, 20],
  windSpeedMs: [0, 20],
  currentSpeedMs: [0, 1.5],
  elapsedHours: [0, 72],
}
export const GAP_THRESHOLD_HOURS = 2 // matches the backend default, used only to draw dashed gaps
