import { fmt, signedHours } from '../lib/format.js'

const STRENGTH_COLORS = {
  high: 'var(--bad)',
  medium: 'var(--warn)',
  low: 'var(--dim)',
}

function LeadCard({ lead, selected, onSelect, note }) {
  const c = lead.components
  const strengthColor = STRENGTH_COLORS[lead.lead_strength] || 'var(--muted)'
  return (
    <li style={{ animation: 'fadeInUp 0.3s ease both', animationDelay: `${lead.rank * 60}ms` }}>
      <button type="button" className={`lead lead-${lead.lead_strength} ${selected ? 'selected' : ''}`} onClick={() => onSelect(lead.vessel_id)} aria-pressed={selected}>
        <span className="rank">{lead.rank}</span>
        <span className="lead-body">
          <span className="lead-title">
            <strong>{lead.name || lead.vessel_id}</strong>
            <small>{lead.vessel_id}</small>
            <span className="strength" style={{ color: strengthColor }}>{lead.lead_strength}</span>
          </span>
          <span className="bar"><span style={{ width: `${Math.round(lead.lead_score * 100)}%` }} /></span>
          <span className="lead-meta">
            score {fmt(lead.lead_score, 2)} · {fmt(lead.metrics.approach_km)} km · {signedHours(lead.metrics.time_offset_hours)}
            {lead.metrics.ais_gap_at_start_hours > 0 && <em className="gapflag"> · ⚠ AIS gap</em>}
          </span>
        </span>
      </button>
      {selected && (
        <div className="lead-detail">
          <p style={{ lineHeight: 1.5 }}>{lead.explanation}</p>
          <ul className="mini">
            <li>proximity {fmt(c.proximity, 2)}</li>
            <li>time alignment {fmt(c.time_alignment, 2)}</li>
            <li>route consistency {fmt(c.route_consistency, 2)}</li>
            {c.ais_gap_bonus > 0 && <li style={{ color: 'var(--warn)' }}>AIS-gap bonus +{fmt(c.ais_gap_bonus, 2)}</li>}
          </ul>
          {lead.flags.map((f) => (
            <p className="flag" key={f}>⚑ {f}</p>
          ))}
          {note && <p className="hint">🎭 Demo scenario role: {note}</p>}
        </div>
      )}
    </li>
  )
}

export default function VesselPanel({ ranking, hasSpill, selectedId, onSelect, notesById, backendState }) {
  const { data, error, loading } = ranking
  return (
    <section className="panel">
      <h2>
        <span style={{ fontSize: 14 }}>🚢</span>
        Vessel leads <span className="tag tag-synth">synthetic</span>
      </h2>
      <p className="note">Ranked by a transparent heuristic. A lead is a reason to look closer, never proof that a vessel caused anything.</p>
      {!hasSpill && (
        <p className="note" style={{ textAlign: 'center', padding: '12px 0', opacity: 0.7 }}>
          🎯 Place a spill to rank vessels.
        </p>
      )}
      {backendState === 'offline' && hasSpill && <div className="alert alert-bad">⚡ Ranking needs the backend, which is offline.</div>}
      {error && backendState !== 'offline' && <div className="alert alert-bad">Ranking failed. {error.message}</div>}
      {loading && !data && (
        <p className="note" style={{ textAlign: 'center', animation: 'pulse 1.5s ease-in-out infinite' }}>
          ⏳ Ranking vessels…
        </p>
      )}
      {data && hasSpill && (
        <>
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            fontSize: 12,
            fontFamily: 'var(--mono)',
            fontWeight: 500,
          }}>
            <span style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(45, 212, 191, 0.08)',
              border: '1px solid rgba(45, 212, 191, 0.15)',
              color: 'var(--accent)',
            }}>
              {data.ranked.length} assessed
            </span>
            {data.unassessed.length > 0 && (
              <span style={{
                padding: '3px 8px',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(127, 152, 174, 0.08)',
                border: '1px solid rgba(127, 152, 174, 0.15)',
                color: 'var(--muted)',
              }}>
                {data.unassessed.length} unassessed
              </span>
            )}
          </div>
          <ol className="leads">
            {data.ranked.map((lead) => (
              <LeadCard key={lead.vessel_id} lead={lead} selected={selectedId === lead.vessel_id} onSelect={onSelect} note={notesById[lead.vessel_id]} />
            ))}
          </ol>
          {data.unassessed.length > 0 && (
            <>
              <h3>Could not be assessed</h3>
              <ul className="unassessed">
                {data.unassessed.map((u) => (
                  <li key={u.vessel_id}>
                    <strong>{u.name || u.vessel_id}</strong> <small>{u.vessel_id}</small>
                    <p>{u.reason}</p>
                    <p className="hint">{u.note}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <details>
            <summary>How leads are scored</summary>
            <p className="hint" style={{ marginTop: 8 }}>
              <code style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(6, 16, 26, 0.8)' }}>{data.method.formula}</code>
            </p>
            <p className="hint" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Window: <strong>{data.method.parameters.lookback_hours} h</strong> before to <strong>{data.method.parameters.lookahead_hours} h</strong> after the
              assumed start. Distance scale {data.method.parameters.distance_scale_km} km, time scale {data.method.parameters.time_scale_hours} h.
              Missing AIS data is flagged for follow-up and never treated as proof of wrongdoing.
            </p>
          </details>
        </>
      )}
    </section>
  )
}
