import { vi } from 'vitest'

// Stream batching uses rAF — polyfill when absent (happy-dom).
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

// Default window for modules that read location.origin during API calls.
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { location: { origin: 'http://localhost' } },
  })
}
