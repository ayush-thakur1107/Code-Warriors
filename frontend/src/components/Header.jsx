const LABELS = {
  checking: ['Checking backend…', 'muted'],
  online: ['Backend connected', 'ok'],
  'model-missing': ['Backend up · model missing', 'warn'],
  offline: ['Backend offline', 'bad'],
}

export function StatusBadge({ status }) {
  const [label, tone] = LABELS[status.state] || LABELS.checking
  return (
    <span className={`status status-${tone}`} title={status.message} role="status">
      <span className="dot" /> {label}
    </span>
  )
}

export default function Header({ status }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="logo" aria-hidden="true">◎</span>
        <div>
          <h1>OCEANTRACE</h1>
          <p>AI-assisted spill investigation · prototype</p>
        </div>
      </div>
      <div className="header-right">
        <span className="tag tag-synth" title="Vessels, routes and the prediction model are all synthetic demos">
          SYNTHETIC DEMO DATA · NOT REAL OBSERVATIONS
        </span>
        <StatusBadge status={status} />
      </div>
    </header>
  )
}
