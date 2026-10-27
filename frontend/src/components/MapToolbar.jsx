import { useState } from 'react'

export default function MapToolbar({
  activeBasemap,
  setActiveBasemap,
  showRangeRings,
  setShowRangeRings,
  showGrid,
  setShowGrid,
  onCenterSpill,
  onZoomIn,
  onZoomOut,
}) {
  const [showLayerMenu, setShowLayerMenu] = useState(false)

  const basemaps = [
    { id: 'light', name: 'Marine Light (MarineTraffic)', desc: 'Clean nautical light basemap' },
    { id: 'dark', name: 'Dark Navy', desc: 'Night ops dark maritime mode' },
    { id: 'satellite', name: 'Satellite Imagery', desc: 'High-res earth imagery' },
    { id: 'osm', name: 'OpenStreetMap', desc: 'Coastal topography' },
  ]

  return (
    <div className="mt-right-toolbar">
      {/* Basemap switcher */}
      <div className="mt-tool-wrap">
        <button
          className={`mt-tool-btn ${showLayerMenu ? 'active' : ''}`}
          onClick={() => setShowLayerMenu(!showLayerMenu)}
          title="Basemap Layers"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>

        {showLayerMenu && (
          <div className="mt-layer-popup">
            <div className="mt-layer-header">Basemap</div>
            {basemaps.map((b) => (
              <label
                key={b.id}
                className={`mt-layer-option ${activeBasemap === b.id ? 'selected' : ''}`}
                onClick={() => {
                  setActiveBasemap(b.id)
                  setShowLayerMenu(false)
                }}
              >
                <input
                  type="radio"
                  name="basemap"
                  checked={activeBasemap === b.id}
                  onChange={() => {}}
                />
                <div>
                  <strong>{b.name}</strong>
                  <span>{b.desc}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Range Rings around Spill */}
      <button
        className={`mt-tool-btn ${showRangeRings ? 'active' : ''}`}
        onClick={() => setShowRangeRings(!showRangeRings)}
        title="Toggle Spill Range Rings (5km, 15km, 30km)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      </button>

      {/* Grid lines toggle */}
      <button
        className={`mt-tool-btn ${showGrid ? 'active' : ''}`}
        onClick={() => setShowGrid(!showGrid)}
        title="Toggle Coordinate Grid"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>

      {/* Re-center on Spill site */}
      <button
        className="mt-tool-btn"
        onClick={onCenterSpill}
        title="Center on Incident Site"
      >
        <span style={{ fontSize: 16 }}>🎯</span>
      </button>

      {/* Zoom controls */}
      <div className="mt-zoom-group">
        <button className="mt-zoom-btn" onClick={onZoomIn} title="Zoom In">+</button>
        <button className="mt-zoom-btn" onClick={onZoomOut} title="Zoom Out">−</button>
      </div>
    </div>
  )
}
