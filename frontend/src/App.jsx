import { useEffect, useMemo, useState } from 'react'
import { predictArea, rankVessels } from './api.js'
import NavigationSidebar from './components/NavigationSidebar.jsx'
import TopSearchBar from './components/TopSearchBar.jsx'
import MapToolbar from './components/MapToolbar.jsx'
import CoordinatesHUD from './components/CoordinatesHUD.jsx'
import VesselDetailDrawer from './components/VesselDetailDrawer.jsx'
import SpillInvestigationDrawer from './components/SpillInvestigationDrawer.jsx'
import MapView from './components/MapView.jsx'
import TimelineBar from './components/TimelineBar.jsx'
import { MODEL_RANGES } from './config.js'
import { useApiCall } from './hooks/useApiCall.js'
import { useBackendStatus } from './hooks/useBackendStatus.js'
import { useDebounced } from './hooks/useDebounced.js'
import { prepareVessel } from './lib/geo.js'
import { fallbackArea, illustrativeFootprint } from './lib/spill.js'

// Realistic scenario and vessels
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
  const notesById = useMemo(
    () => Object.fromEntries(vesselData.vessels.map((v) => [v.vessel_id, v.investigation_note || v.demo_note || ''])),
    [],
  )

  // Clean layout states
  const [activeTab, setActiveTab] = useState('simulation')
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  // Map controls
  const [activeBasemap, setActiveBasemap] = useState('light')
  const [showPlayback, setShowPlayback] = useState(true)
  const [showRangeRings, setShowRangeRings] = useState(false)
  const [showGrid, setShowGrid] = useState(false)

  // Spill Simulation state
  const [spill, setSpill] = useState(defaultSpill)
  const [params, setParams] = useState(defaultParams)
  const [playing, setPlaying] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [focus, setFocus] = useState({ center: [defaultSpill.lat, defaultSpill.lon], zoom: 8 })
  const [cursorCoords, setCursorCoords] = useState(null)

  const setParam = (key, value) => setParams((p) => ({ ...p, [key]: value }))

  // Timeline playback loop
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

  // ML Area Prediction (backend /predict-area)
  const d = useDebounced(params, 200)
  const apiReady = status.state === 'online'
  const prediction = useApiCall(
    (signal) =>
      predictArea(
        {
          initialAreaKm2: d.initialAreaKm2,
          windSpeedMs: d.windSpeedMs,
          currentSpeedMs: d.currentSpeedMs,
          elapsedHours: d.elapsedHours,
        },
        signal,
      ),
    [d.initialAreaKm2, d.windSpeedMs, d.currentSpeedMs, d.elapsedHours, status.state],
    apiReady && spill !== null,
  )

  // Vessel Ranking (backend /rank-vessels)
  const dSpill = useDebounced(spill, 300)
  const rankingEnabled = (status.state === 'online' || status.state === 'model-missing') && dSpill !== null
  const ranking = useApiCall(
    (signal) =>
      rankVessels(
        {
          latitude: dSpill.lat,
          longitude: dSpill.lon,
          startTime: scenario.spill_start_time,
          vessels: vesselData.vessels,
        },
        signal,
      ),
    [dSpill?.lat, dSpill?.lon, status.state === 'offline'],
    rankingEnabled,
  )

  // Calculated footprint & area
  const mlArea = apiReady && spill ? prediction.data?.predicted_area_km2 : undefined
  const area = mlArea ?? fallbackArea(params.initialAreaKm2, params.elapsedHours)
  const areaSource = mlArea != null ? 'ML model (FastAPI)' : 'Physical drift model'
  const footprint = useMemo(
    () =>
      spill
        ? illustrativeFootprint({
            lat: spill.lat,
            lon: spill.lon,
            areaKm2: area,
            windSpeedMs: params.windSpeedMs,
            currentSpeedMs: params.currentSpeedMs,
            elapsedHours: params.elapsedHours,
            headingDeg: params.headingDeg,
          })
        : { polygon: [], centroid: [0, 0], driftKm: 0 },
    [spill, area, params.windSpeedMs, params.currentSpeedMs, params.elapsedHours, params.headingDeg],
  )

  const selectedLead = ranking.data?.ranked?.find((l) => l.vessel_id === selectedId) || null
  const selectedVessel = useMemo(() => vessels.find((v) => v.vessel_id === selectedId) || null, [selectedId, vessels])
  const currentTimeMs = startMs + params.elapsedHours * 3600e3

  // Map interactions
  const placeSpill = (lat, lon) => {
    setSpill({ lat, lon })
  }

  const selectVessel = (id) => {
    const next = id === selectedId ? null : id
    setSelectedId(next)

    if (next) {
      const lead = ranking.data?.ranked?.find((l) => l.vessel_id === next)
      if (lead) {
        const p = lead.metrics.approach_position
        setFocus({
          center: [(p.latitude + (spill?.lat ?? p.latitude)) / 2, (p.longitude + (spill?.lon ?? p.longitude)) / 2],
          zoom: 8,
        })
      } else {
        const v = vessels.find((item) => item.vessel_id === next)
        if (v && v.fixes?.length) {
          setFocus({ center: [v.fixes[0].lat, v.fixes[0].lon], zoom: 8 })
        }
      }
    }
  }

  const loadSample = () => {
    setSpill(defaultSpill)
    setParams(defaultParams)
    setSelectedId(null)
    setFocus({ center: [defaultSpill.lat, defaultSpill.lon], zoom: 8 })
  }

  const flyToCoordinates = (lat, lon) => {
    setFocus({ center: [lat, lon], zoom: 9 })
  }

  const centerOnSpill = () => {
    if (spill) {
      setFocus({ center: [spill.lat, spill.lon], zoom: 8 })
    } else {
      setFocus({ center: [defaultSpill.lat, defaultSpill.lon], zoom: 8 })
    }
  }

  return (
    <div className="mt-app-root">
      {/* 1. Left Marine Operations Nav Bar */}
      <NavigationSidebar
        activeTab={activeTab}
        setActiveTab={(t) => {
          setActiveTab(t)
          if (t !== 'map') setIsPanelOpen(true)
        }}
        status={status}
        vesselCount={vessels.length}
        onResetScenario={loadSample}
        isPanelOpen={isPanelOpen}
        setIsPanelOpen={setIsPanelOpen}
      />

      {/* 2. Docked Left Operations Intelligence Panel */}
      <SpillInvestigationDrawer
        isOpen={isPanelOpen}
        onToggle={() => setIsPanelOpen(!isPanelOpen)}
        tab={activeTab === 'map' ? 'simulation' : activeTab}
        setTab={setActiveTab}
        spill={spill}
        params={params}
        setParam={setParam}
        onLoadSample={loadSample}
        onClearSpill={() => {
          setSpill(null)
          setSelectedId(null)
          setPlaying(false)
        }}
        prediction={spill ? prediction : { data: null, error: null, loading: false }}
        area={area}
        areaSource={areaSource}
        footprint={footprint}
        startMs={startMs}
        ranking={ranking}
        selectedId={selectedId}
        onSelectVessel={selectVessel}
        notesById={notesById}
        backendStatus={status}
      />

      {/* 3. Main Full-Bleed Map Viewport */}
      <main className="mt-main-viewport">
        {/* Top Floating Search Bar */}
        <TopSearchBar
          vessels={vessels}
          onSelectVessel={selectVessel}
          onFlyToCoordinates={flyToCoordinates}
          spill={spill}
        />

        {/* Interactive Map */}
        <MapView
          center={[defaultSpill.lat, defaultSpill.lon]}
          zoom={8}
          activeBasemap={activeBasemap}
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
          onCursorMove={(coords) => setCursorCoords(coords)}
          showRangeRings={showRangeRings}
          showGrid={showGrid}
        />

        {/* Right Floating Map Toolbar */}
        <MapToolbar
          activeBasemap={activeBasemap}
          setActiveBasemap={setActiveBasemap}
          showRangeRings={showRangeRings}
          setShowRangeRings={setShowRangeRings}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          onCenterSpill={centerOnSpill}
          onZoomIn={() => setFocus((prev) => ({ ...prev, zoom: Math.min(18, (prev?.zoom || 8) + 1) }))}
          onZoomOut={() => setFocus((prev) => ({ ...prev, zoom: Math.max(3, (prev?.zoom || 8) - 1) }))}
        />

        {/* Bottom Coordinates HUD */}
        <CoordinatesHUD
          cursorCoords={cursorCoords}
          mapCenter={[spill?.lat || defaultSpill.lat, spill?.lon || defaultSpill.lon]}
        />

        {/* Bottom Playback Scrubber Bar */}
        {showPlayback && (
          <TimelineBar
            elapsedHours={params.elapsedHours}
            setElapsedHours={(v) => setParam('elapsedHours', v)}
            playing={playing}
            setPlaying={setPlaying}
            startMs={startMs}
            onClose={() => setShowPlayback(false)}
          />
        )}

        {/* Slide-out Vessel Detail Drawer */}
        <VesselDetailDrawer
          selectedVessel={selectedVessel}
          selectedLead={selectedLead}
          note={selectedId ? notesById[selectedId] : null}
          onClose={() => setSelectedId(null)}
          onFocusVessel={() => {
            if (selectedVessel && selectedVessel.fixes?.length) {
              setFocus({
                center: [selectedVessel.fixes[0].lat, selectedVessel.fixes[0].lon],
                zoom: 10,
              })
            }
          }}
          spill={spill}
        />
      </main>
    </div>
  )
}
