import { fmt, signedHours } from '../lib/format.js'

function LeadCard({ lead, selected, onSelect, note }) {
  const c = lead.components
  return (
    <li>
      <button type="button" className={`lead lead-${lead.lead_strength} ${selected ? 'selected' : ''}`} onClick={() => onSelect(lead.vessel_id)} aria-pressed={selected}>
        <span className="rank">{lead.rank}</span>
        <span className="lead-body">
          <span className="lead-title">
            <strong>{lead.name || lead.vessel_id}</strong>
            <small>{lead.vessel_id}</small>
            <span className="strength">{lead.lead_strength}</span>
          </span>
          <span className="bar"><span style={{ width: `${Math.round(lead.lead_score * 100)}%` }} /></span>
          <span className="lead-meta">
            score {fmt(lead.lead_score, 2)} · {fmt(lead.metrics.approach_km)} km · {signedHours(lead.metrics.time_offset_hours)}
            {lead.metrics.ais_gap_at_start_hours > 0 && <em className="gapflag"> · AIS gap</em>}
          </span>
        </span>
      </button>
      {selected && (
        <div className="lead-detail">
          <p>{lead.explanation}</p>
          <ul className="mini">
            <li>proximity {fmt(c.proximity, 2)}</li>
            <li>time alignment {fmt(c.time_alignment, 2)}</li>
            <li>route consistency {fmt(c.route_consistency, 2)}</li>
            {c.ais_gap_bonus > 0 && <li>AIS-gap bonus +{fmt(c.ais_gap_bonus, 2)}</li>}
          </ul>
          {lead.flags.map((f) => (
            <p className="flag" key={f}>⚑ {f}</p>
          ))}
          {note && <p className="hint">Demo scenario role: {note}</p>}
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
        Vessel leads <span className="tag tag-synth">synthetic vessels</span>
      </h2>
      <p className="note">Ranked by a transparent heuristic. A lead is a reason to look closer, never proof that a vessel caused anything.</p>
      {!hasSpill && <p className="note">Place a spill to rank vessels.</p>}
      {backendState === 'offline' && hasSpill && <div className="alert alert-bad">Ranking needs the backend, which is offline.</div>}
      {error && backendState !== 'offline' && <div className="alert alert-bad">Ranking failed. {error.message}</div>}
      {loading && !data && <p className="note">Ranking vessels…</p>}
      {data && hasSpill && (
        <>
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
            <p className="hint">
              <code>{data.method.formula}</code>
            </p>
            <p className="hint">
              Window: {data.method.parameters.lookback_hours} h before to {data.method.parameters.lookahead_hours} h after the
              assumed start. Distance scale {data.method.parameters.distance_scale_km} km, time scale {data.method.parameters.time_scale_hours} h.
              Missing AIS data is flagged for follow-up and never treated as proof of wrongdoing.
            </p>
          </details>
        </>
      )}
    </section>
  )
}
