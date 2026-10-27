import { Fragment, useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { GAP_THRESHOLD_HOURS } from '../config.js'
import { positionAt, trackPieces } from '../lib/geo.js'
import { fmt } from '../lib/format.js'

const GAP_MS = GAP_THRESHOLD_HOURS * 3600e3

// divIcons avoid Leaflet's default marker-image path problems under bundlers.
const vesselIcon = (color, bearing, dim) =>
  L.divIcon({
    className: 'vessel-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<svg width="24" height="24" viewBox="-12 -12 24 24" style="transform:rotate(${bearing}deg);opacity:${dim ? 0.45 : 1}"><path d="M0,-10 L6.5,9 L0,5 L-6.5,9 Z" fill="${color}" stroke="#08121c" stroke-width="1.6"/></svg>`,
  })
const spillIcon = L.divIcon({ className: 'spill-icon', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="spill-origin"></div>' })
const approachIcon = L.divIcon({ className: 'approach-icon', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="approach-dot"></div>' })

function ClickToPlace({ onPlace }) {
  useMapEvents({
    click(e) {
      const ll = e.latlng.wrap()
      onPlace(ll.lat, ll.lng)
    },
  })
  return null
}

function FlyTo({ focus }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo(focus.center, focus.zoom ?? map.getZoom(), { duration: 0.7 })
  }, [focus, map])
  return null
}

export default function MapView({ center, zoom, spill, footprint, area, areaSource, vessels, currentTimeMs, selectedId, onSelectVessel, onPlaceSpill, selectedLead, focus }) {
  return (
    <div className="map-wrap">
      <MapContainer center={center} zoom={zoom} minZoom={3} worldCopyJump className="map">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />
        <ClickToPlace onPlace={onPlaceSpill} />
        <FlyTo focus={focus} />

        {vessels.map((v) => {
          const { solid, gaps } = trackPieces(v, GAP_MS)
          const sel = v.vessel_id === selectedId
          const common = { color: v.color, bubblingMouseEvents: false, eventHandlers: { click: () => onSelectVessel(v.vessel_id) } }
          return (
            <Fragment key={`track-${v.vessel_id}`}>
              {solid.map((pts, i) => (
                <Polyline key={`s${i}`} positions={pts} pathOptions={{ ...common, weight: sel ? 4 : 2, opacity: sel ? 0.95 : 0.55 }} />
              ))}
              {gaps.map((pts, i) => (
                <Polyline key={`g${i}`} positions={pts} pathOptions={{ ...common, weight: sel ? 3 : 2, opacity: 0.8, dashArray: '2 8' }}>
                  <Tooltip sticky>AIS reporting gap (synthetic): position interpolated</Tooltip>
                </Polyline>
              ))}
            </Fragment>
          )
        })}

        {vessels.map((v) => {
          const p = positionAt(v, currentTimeMs, GAP_MS)
          if (!p || p.state === 'not-started') return null
          return (
            <Marker key={`m-${v.vessel_id}`} position={[p.lat, p.lon]} icon={vesselIcon(v.color, p.bearing, p.state === 'ended')} eventHandlers={{ click: () => onSelectVessel(v.vessel_id) }} zIndexOffset={v.vessel_id === selectedId ? 1000 : 0}>
              <Tooltip direction="top" offset={[0, -10]}>
                {v.name} · {v.vessel_id} · SYNTHETIC
                {p.state === 'ended' && ' · track ends (demo data window)'}
                {p.state === 'gap' && ' · in AIS gap (interpolated)'}
              </Tooltip>
            </Marker>
          )
        })}

        {spill && (
          <>
            <Polygon positions={footprint.polygon} pathOptions={{ color: '#fb923c', weight: 2, fillColor: '#fb923c', fillOpacity: 0.3 }} bubblingMouseEvents={false}>
              <Tooltip sticky>
                Illustrative footprint · {fmt(area)} km² ({areaSource}). Not a validated simulation.
              </Tooltip>
            </Polygon>
            <Polyline positions={[[spill.lat, spill.lon], footprint.centroid]} pathOptions={{ color: '#fb923c', weight: 1.5, dashArray: '4 6', opacity: 0.8 }} interactive={false} />
            <Marker position={[spill.lat, spill.lon]} icon={spillIcon} interactive={false} />
          </>
        )}

        {spill && selectedLead && (
          <>
            <Polyline positions={[[spill.lat, spill.lon], [selectedLead.metrics.approach_position.latitude, selectedLead.metrics.approach_position.longitude]]} pathOptions={{ color: '#e2e8f0', weight: 1, dashArray: '3 5' }} interactive={false} />
            <Marker position={[selectedLead.metrics.approach_position.latitude, selectedLead.metrics.approach_position.longitude]} icon={approachIcon}>
              <Tooltip direction="right">Most relevant approach · {fmt(selectedLead.metrics.approach_km)} km from spill</Tooltip>
            </Marker>
          </>
        )}
      </MapContainer>

      {!spill && <div className="map-hint">Click the map to place a simulated spill</div>}
      <div className="legend" aria-label="Map legend">
        <div><i className="sw sw-spill" /> Spill footprint <em>(illustrative)</em></div>
        <div><i className="sw sw-track" /> Vessel track <em>(synthetic)</em></div>
        <div><i className="sw sw-gap" /> AIS gap <em>(dotted)</em></div>
      </div>
    </div>
  )
}
