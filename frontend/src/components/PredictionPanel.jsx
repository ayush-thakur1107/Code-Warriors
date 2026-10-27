import { fmt } from '../lib/format.js'

export default function PredictionPanel({ status, prediction, hasSpill }) {
  const { data, error, loading } = prediction
  return (
    <section className="panel">
      <h2>
        Area prediction <span className="tag tag-exp">experimental</span>
      </h2>
      {status.state === 'offline' && (
        <div className="alert alert-bad">
          <strong>Backend offline.</strong> {status.message}
          <code>python -m uvicorn app.main:app --app-dir backend --reload --port 8000</code>
        </div>
      )}
      {status.state === 'model-missing' && (
        <div className="alert alert-warn">
          <strong>Model not trained yet.</strong>
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
          <p className="note">
            ≈ {fmt(data.growth_factor, 2)}× the initial area at T+{fmt(data.inputs.elapsed_hours, 1)} h
          </p>
          {data.warnings.map((w) => (
            <div className="alert alert-warn" key={w}>{w}</div>
          ))}
          <p className="hint">
            {data.model.name} trained on <strong>synthetic data</strong> ({data.model.training_rows} rows). It reproduces an invented
            formula, so it says nothing about how real slicks behave.
          </p>
        </>
      )}
      {!data && !error && status.state === 'online' && <p className="note">{hasSpill ? 'Requesting prediction…' : 'Place a spill to request a prediction.'}</p>}
    </section>
  )
}
