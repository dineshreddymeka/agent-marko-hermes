import { useEffect, useState } from 'react'

/** Shared ticking clock for elapsed-time displays (250ms default).
 * Pauses while the tab is hidden and resyncs on return, so background tabs
 * spend zero CPU on elapsed-time re-renders. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let id: number | null = null
    const start = () => {
      if (id == null) id = window.setInterval(() => setNow(Date.now()), intervalMs)
    }
    const stop = () => {
      if (id != null) {
        window.clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        start()
      } else {
        stop()
      }
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
  return now
}
