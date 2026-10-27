import { MODEL_RANGES } from '../config.js'
import { fmt } from '../lib/format.js'

function Slider({ label, unit, value, min, max, step, onChange, hint, digits = 1, icon }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{icon && <span style={{ marginRight: 6 }}>{icon}</span>}{label}</span>
        <output>
          {fmt(value, digits)} <small>{unit}</small>
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(90deg, rgba(45, 212, 191, 0.3) 0%, rgba(34, 211, 238, 0.2) ${pct}%, rgba(30, 55, 80, 0.5) ${pct}%)`,
        }}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export default function ControlsPanel({ params, setParam, onLoadSample, onClear, hasSpill }) {
  const R = MODEL_RANGES
  return (
    <section className="panel">
      <h2><span style={{ fontSize: 14 }}>⚙</span> Incident controls</h2>
      <p className="note">Click anywhere on the map to place a simulated spill.</p>
      <Slider icon="📐" label="Initial area" unit="km²" value={params.initialAreaKm2} min={R.initialAreaKm2[0]} max={R.initialAreaKm2[1]} step={0.5} onChange={(v) => setParam('initialAreaKm2', v)} />
      <Slider icon="💨" label="Wind speed" unit="m/s" value={params.windSpeedMs} min={R.windSpeedMs[0]} max={R.windSpeedMs[1]} step={0.5} onChange={(v) => setParam('windSpeedMs', v)} />
      <Slider icon="🌊" label="Current speed" unit="m/s" value={params.currentSpeedMs} min={R.currentSpeedMs[0]} max={R.currentSpeedMs[1]} step={0.05} digits={2} onChange={(v) => setParam('currentSpeedMs', v)} />
      <Slider icon="🧭" label="Drift heading" unit="°" value={params.headingDeg} min={0} max={355} step={5} digits={0} onChange={(v) => setParam('headingDeg', v)} hint="Used only to draw the illustrative footprint; not a model input." />
      <p className="hint">Elapsed time is the timeline slider under the map. Slider ranges match the synthetic training data.</p>
      <div className="btn-row">
        <button type="button" onClick={onLoadSample}>
          <span style={{ marginRight: 6 }}>📍</span>Load sample scenario
        </button>
        <button type="button" className="ghost" onClick={onClear} disabled={!hasSpill}>
          <span style={{ marginRight: 6 }}>✕</span>Clear spill
        </button>
      </div>
    </section>
  )
}
