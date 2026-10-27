import { Fragment, useEffect, useMemo } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Circle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { GAP_THRESHOLD_HOURS } from '../config.js'
import { positionAt, trackPieces } from '../lib/geo.js'
import { fmt } from '../lib/format.js'
import shippingNetwork from '@data/shipping_network.json'

// Seaport Anchor Marker Icon
const portIcon = (port) =>
  L.divIcon({
    className: 'mt-port-marker-wrap',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `
      <div style="width:22px;height:22px;border-radius:50%;background:#0f172a;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;box-shadow:0 0 6px rgba(56,189,248,0.4);font-size:11px;cursor:pointer;">
        ⚓
      </div>
    `,
  })

const GAP_MS = GAP_THRESHOLD_HOURS * 3600e3

// Authentic MarineTraffic Arrowhead Vessel Icon
const createMarineTrafficIcon = (color, bearing = 0, isSelected = false, isEnded = false, size = 28) => {
  const half = size / 2
  return L.divIcon({
    className: 'mt-vessel-marker-wrap',
    iconSize: [size, size],
    iconAnchor: [half, half],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
        ${
          isSelected
            ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};opacity:0.8;animation:pulse 1.5s infinite;"></div>`
            : ''
        }
        <svg
          width="${size}"
          height="${size}"
          viewBox="-12 -12 24 24"
          style="transform: rotate(${bearing}deg); opacity: ${isEnded ? 0.45 : 1}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); transition: transform 0.2s linear;"
        >
          <path
            d="M 0 -11 L 7 8 L 0 4 L -7 8 Z"
            fill="${color}"
            stroke="#0b131c"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    `,
  })
}

// Spill origin marker
const spillOriginIcon = L.divIcon({
  className: 'spill-origin-wrap',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  html: `
    <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(239, 68, 68, 0.25);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:absolute;inset:4px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 0 10px rgba(239,68,68,0.8);"></div>
      <div style="position:absolute;width:4px;height:4px;border-radius:50%;background:#fff;"></div>
    </div>
  `,
})

const approachDotIcon = L.divIcon({
  className: 'approach-dot-wrap',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: `
    <div style="width:16px;height:16px;border-radius:50%;background:#0284c7;border:2px solid #fff;box-shadow:0 0 8px #0284c7;"></div>
  `,
})

// Handles clicks to place spill and tracks mouse coordinates
function MapInteractionListener({ onPlace, onMouseMove }) {
  useMapEvents({
    click(e) {
      const ll = e.latlng.wrap()
      onPlace(ll.lat, ll.lng)
    },
    mousemove(e) {
      const ll = e.latlng.wrap()
      if (onMouseMove) onMouseMove({ lat: ll.lat, lon: ll.lng })
    },
  })
  return null
}

function FlyToController({ focus }) {
  const map = useMap()
  useEffect(() => {
    if (focus?.center) {
      map.flyTo(focus.center, focus.zoom ?? Math.max(map.getZoom(), 8), { duration: 0.8 })
    }
  }, [focus, map])
  return null
}

export default function MapView({
  center,
  zoom = 8,
  activeBasemap = 'light',
  spill,
  footprint,
  area,
  areaSource,
  vessels,
  realVessels = [],
  currentTimeMs,
  selectedId,
  onSelectVessel,
  onPlaceSpill,
  selectedLead,
  focus,
  onCursorMove,
  showRangeRings = false,
  showGrid = false,
  showCorridors = true,
}) {
  const shippingCorridors = useMemo(() => {
    if (!shippingNetwork?.routes || !shippingNetwork?.ports) return []
    const portsById = Object.fromEntries(
      shippingNetwork.ports.map((p) => [p.id, [p.latitude, p.longitude]]),
    )
    return shippingNetwork.routes
      .map((r, i) => {
        const p1 = portsById[r.from]
        const p2 = portsById[r.to]
        if (!p1 || !p2) return null
        return { id: `corridor-${i}`, points: [p1, ...(r.waypoints || []), p2] }
      })
      .filter(Boolean)
  }, [])
  const basemapConfigs = {
    light: {
      base: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      reference: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    dark: {
      base: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      reference: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    satellite: {
      base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      reference: null,
      attribution: 'Source: Esri, Maxar, Earthstar Geographics',
    },
    osm: {
      base: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      reference: null,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  }

  const currentCfg = basemapConfigs[activeBasemap] || basemapConfigs.light

  return (
    <div className="mt-map-canvas-wrap">
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={3}
        worldCopyJump
        zoomControl={false}
        className="mt-leaflet-container"
      >
        {/* Basemap Tiles */}
        <TileLayer
          key={activeBasemap}
          url={currentCfg.base}
          attribution={currentCfg.attribution}
          maxZoom={19}
        />
        {currentCfg.reference && (
          <TileLayer
            key={`${activeBasemap}-labels`}
            url={currentCfg.reference}
            attribution=""
            maxZoom={19}
          />
        )}

        <MapInteractionListener onPlace={onPlaceSpill} onMouseMove={onCursorMove} />
        <FlyToController focus={focus} />

        {/* International Shipping Corridors & Fairways */}
        {showCorridors &&
          shippingCorridors.map((c) => (
            <Polyline
              key={c.id}
              positions={c.points}
              pathOptions={{
                color: '#64748b',
                weight: 1.5,
                dashArray: '3 7',
                opacity: 0.4,
                lineCap: 'round',
              }}
              interactive={false}
            />
          ))}

        {/* International Seaports */}
        {showCorridors &&
          shippingNetwork?.ports?.map((p) => (
            <Marker
              key={`port-${p.id}`}
              position={[p.latitude, p.longitude]}
              icon={portIcon(p)}
              zIndexOffset={300}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <div style={{ minWidth: 120, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#f8fafc' }}>
                    ⚓ Port of {p.name} ({p.id})
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.country}</div>
                  <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 2 }}>
                    {p.latitude.toFixed(2)}°N, {p.longitude.toFixed(2)}°E
                  </div>
                </div>
              </Tooltip>
            </Marker>
          ))}

        {/* Marine Coordinate Grid Lines */}
        {showGrid && (
          <Fragment>
            {[-60, -30, 0, 15, 20, 30, 60].map((lat) => (
              <Polyline
                key={`grid-lat-${lat}`}
                positions={[
                  [lat, -180],
                  [lat, 180],
                ]}
                pathOptions={{ color: '#94a3b8', weight: 0.6, dashArray: '4 4', opacity: 0.4 }}
                interactive={false}
              />
            ))}
            {[-120, -60, 0, 60, 70, 80, 120].map((lon) => (
              <Polyline
                key={`grid-lon-${lon}`}
                positions={[
                  [-85, lon],
                  [85, lon],
                ]}
                pathOptions={{ color: '#94a3b8', weight: 0.6, dashArray: '4 4', opacity: 0.4 }}
                interactive={false}
              />
            ))}
          </Fragment>
        )}

        {/* 6 Demo Vessels - Historical Routes */}
        {vessels.map((v) => {
          const { solid, gaps } = trackPieces(v, GAP_MS)
          const sel = v.vessel_id === selectedId
          const common = {
            color: v.color || '#3b82f6',
            bubblingMouseEvents: false,
            eventHandlers: { click: () => onSelectVessel(v.vessel_id) },
          }

          return (
            <Fragment key={`track-${v.vessel_id}`}>
              {solid.map((pts, i) => (
                <Polyline
                  key={`s${i}`}
                  positions={pts}
                  pathOptions={{
                    ...common,
                    weight: sel ? 4 : 2.5,
                    opacity: sel ? 0.95 : 0.5,
                    lineCap: 'round',
                  }}
                />
              ))}
              {gaps.map((pts, i) => (
                <Polyline
                  key={`g${i}`}
                  positions={pts}
                  pathOptions={{
                    ...common,
                    weight: sel ? 3.5 : 2,
                    opacity: 0.75,
                    dashArray: '3 8',
                  }}
                >
                  <Tooltip sticky>AIS reporting gap (position interpolated)</Tooltip>
                </Polyline>
              ))}
            </Fragment>
          )
        })}

        {/* 6 Real Vessels - Directional Arrowhead Markers */}
        {vessels.map((v) => {
          const p = positionAt(v, currentTimeMs, GAP_MS)
          if (!p || p.state === 'not-started') return null
          const sel = v.vessel_id === selectedId

          // Color scheme: high suspect leads get red/warm, others cargo green/blue
          const markerColor = v.vessel_type === 'tanker' ? '#ef4444' : v.color || '#22c55e'

          return (
            <Marker
              key={`m-${v.vessel_id}`}
              position={[p.lat, p.lon]}
              icon={createMarineTrafficIcon(markerColor, p.bearing, sel, p.state === 'ended', 28)}
              eventHandlers={{ click: () => onSelectVessel(v.vessel_id) }}
              zIndexOffset={sel ? 2000 : 500}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                <strong>{v.flag || '🚢'} {v.name}</strong> ({v.vessel_id})<br />
                <span style={{ fontSize: 11 }}>
                  Type: <strong>{v.vessel_type?.toUpperCase() || 'VESSEL'}</strong> · COG: <strong>{Math.round(p.bearing)}°</strong>
                </span>
                {p.state === 'gap' && (
                  <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 2 }}>
                    ⚠️ In AIS Transponder Gap
                  </div>
                )}
                {p.state === 'ended' && (
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    Track ends (reporting window)
                  </div>
                )}
              </Tooltip>
            </Marker>
          )
        })}

        {/* Real Maritime AIS Fleet Traffic (Live MarineTraffic vessels in Arabian Sea / Mumbai) */}
        {realVessels.map((rv) => {
          const sel = rv.id === selectedId || rv.vessel_id === selectedId
          const markerColor = rv.color || (rv.vessel_type === 'tanker' ? '#ef4444' : '#22c55e')

          return (
            <Marker
              key={`fleet-${rv.id || rv.vessel_id}`}
              position={[rv.lat, rv.lon]}
              icon={createMarineTrafficIcon(markerColor, rv.heading || 0, sel, false, sel ? 28 : 22)}
              eventHandlers={{ click: () => onSelectVessel(rv.id || rv.vessel_id) }}
              zIndexOffset={sel ? 2500 : 350}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <div style={{ minWidth: 155, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>
                    {rv.flag || '🚢'} {rv.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0' }}>
                    MMSI: <strong style={{ color: '#cbd5e1' }}>{rv.mmsi}</strong> · IMO: <strong style={{ color: '#cbd5e1' }}>{rv.imo}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: '#e2e8f0' }}>
                    Type: <strong style={{ textTransform: 'capitalize' }}>{rv.vessel_type}</strong> · SOG: <strong>{rv.speedKnots} kn</strong> · COG: <strong>{rv.heading}°</strong>
                  </div>
                  <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2 }}>
                    Dest: <strong>{rv.destination}</strong>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          )
        })}

        {/* Concentric Range Rings around Spill */}
        {spill && showRangeRings && (
          <Fragment>
            <Circle
              center={[spill.lat, spill.lon]}
              radius={5000}
              pathOptions={{ color: '#ef4444', weight: 1.2, dashArray: '4 6', fillOpacity: 0 }}
              interactive={false}
            />
            <Circle
              center={[spill.lat, spill.lon]}
              radius={15000}
              pathOptions={{ color: '#ef4444', weight: 1.2, dashArray: '4 8', fillOpacity: 0 }}
              interactive={false}
            />
            <Circle
              center={[spill.lat, spill.lon]}
              radius={30000}
              pathOptions={{ color: '#ef4444', weight: 1.2, dashArray: '4 10', fillOpacity: 0 }}
              interactive={false}
            />
          </Fragment>
        )}

        {/* Spill Incident Footprint & Origin */}
        {spill && (
          <Fragment>
            <Polygon
              positions={footprint.polygon}
              pathOptions={{
                color: '#ea580c',
                weight: 2,
                fillColor: '#ea580c',
                fillOpacity: 0.35,
                className: 'spill-polygon',
              }}
              bubblingMouseEvents={false}
            >
              <Tooltip sticky>
                <strong>Spill Footprint</strong> · {fmt(area)} km² ({areaSource})<br />
                <span style={{ fontSize: 11, opacity: 0.8 }}>Illustrative ML drift prediction</span>
              </Tooltip>
            </Polygon>

            {/* Drift Vector from Origin to Footprint Centroid */}
            <Polyline
              positions={[[spill.lat, spill.lon], footprint.centroid]}
              pathOptions={{ color: '#f97316', weight: 2, dashArray: '4 6', opacity: 0.85 }}
              interactive={false}
            />

            {/* Origin Pin */}
            <Marker position={[spill.lat, spill.lon]} icon={spillOriginIcon} interactive={false}>
              <Tooltip direction="bottom" offset={[0, 16]}>
                <strong>Spill Incident Origin</strong><br />
                {spill.lat.toFixed(4)}°N, {spill.lon.toFixed(4)}°E
              </Tooltip>
            </Marker>
          </Fragment>
        )}

        {/* Selected Vessel Closest Approach Line */}
        {spill && selectedLead && (
          <Fragment>
            <Polyline
              positions={[
                [spill.lat, spill.lon],
                [
                  selectedLead.metrics.approach_position.latitude,
                  selectedLead.metrics.approach_position.longitude,
                ],
              ]}
              pathOptions={{ color: '#0284c7', weight: 2.5, dashArray: '4 6', opacity: 0.95 }}
              interactive={false}
            />
            <Marker
              position={[
                selectedLead.metrics.approach_position.latitude,
                selectedLead.metrics.approach_position.longitude,
              ]}
              icon={approachDotIcon}
            >
              <Tooltip direction="right">
                <strong>Closest Approach Point</strong><br />
                {fmt(selectedLead.metrics.approach_km)} km from origin
              </Tooltip>
            </Marker>
          </Fragment>
        )}
      </MapContainer>
    </div>
  )
}
