import { MODEL_RANGES } from '../config.js'
import { fmt, fmtUtc } from '../lib/format.js'

export default function TimelineBar({ elapsedHours, setElapsedHours, playing, setPlaying, startMs }) {
  const max = MODEL_RANGES.elapsedHours[1]
  return (
    <div className="timeline">
      <button type="button" className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="timeline-main">
        <div className="timeline-top">
          <strong>T+{fmt(elapsedHours, 1)} h</strong>
          <span>{fmtUtc(startMs + elapsedHours * 3600e3)} <small>(synthetic clock)</small></span>
        </div>
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
          aria-label="Elapsed time since spill start, hours"
        />
        <div className="ticks">
          {[0, 24, 48, 72].map((t) => (
            <span key={t}>{t} h</span>
          ))}
        </div>
      </div>
    </div>
  )
}
