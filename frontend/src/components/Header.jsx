import { useState, useEffect } from 'react'

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

// Animated wave SVG for the header
function WaveDecor() {
  return (
    <svg
      className="header-wave"
      viewBox="0 0 1440 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        bottom: -1,
        left: 0,
        width: '100%',
        height: '20px',
        opacity: 0.15,
        pointerEvents: 'none',
      }}
    >
      <path
        d="M0,20 C240,35 480,5 720,20 C960,35 1200,5 1440,20 L1440,40 L0,40 Z"
        fill="url(#wave-grad)"
      >
        <animate
          attributeName="d"
          dur="8s"
          repeatCount="indefinite"
          values="
            M0,20 C240,35 480,5 720,20 C960,35 1200,5 1440,20 L1440,40 L0,40 Z;
            M0,20 C240,5 480,35 720,20 C960,5 1200,35 1440,20 L1440,40 L0,40 Z;
            M0,20 C240,35 480,5 720,20 C960,35 1200,5 1440,20 L1440,40 L0,40 Z
          "
        />
      </path>
      <defs>
        <linearGradient id="wave-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function Header({ status }) {
  // Subtle connection indicator animation
  const [showPulse, setShowPulse] = useState(false)
  useEffect(() => {
    if (status.state === 'online') {
      setShowPulse(true)
      const t = setTimeout(() => setShowPulse(false), 2000)
      return () => clearTimeout(t)
    }
  }, [status.state])

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
          ⚠ SYNTHETIC DEMO DATA
        </span>
        <StatusBadge status={status} />
      </div>
      <WaveDecor />
    </header>
  )
}
