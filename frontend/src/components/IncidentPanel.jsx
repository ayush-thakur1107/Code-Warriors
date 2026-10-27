import { fmt, fmtUtc } from '../lib/format.js'

function Row({ k, v, icon }) {
  return (
    <div className="row">
      <dt>{icon && <span style={{ marginRight: 6 }}>{icon}</span>}{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

export default function IncidentPanel({ spill, params, startMs, area, areaSource, footprint }) {
  return (
    <section className="panel">
      <h2><span style={{ fontSize: 14 }}>🔍</span> Incident information <span className="tag tag-synth">simulated</span></h2>
      {!spill ? (
        <p className="note" style={{ textAlign: 'center', padding: '16px 0', opacity: 0.7 }}>
          No incident placed yet. Click the map or load the sample scenario.
        </p>
      ) : (
        <dl style={{ animation: 'fadeInUp 0.3s ease' }}>
          <Row icon="📍" k="Location" v={`${fmt(spill.lat, 4)}°, ${fmt(spill.lon, 4)}°`} />
          <Row icon="🕐" k="Assumed start" v={fmtUtc(startMs)} />
          <Row icon="⏱" k="Now showing" v={`T+${fmt(params.elapsedHours, 1)} h`} />
          <Row icon="📐" k="Initial area" v={`${fmt(params.initialAreaKm2)} km²`} />
          <Row icon="💨" k="Wind / current" v={`${fmt(params.windSpeedMs)} m/s / ${fmt(params.currentSpeedMs, 2)} m/s`} />
          <Row icon="🟠" k="Displayed area" v={`${fmt(area)} km²`} />
          <Row icon="🔬" k="Area source" v={areaSource} />
          <Row icon="➡" k="Drawn drift" v={`${fmt(footprint.driftKm)} km toward ${params.headingDeg}° (illustrative)`} />
        </dl>
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        The footprint on the map is a simple ellipse, not a fluid-dynamics simulation. Do not use it for
        real response decisions.
      </p>
    </section>
  )
}
