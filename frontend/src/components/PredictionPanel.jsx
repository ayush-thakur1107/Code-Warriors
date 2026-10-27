import { fmt } from '../lib/format.js'

function StatPill({ label, value }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 'var(--radius-pill)',
      background: 'rgba(45, 212, 191, 0.06)',
      border: '1px solid rgba(45, 212, 191, 0.1)',
      fontSize: 12,
      fontFamily: 'var(--mono)',
      fontWeight: 500,
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--accent)' }}>{value}</span>
    </div>
  )
}

export default function PredictionPanel({ status, prediction, hasSpill }) {
  const { data, error, loading } = prediction
  return (
    <section className="panel">
      <h2>
        <span style={{ fontSize: 14 }}>📊</span>
        Area prediction <span className="tag tag-exp">experimental</span>
      </h2>
      {status.state === 'offline' && (
        <div className="alert alert-bad">
          <strong>⚡ Backend offline.</strong> {status.message}
          <code>python -m uvicorn app.main:app --app-dir backend --reload --port 8000</code>
        </div>
      )}
      {status.state === 'model-missing' && (
        <div className="alert alert-warn">
          <strong>🔧 Model not trained yet.</strong>
          <code>python ml/train_model.py</code>
          <span className="hint">Run it from the repository root; no restart needed afterwards.</span>
        </div>
      )}
      {error && status.state === 'online' && (
        <div className="alert alert-bad">
          <strong>Prediction failed.</strong> {error.message}
          {error.howToFix && <code>{error.howToFix}</code>}
        </div>
      )}
      {data && (
        <>
          <div className="big-number" aria-busy={loading}>
            {fmt(data.predicted_area_km2, 2)} <small>km²</small>
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            ≈ <strong style={{ color: 'var(--accent)' }}>{fmt(data.growth_factor, 2)}×</strong> the initial area at T+{fmt(data.inputs.elapsed_hours, 1)} h
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            <StatPill label="wind" value={`${fmt(data.inputs.wind_speed_ms)} m/s`} />
            <StatPill label="current" value={`${fmt(data.inputs.current_speed_ms, 2)} m/s`} />
          </div>
          {data.warnings.map((w) => (
            <div className="alert alert-warn" key={w}>{w}</div>
          ))}
          <p className="hint">
            {data.model.name} trained on <strong>synthetic data</strong> ({data.model.training_rows.toLocaleString()} rows). It reproduces an invented
            formula, so it says nothing about how real slicks behave.
          </p>
        </>
      )}
      {!data && !error && status.state === 'online' && (
        <p className="note" style={{ textAlign: 'center', padding: '16px 0', opacity: 0.7 }}>
          {hasSpill ? (
            <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>⏳ Requesting prediction…</span>
          ) : (
            '🎯 Place a spill on the map to request a prediction.'
          )}
        </p>
      )}
    </section>
  )
}
