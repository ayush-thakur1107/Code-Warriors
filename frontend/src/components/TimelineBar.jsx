import { MODEL_RANGES } from '../config.js'
import { fmt, fmtUtc } from '../lib/format.js'

export default function TimelineBar({
  elapsedHours,
  setElapsedHours,
  playing,
  setPlaying,
  startMs,
  onClose,
}) {
  const max = MODEL_RANGES.elapsedHours[1]
  const pct = (elapsedHours / max) * 100

  const stepBack = () => {
    setPlaying(false)
    setElapsedHours(Math.max(0, elapsedHours - 1))
  }

  const stepForward = () => {
    setPlaying(false)
    setElapsedHours(Math.min(max, elapsedHours + 1))
  }

  return (
    <div className="mt-timeline-hud animate-slide-up">
      <div className="hud-header">
        <div className="hud-title">
          <span className="live-rec-dot" />
          <strong>HISTORICAL AIS REPLAY</strong>
          <span className="clock-badge">
            {fmtUtc(startMs + elapsedHours * 3600e3)}
          </span>
        </div>
        <div className="hud-right-controls">
          <span className="elapsed-counter">T+{fmt(elapsedHours, 1)}h</span>
          {onClose && (
            <button className="hud-close-btn" onClick={onClose} title="Hide timeline bar">✕</button>
          )}
        </div>
      </div>

      <div className="hud-controls-row">
        <button
          type="button"
          className="hud-btn"
          onClick={stepBack}
          title="Step back 1 hour"
        >
          ⏮
        </button>
        <button
          type="button"
          className={`hud-play-btn ${playing ? 'playing' : ''}`}
          onClick={() => setPlaying(!playing)}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="hud-btn"
          onClick={stepForward}
          title="Step forward 1 hour"
        >
          ⏭
        </button>

        <div className="hud-slider-wrap">
          <input
            type="range"
            min={0}
            max={max}
            step={0.5}
            value={elapsedHours}
            onChange={(e) => {
              setPlaying(false)
              setElapsedHours(Number(e.target.value))
            }}
            aria-label="Elapsed time hours"
            className="hud-range-slider"
            style={{ '--pct': `${pct}%` }}
          />
          <div className="hud-ticks">
            {[0, 12, 24, 36, 48, 60, 72].map((t) => (
              <span key={t} className={t <= elapsedHours ? 'active' : ''}>{t}h</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
