import { useEffect, useState } from 'react'
import { getHealth } from '../api.js'

// Polls GET /health. state: 'checking' | 'online' | 'model-missing' | 'offline'
export function useBackendStatus(intervalMs = 5000) {
  const [status, setStatus] = useState({ state: 'checking', health: null, message: '' })

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    const check = async () => {
      try {
        const h = await getHealth(ctrl.signal)
        if (!alive) return
        setStatus(
          h.model_loaded
            ? { state: 'online', health: h, message: 'Backend connected, model loaded.' }
            : { state: 'model-missing', health: h, message: h.model_error || 'Model not loaded.' },
        )
      } catch (err) {
        if (!alive || err?.name === 'AbortError') return
        setStatus({ state: 'offline', health: null, message: err.message })
      }
    }
    check()
    const id = setInterval(check, intervalMs)
    return () => {
      alive = false
      ctrl.abort()
      clearInterval(id)
    }
  }, [intervalMs])

  return status
}
