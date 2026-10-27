import { useState, useMemo, useRef, useEffect } from 'react'

export default function TopSearchBar({ vessels, onSelectVessel, onFlyToCoordinates, spill }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef(null)

  // Filter vessels based on query
  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase().trim()
    return vessels
      .filter((v) => {
        return (
          v.name.toLowerCase().includes(q) ||
          v.vessel_id.toLowerCase().includes(q) ||
          v.vessel_type?.toLowerCase().includes(q)
        )
      })
      .slice(0, 6)
  }, [query, vessels])

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!query.trim()) return

    // Check if user entered coordinates like "18.5, 70"
    const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+)[,\s]+([-+]?[0-9]*\.?[0-9]+)$/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lon = parseFloat(coordMatch[2])
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        onFlyToCoordinates(lat, lon)
        setIsOpen(false)
        return
      }
    }

    if (suggestions.length > 0) {
      onSelectVessel(suggestions[0].vessel_id)
      setIsOpen(false)
    }
  }

  return (
    <div className="mt-search-container" ref={wrapperRef}>
      <form className="mt-search-bar" onSubmit={handleSubmit}>
        <span className="mt-search-icon">🔍</span>
        <input
          type="text"
          className="mt-search-input"
          placeholder="Search MarineTraffic · Vessel name, MMSI, IMO, coordinates..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          aria-label="Search MarineTraffic"
        />
        {query && (
          <button
            type="button"
            className="mt-search-clear"
            onClick={() => {
              setQuery('')
              setIsOpen(false)
            }}
          >
            ✕
          </button>
        )}
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul className="mt-search-dropdown" role="listbox">
          <li className="mt-dropdown-header">Vessels in Area ({suggestions.length})</li>
          {suggestions.map((v) => (
            <li
              key={v.vessel_id}
              className="mt-dropdown-item"
              onClick={() => {
                onSelectVessel(v.vessel_id)
                setQuery(v.name)
                setIsOpen(false)
              }}
            >
              <span className="vessel-badge-indicator" style={{ backgroundColor: v.color || '#3b82f6' }} />
              <div className="vessel-dropdown-info">
                <strong>{v.name}</strong>
                <span>{v.vessel_id} · {v.vessel_type?.toUpperCase() || 'VESSEL'}</span>
              </div>
              <span className="vessel-chevron">›</span>
            </li>
          ))}
          {spill && (
            <li
              className="mt-dropdown-item spill-quick-jump"
              onClick={() => {
                onFlyToCoordinates(spill.lat, spill.lon)
                setIsOpen(false)
              }}
            >
              <span className="spill-jump-icon">🎯</span>
              <div className="vessel-dropdown-info">
                <strong>Incident Origin (Spill Site)</strong>
                <span>{spill.lat.toFixed(4)}°N, {spill.lon.toFixed(4)}°E</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
