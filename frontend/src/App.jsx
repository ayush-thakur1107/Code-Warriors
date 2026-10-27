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
import GemmaChatbot from './components/GemmaChatbot.jsx'
import { MODEL_RANGES } from './config.js'
import { useApiCall } from './hooks/useApiCall.js'
import { useBackendStatus } from './hooks/useBackendStatus.js'
import { useDebounced } from './hooks/useDebounced.js'
import { prepareVessel } from './lib/geo.js'
import { fallbackArea, illustrativeFootprint } from './lib/spill.js'
import { REAL_VESSEL_TRAFFIC } from './lib/realMaritimeFleet.js'
import { rankVesselsLocally } from './lib/localRanking.js'

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
  const allVessels = useMemo(() => {
    const backgroundList = REAL_VESSEL_TRAFFIC.map((rv) => ({
      ...rv,
      vessel_id: rv.id,
      fixes: [{ lat: rv.lat, lon: rv.lon, t: startMs }],
      investigation_note: `Active commercial maritime traffic in Arabian Sea. Destination: ${rv.destination}`,
    }))
    return [...vessels, ...backgroundList]
  }, [vessels])
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
  const [showCorridors, setShowCorridors] = useState(true)
  const [isAiChatOpen, setIsAiChatOpen] = useState(false)

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

  // Local fallback heuristic ranking so Leads are NEVER 0 even when backend is offline
  const localRanking = useMemo(() => {
    if (!spill) return { ranked: [], unassessed: [] }
    return rankVesselsLocally(
      { latitude: spill.lat, longitude: spill.lon, startTime: scenario.spill_start_time },
      vesselData.vessels,
    )
  }, [spill])

  const effectiveRanking = useMemo(() => {
    if (ranking.data?.ranked?.length) return ranking
    return { data: localRanking, error: null, loading: ranking.loading }
  }, [ranking, localRanking])

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

  const selectedLead = effectiveRanking.data?.ranked?.find((l) => l.vessel_id === selectedId) || null
  const selectedVessel = useMemo(
    () => allVessels.find((v) => v.vessel_id === selectedId || v.id === selectedId) || null,
    [selectedId, allVessels],
  )
  const currentTimeMs = startMs + params.elapsedHours * 3600e3

  // Map interactions
  const placeSpill = (lat, lon) => {
    setSpill({ lat, lon })
  }

  const selectVessel = (id) => {
    const next = id === selectedId ? null : id
    setSelectedId(next)

    if (next) {
      const lead = effectiveRanking.data?.ranked?.find((l) => l.vessel_id === next)
      if (lead) {
        const p = lead.metrics.approach_position
        setFocus({
          center: [(p.latitude + (spill?.lat ?? p.latitude)) / 2, (p.longitude + (spill?.lon ?? p.longitude)) / 2],
          zoom: 8,
        })
      } else {
        const v = allVessels.find((item) => item.vessel_id === next || item.id === next)
        if (v) {
          if (v.fixes?.length) {
            setFocus({ center: [v.fixes[0].lat, v.fixes[0].lon], zoom: 9 })
          } else if (v.lat && v.lon) {
            setFocus({ center: [v.lat, v.lon], zoom: 9 })
          }
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
        vesselCount={effectiveRanking.data?.ranked?.length || 5}
        onResetScenario={loadSample}
        isPanelOpen={isPanelOpen}
        setIsPanelOpen={setIsPanelOpen}
        onToggleAiChat={() => setIsAiChatOpen((prev) => !prev)}
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
        ranking={effectiveRanking}
        selectedId={selectedId}
        onSelectVessel={selectVessel}
        notesById={notesById}
        backendStatus={status}
      />

      {/* 3. Main Full-Bleed Map Viewport */}
      <main className="mt-main-viewport">
        {/* Top Floating Search Bar */}
        <TopSearchBar
          vessels={allVessels}
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
          realVessels={REAL_VESSEL_TRAFFIC}
          currentTimeMs={currentTimeMs}
          selectedId={selectedId}
          onSelectVessel={selectVessel}
          onPlaceSpill={placeSpill}
          selectedLead={selectedLead}
          focus={focus}
          onCursorMove={(coords) => setCursorCoords(coords)}
          showRangeRings={showRangeRings}
          showGrid={showGrid}
          showCorridors={showCorridors}
        />

        {/* Right Floating Map Toolbar */}
        <MapToolbar
          activeBasemap={activeBasemap}
          setActiveBasemap={setActiveBasemap}
          showRangeRings={showRangeRings}
          setShowRangeRings={setShowRangeRings}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          showCorridors={showCorridors}
          setShowCorridors={setShowCorridors}
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
            if (selectedVessel) {
              if (selectedVessel.fixes?.length) {
                setFocus({
                  center: [selectedVessel.fixes[0].lat, selectedVessel.fixes[0].lon],
                  zoom: 10,
                })
              } else if (selectedVessel.lat && selectedVessel.lon) {
                setFocus({
                  center: [selectedVessel.lat, selectedVessel.lon],
                  zoom: 10,
                })
              }
            }
          }}
          spill={spill}
        />

        {/* 4. AI Maritime Intelligence Copilot (Gemma & Gemini Hybrid) */}
        <GemmaChatbot
          isOpen={isAiChatOpen}
          onToggle={() => setIsAiChatOpen((prev) => !prev)}
          spill={spill}
          params={params}
          area={area}
          ranking={effectiveRanking}
          vessels={allVessels}
          selectedVessel={selectedVessel}
          selectedLead={selectedLead}
        />
      </main>
    </div>
  )
}
