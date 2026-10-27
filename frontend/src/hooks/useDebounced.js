import { useEffect, useState } from 'react'

export function useDebounced(value, delayMs) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return v
}
