import { useEffect, useRef, useState } from 'react'

// Runs `fn(signal)` whenever `deps` change (while `enabled`). Cancels stale requests, ignores
// out-of-order responses, and keeps the previous result visible while a new one loads.
export function useApiCall(fn, deps, enabled = true) {
  const [state, setState] = useState({ data: null, error: null, loading: false })
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return undefined
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true }))
    fnRef
      .current(ctrl.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setState({ data: null, error, loading: false })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled])

  return state
}
