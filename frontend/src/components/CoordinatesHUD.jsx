// Convert decimal degrees to Degrees + Decimal Minutes format: DD° MM.MM' [N/S/E/W]
function toDMM(val, isLat) {
  const hemi = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W'
  const abs = Math.abs(val)
  const deg = Math.floor(abs)
  const min = ((abs - deg) * 60).toFixed(2)
  return `${deg}° ${min}' ${hemi}`
}

export default function CoordinatesHUD({ cursorCoords, mapCenter }) {
  const activeLat = cursorCoords?.lat ?? mapCenter?.[0] ?? 18.5
  const activeLon = cursorCoords?.lon ?? mapCenter?.[1] ?? 70.0

  const dmmLat = toDMM(activeLat, true)
  const dmmLon = toDMM(activeLon, false)
  const decimalStr = `(${activeLat.toFixed(6)}, ${activeLon.toFixed(6)})`

  return (
    <div className="mt-bottom-hud">
      <div className="mt-coords-pill" title="Cursor / Map Coordinates">
        <span className="coords-dmm">{dmmLat}, {dmmLon}</span>
        <span className="coords-dec">{decimalStr}</span>
      </div>
    </div>
  )
}
