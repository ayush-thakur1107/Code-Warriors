import { fmt, fmtUtc } from '../lib/format.js'

function Row({ k, v }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

export default function IncidentPanel({ spill, params, startMs, area, areaSource, footprint }) {
  return (
    <section className="panel">
      <h2>Incident information <span className="tag tag-synth">simulated</span></h2>
      {!spill ? (
        <p className="note">No incident placed yet. Click the map or load the sample scenario.</p>
      ) : (
        <dl>
          <Row k="Location" v={`${fmt(spill.lat, 4)}°, ${fmt(spill.lon, 4)}°`} />
          <Row k="Assumed start" v={fmtUtc(startMs)} />
          <Row k="Now showing" v={`T+${fmt(params.elapsedHours, 1)} h`} />
          <Row k="Initial area" v={`${fmt(params.initialAreaKm2)} km²`} />
          <Row k="Wind / current" v={`${fmt(params.windSpeedMs)} m/s / ${fmt(params.currentSpeedMs, 2)} m/s`} />
          <Row k="Displayed area" v={`${fmt(area)} km²`} />
          <Row k="Area source" v={areaSource} />
          <Row k="Drawn drift" v={`${fmt(footprint.driftKm)} km toward ${params.headingDeg}° (illustrative)`} />
        </dl>
      )}
      <p className="hint">
        The footprint on the map is a simple ellipse, not a fluid-dynamics simulation. Do not use it for
        real response decisions.
      </p>
    </section>
  )
}
