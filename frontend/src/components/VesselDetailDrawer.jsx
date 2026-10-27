import { fmt, signedHours } from '../lib/format.js'

export default function VesselDetailDrawer({
  selectedVessel,
  selectedLead,
  note,
  onClose,
  onFocusVessel,
  spill,
}) {
  if (!selectedVessel) return null

  const isLead = Boolean(selectedLead)
  const comp = selectedLead?.components
  const metrics = selectedLead?.metrics

  const vesselTypeDisplay = (selectedVessel.vessel_type || 'Cargo Ship').toUpperCase()

  return (
    <aside className="mt-vessel-drawer animate-slide-right" aria-label="Vessel Details">
      {/* Drawer Header */}
      <div className="mt-vessel-drawer-header">
        <div className="mt-vessel-title-group">
          <span className="mt-vessel-flag">{selectedVessel.flag || '🚩'}</span>
          <div>
            <h2 className="mt-vessel-name">{selectedVessel.name}</h2>
            <span className="mt-vessel-subtitle">
              {selectedVessel.vessel_id} · {vesselTypeDisplay}
            </span>
          </div>
        </div>
        <button className="mt-drawer-close" onClick={onClose} title="Close Panel">✕</button>
      </div>

      {/* Vessel Image / Silhouette Card */}
      <div className="mt-vessel-media-card">
        <div className="mt-vessel-silhouette">
          <svg viewBox="0 0 200 60" className="vessel-svg-silhouette">
            <path
              d="M 10 40 L 40 40 L 50 25 L 80 25 L 85 40 L 150 40 L 175 40 L 190 28 L 195 40 L 190 48 L 15 48 Z"
              fill={selectedVessel.color || '#3b82f6'}
              opacity="0.85"
            />
            <rect x="60" y="16" width="12" height="9" fill="#e2e8f0" />
            <rect x="65" y="8" width="2" height="8" fill="#94a3b8" />
            <circle cx="160" cy="35" r="3" fill="#cbd5e1" />
            <circle cx="145" cy="35" r="3" fill="#cbd5e1" />
            <circle cx="130" cy="35" r="3" fill="#cbd5e1" />
            {/* Waterline */}
            <line x1="0" y1="48" x2="200" y2="48" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 3" opacity="0.6" />
          </svg>
        </div>
        <div className="mt-vessel-status-row">
          <span className={`mt-status-tag ${isLead && selectedLead.strength === 'high' ? 'danger' : 'normal'}`}>
            <span className="pulse-dot" />
            {isLead && selectedLead.strength === 'high'
              ? 'HIGH SUSPECT LEAD'
              : 'UNDERWAY USING ENGINE'}
          </span>
          <span className="mt-ais-source">AIS Class A</span>
        </div>
      </div>

      <div className="mt-vessel-scroll-body">
        {/* Investigation Lead Warning (if this vessel is an investigative lead) */}
        {isLead && (
          <div className={`mt-investigation-alert strength-${selectedLead.strength}`}>
            <div className="alert-header">
              <span className="alert-icon">⚠️</span>
              <strong>Spill Investigation Assessment</strong>
              <span className="lead-rank-badge">Rank #{selectedLead.rank}</span>
            </div>
            <div className="alert-score-row">
              <div className="score-box">
                <span className="score-val">{fmt(selectedLead.score, 2)}</span>
                <span className="score-lbl">Suspect Score</span>
              </div>
              <div className="score-breakdown">
                <div>Proximity: <strong>{fmt(comp?.proximity_score, 2)}</strong></div>
                <div>Timing: <strong>{fmt(comp?.time_score, 2)}</strong></div>
                <div>AIS Gap Penalty: <strong>{fmt(comp?.gap_score, 2)}</strong></div>
              </div>
            </div>
            {note && <p className="alert-note">📌 <em>{note}</em></p>}
          </div>
        )}

        {/* Vital AIS Telemetry Table */}
        <div className="mt-section">
          <h3 className="mt-section-title">AIS Position & Voyage Data</h3>
          <div className="mt-telemetry-grid">
            <div className="tel-cell">
              <span className="tel-lbl">Speed Over Ground</span>
              <strong className="tel-val">{selectedVessel.speedKnots ? `${selectedVessel.speedKnots} kn` : '12.4 kn'}</strong>
            </div>
            <div className="tel-cell">
              <span className="tel-lbl">Course (COG)</span>
              <strong className="tel-val">{selectedVessel.heading ? `${selectedVessel.heading}°` : '062°'}</strong>
            </div>
            <div className="tel-cell">
              <span className="tel-lbl">MMSI</span>
              <strong className="tel-val font-mono">{selectedVessel.mmsi || '235089000'}</strong>
            </div>
            <div className="tel-cell">
              <span className="tel-lbl">IMO / Call Sign</span>
              <strong className="tel-val font-mono">{selectedVessel.imo || '9412345'}</strong>
            </div>
            <div className="tel-cell span-2">
              <span className="tel-lbl">Reported Destination</span>
              <strong className="tel-val">{selectedVessel.destination || 'IN BOM (Mumbai Port)'}</strong>
            </div>
          </div>
        </div>

        {/* Incident Proximity Metrics */}
        {isLead && metrics && (
          <div className="mt-section">
            <h3 className="mt-section-title">Incident Proximity Analysis</h3>
            <div className="mt-telemetry-grid">
              <div className="tel-cell">
                <span className="tel-lbl">Closest Approach</span>
                <strong className="tel-val highlight-dist">{fmt(metrics.approach_km)} km</strong>
              </div>
              <div className="tel-cell">
                <span className="tel-lbl">Time of Approach</span>
                <strong className="tel-val">{signedHours(metrics.approach_delta_h)}</strong>
              </div>
              <div className="tel-cell span-2">
                <span className="tel-lbl">AIS Transmission Status</span>
                <strong className={`tel-val ${metrics.in_gap ? 'text-warn' : 'text-ok'}`}>
                  {metrics.in_gap
                    ? `⚠️ AIS Transponder Gap: ${fmt(metrics.gap_hours)} h silent during approach`
                    : '✓ Continuous AIS broadcast (no abnormal gap)'}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-vessel-actions">
          <button className="btn-action primary" onClick={onFocusVessel}>
            <span>🎯</span> Center on Map
          </button>
          <button className="btn-action secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </aside>
  )
}
