import { useEffect, useMemo, useState } from 'react'
import { predictArea, rankVessels } from './api.js'
import ControlsPanel from './components/ControlsPanel.jsx'
import Header from './components/Header.jsx'
import IncidentPanel from './components/IncidentPanel.jsx'
import MapView from './components/MapView.jsx'
import PredictionPanel from './components/PredictionPanel.jsx'
import TimelineBar from './components/TimelineBar.jsx'
import VesselPanel from './components/VesselPanel.jsx'
import { MODEL_RANGES } from './config.js'
import { useApiCall } from './hooks/useApiCall.js'
import { useBackendStatus } from './hooks/useBackendStatus.js'
import { useDebounced } from './hooks/useDebounced.js'
import { prepareVessel } from './lib/geo.js'
import { fmt } from './lib/format.js'
import { fallbackArea, illustrativeFootprint } from './lib/spill.js'

// SYNTHETIC sample data, shared with the backend (../data/samples).
import scenario from '@data/spill_scenario.json'
import vesselData from '@data/vessel_routes.json'

const startMs = Date.parse(scenario.spill_start_time)
const defaultSpill = { lat: scenario.location.latitude, lon: scenario.location.longitude }
const defaultParams = {
  initialAreaKm2: scenario.initial_area_km2,
  windSpeedMs: scenario.wind_speed_ms,
  currentSpeedMs: scenario.current_speed_ms,
  elapsedHours: scenario.elapsed_hours,
  headingDeg: scenario.drift_heading_deg,
}

export default function App() {
  const status = useBackendStatus()
  const vessels = useMemo(() => vesselData.vessels.map(prepareVessel), [])
  const notesById = useMemo(() => Object.fromEntries(vesselData.vessels.map((v) => [v.vessel_id, v.demo_note])), [])

  const [spill, setSpill] = useState(defaultSpill)
  const [params, setParams] = useState(defaultParams)
  const [playing, setPlaying] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [focus, setFocus] = useState(null)

  const setParam = (key, value) => setParams((p) => ({ ...p, [key]: value }))

  // ---- timeline playback: +1 h every 400 ms
  useEffect(() => {
    if (!playing) return undefined
    const id = setInterval(() => {
      setParams((p) => {
        const next = p.elapsedHours + 1
        if (next >= MODEL_RANGES.elapsedHours[1]) {
          setPlaying(false)
          return { ...p, elapsedHours: MODEL_RANGES.elapsedHours[1] }
        }
        return { ...p, elapsedHours: next }
      })
    }, 400)
    return () => clearInterval(id)
  }, [playing])

  // ---- experimental prediction (backend /predict-area)
  const d = useDebounced(params, 200)
  const apiReady = status.state === 'online'
  const prediction = useApiCall(
    (signal) =>
      predictArea(
        { initialAreaKm2: d.initialAreaKm2, windSpeedMs: d.windSpeedMs, currentSpeedMs: d.currentSpeedMs, elapsedHours: d.elapsedHours },
        signal,
      ),
    [d.initialAreaKm2, d.windSpeedMs, d.currentSpeedMs, d.elapsedHours, status.state],
    apiReady && spill !== null,
  )

  // ---- vessel ranking (backend /rank-vessels); depends on where/when the spill started, not on elapsed time
  const dSpill = useDebounced(spill, 300)
  const rankingEnabled = (status.state === 'online' || status.state === 'model-missing') && dSpill !== null
  const ranking = useApiCall(
    (signal) => rankVessels({ latitude: dSpill.lat, longitude: dSpill.lon, startTime: scenario.spill_start_time, vessels: vesselData.vessels }, signal),
    [dSpill?.lat, dSpill?.lon, status.state === 'offline'],
    rankingEnabled,
  )

  // ---- what the map draws
  const mlArea = apiReady && spill ? prediction.data?.predicted_area_km2 : undefined
  const area = mlArea ?? fallbackArea(params.initialAreaKm2, params.elapsedHours)
  const areaSource = mlArea != null ? 'synthetic-data model (experimental)' : 'fallback formula (backend/model unavailable)'
  const footprint = useMemo(
    () =>
      spill
        ? illustrativeFootprint({ lat: spill.lat, lon: spill.lon, areaKm2: area, windSpeedMs: params.windSpeedMs, currentSpeedMs: params.currentSpeedMs, elapsedHours: params.elapsedHours, headingDeg: params.headingDeg })
        : { polygon: [], centroid: [0, 0], driftKm: 0 },
    [spill, area, params.windSpeedMs, params.currentSpeedMs, params.elapsedHours, params.headingDeg],
  )

  const selectedLead = ranking.data?.ranked.find((l) => l.vessel_id === selectedId) || null
  const currentTimeMs = startMs + params.elapsedHours * 3600e3

  const placeSpill = (lat, lon) => {
    setSpill({ lat, lon })
    setSelectedId(null)
  }
  const selectVessel = (id) => {
    const next = id === selectedId ? null : id
    setSelectedId(next)
    const lead = ranking.data?.ranked.find((l) => l.vessel_id === next)
    if (lead) {
      const p = lead.metrics.approach_position
      setFocus({ center: [(p.latitude + (spill?.lat ?? p.latitude)) / 2, (p.longitude + (spill?.lon ?? p.longitude)) / 2] })
    }
  }
  const loadSample = () => {
    setSpill(defaultSpill)
    setParams(defaultParams)
    setSelectedId(null)
    setFocus({ center: [defaultSpill.lat, defaultSpill.lon], zoom: 8 })
  }

  return (
    <div className="app">
      <Header status={status} />
      <main className="layout">
        <aside className="col col-left">
          <ControlsPanel params={params} setParam={setParam} onLoadSample={loadSample} onClear={() => { setSpill(null); setSelectedId(null); setPlaying(false) }} hasSpill={spill !== null} />
          <IncidentPanel spill={spill} params={params} startMs={startMs} area={area} areaSource={areaSource} footprint={footprint} />
        </aside>

        <section className="col col-center">
          <MapView
            center={[defaultSpill.lat, defaultSpill.lon]}
            zoom={8}
            spill={spill}
            footprint={footprint}
            area={area}
            areaSource={areaSource}
            vessels={vessels}
            currentTimeMs={currentTimeMs}
            selectedId={selectedId}
            onSelectVessel={selectVessel}
            onPlaceSpill={placeSpill}
            selectedLead={selectedLead}
            focus={focus}
          />
          <TimelineBar elapsedHours={params.elapsedHours} setElapsedHours={(v) => setParam('elapsedHours', v)} playing={playing} setPlaying={setPlaying} startMs={startMs} />
        </section>

        <aside className="col col-right">
          <PredictionPanel status={status} prediction={spill ? prediction : { data: null, error: null, loading: false }} hasSpill={spill !== null} />
          <VesselPanel ranking={ranking} hasSpill={spill !== null} selectedId={selectedId} onSelect={selectVessel} notesById={notesById} backendState={status.state} />
        </aside>
      </main>
      <footer className="footer">
        Prototype · vessels, tracks and the ML model are <strong>synthetic</strong> · the footprint is an illustrative shape, not a validated
        simulation · vessel scores are investigative leads, not proof · basemap © OpenStreetMap contributors © CARTO
      </footer>
    </div>
  )
}
