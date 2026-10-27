import { MODEL_RANGES } from '../config.js'
import { fmt, fmtUtc, signedHours } from '../lib/format.js'

function Slider({ label, unit, value, min, max, step, onChange, icon }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="mt-slider-row">
      <div className="mt-slider-header">
        <span className="slider-label">
          {icon && <span className="slider-icon">{icon}</span>}
          {label}
        </span>
        <span className="slider-value">
          {fmt(value)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-range-input"
        style={{ '--pct': `${pct}%` }}
      />
    </div>
  )
}

export default function SpillInvestigationDrawer({
  isOpen,
  onToggle,
  tab,
  setTab,
  spill,
  params,
  setParam,
  onLoadSample,
  onClearSpill,
  prediction,
  area,
  areaSource,
  footprint,
  startMs,
  ranking,
  selectedId,
  onSelectVessel,
  notesById,
  backendStatus,
}) {
  const rankedLeads = ranking?.data?.ranked || []

  return (
    <aside className={`mt-operations-panel ${isOpen ? 'open' : 'collapsed'}`} aria-label="Operations Intelligence">
      {/* Collapse Toggle Handle */}
      <button
        className="mt-panel-toggle"
        onClick={onToggle}
        title={isOpen ? 'Collapse panel' : 'Expand panel'}
      >
        {isOpen ? '◀' : '▶'}
      </button>

      {isOpen && (
        <div className="mt-panel-content">
          {/* Header */}
          <div className="mt-panel-header">
            <div className="panel-title-row">
              <span className="panel-icon">🌊</span>
              <div>
                <h2>Spill Operations Center</h2>
                <p>AI Drift Modeling & Suspect Attribution</p>
              </div>
            </div>
          </div>

          {/* Clean Segmented Tabs */}
          <div className="mt-tabs">
            <button
              className={`mt-tab-btn ${tab === 'simulation' ? 'active' : ''}`}
              onClick={() => setTab('simulation')}
            >
              Drift & AI Model
            </button>
            <button
              className={`mt-tab-btn ${tab === 'leads' ? 'active' : ''}`}
              onClick={() => setTab('leads')}
            >
              Leads ({rankedLeads.length})
            </button>
            <button
              className={`mt-tab-btn ${tab === 'incident' ? 'active' : ''}`}
              onClick={() => setTab('incident')}
            >
              Incident Specs
            </button>
          </div>

          <div className="mt-panel-scroll-body">
            {/* TAB 1: DRIFT SIMULATION & ML MODEL */}
            {tab === 'simulation' && (
              <div className="tab-pane">
                {/* Area Prediction Card */}
                <div className="mt-prediction-hero">
                  <div className="hero-top">
                    <span className="hero-badge">AI PREDICTED EXTENT</span>
                    <span className={`backend-pill ${backendStatus?.state === 'online' ? 'online' : 'warn'}`}>
                      {backendStatus?.state === 'online' ? '● ML Active' : '○ Fallback'}
                    </span>
                  </div>
                  <div className="hero-metric">
                    <span className="hero-val">{fmt(area)}</span>
                    <span className="hero-unit">km²</span>
                  </div>
                  <div className="hero-sub">
                    Growth: <strong>{fmt(area / (params.initialAreaKm2 || 1), 2)}×</strong> initial slick at T+{fmt(params.elapsedHours, 1)}h
                  </div>
                  <div className="hero-source">Source: {areaSource}</div>
                </div>

                {/* Environmental Controls */}
                <div className="mt-card">
                  <h3 className="card-section-title">Environmental Parameters</h3>
                  <Slider
                    icon="📏"
                    label="Initial spill area"
                    unit="km²"
                    value={params.initialAreaKm2}
                    min={MODEL_RANGES.initialAreaKm2[0]}
                    max={MODEL_RANGES.initialAreaKm2[1]}
                    step={0.5}
                    onChange={(v) => setParam('initialAreaKm2', v)}
                  />
                  <Slider
                    icon="💨"
                    label="Wind speed"
                    unit="m/s"
                    value={params.windSpeedMs}
                    min={MODEL_RANGES.windSpeedMs[0]}
                    max={MODEL_RANGES.windSpeedMs[1]}
                    step={0.5}
                    onChange={(v) => setParam('windSpeedMs', v)}
                  />
                  <Slider
                    icon="🌊"
                    label="Ocean current speed"
                    unit="m/s"
                    value={params.currentSpeedMs}
                    min={MODEL_RANGES.currentSpeedMs[0]}
                    max={MODEL_RANGES.currentSpeedMs[1]}
                    step={0.05}
                    onChange={(v) => setParam('currentSpeedMs', v)}
                  />
                  <Slider
                    icon="🧭"
                    label="Drift heading"
                    unit="°"
                    value={params.headingDeg}
                    min={0}
                    max={360}
                    step={5}
                    onChange={(v) => setParam('headingDeg', v)}
                  />
                </div>

                {/* Scenario Actions */}
                <div className="scenario-action-bar">
                  <button className="btn-load-scenario" onClick={onLoadSample}>
                    <span>⚡</span> Reset Scenario
                  </button>
                  {spill && (
                    <button className="btn-clear-spill" onClick={onClearSpill}>
                      <span>🗑️</span> Clear Incident
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: SUSPECT LEADS */}
            {tab === 'leads' && (
              <div className="tab-pane">
                <p className="leads-intro">
                  Ranked by proximity to discharge origin, approach trajectory, and AIS gaps.
                </p>
                <div className="leads-list">
                  {rankedLeads.map((lead) => {
                    const isSelected = lead.vessel_id === selectedId
                    const isHigh = lead.strength === 'high'

                    return (
                      <div
                        key={lead.vessel_id}
                        className={`lead-item-card ${isSelected ? 'selected' : ''} ${isHigh ? 'border-high' : ''}`}
                        onClick={() => onSelectVessel(lead.vessel_id)}
                      >
                        <div className="lead-header">
                          <div className="lead-rank-num">#{lead.rank}</div>
                          <div className="lead-name-box">
                            <strong>{lead.name}</strong>
                            <span>{lead.vessel_id} · {lead.vessel_type?.toUpperCase() || 'VESSEL'}</span>
                          </div>
                          <span className={`strength-badge strength-${lead.strength}`}>
                            {lead.strength.toUpperCase()}
                          </span>
                        </div>

                        <div className="lead-metrics-row">
                          <div className="metric-pill">
                            Score: <strong>{fmt(lead.score, 2)}</strong>
                          </div>
                          <div className="metric-pill">
                            Approach: <strong>{fmt(lead.metrics.approach_km)} km</strong>
                          </div>
                          <div className="metric-pill">
                            Offset: <strong>{signedHours(lead.metrics.approach_delta_h)}</strong>
                          </div>
                        </div>

                        {lead.metrics.in_gap && (
                          <div className="lead-gap-warning">
                            ⚠️ <em>AIS transponder silent near incident ({fmt(lead.metrics.gap_hours)} h)</em>
                          </div>
                        )}

                        {notesById?.[lead.vessel_id] && (
                          <p className="lead-scenario-note">
                            📌 {notesById[lead.vessel_id]}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: INCIDENT SPECS */}
            {tab === 'incident' && (
              <div className="tab-pane">
                <div className="mt-card">
                  <h3 className="card-section-title">Incident Details</h3>
                  <dl className="specs-list">
                    <div className="spec-row">
                      <dt>Sector</dt>
                      <dd>Mumbai High Offshore Basin</dd>
                    </div>
                    <div className="spec-row">
                      <dt>Coordinates</dt>
                      <dd className="font-mono">{spill ? `${spill.lat.toFixed(4)}°N, ${spill.lon.toFixed(4)}°E` : 'None'}</dd>
                    </div>
                    <div className="spec-row">
                      <dt>Reported Time</dt>
                      <dd>{startMs ? fmtUtc(startMs) : '–'}</dd>
                    </div>
                    <div className="spec-row">
                      <dt>Calculated Drift</dt>
                      <dd>{fmt(footprint.driftKm)} km</dd>
                    </div>
                    <div className="spec-row">
                      <dt>Current Time</dt>
                      <dd>{startMs ? fmtUtc(startMs + params.elapsedHours * 3600e3) : '–'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
