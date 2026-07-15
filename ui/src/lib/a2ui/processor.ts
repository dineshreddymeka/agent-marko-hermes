export interface A2UISurfaceState {
  id: string
  sessionId: string | null
  components: A2UIComponent[]
  data: Record<string, unknown>
  complete: boolean
}

export interface A2UIComponent {
  id: string
  type: string
  props: Record<string, unknown>
  children?: string[]
}

const surfaces = new Map<string, A2UISurfaceState>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function subscribeA2UI(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSurfaces(): Map<string, A2UISurfaceState> {
  return surfaces
}

export function getSurface(id: string): A2UISurfaceState | undefined {
  return surfaces.get(id)
}

/** Surface id from an `a2ui.message` custom event payload. */
export function extractA2uiSurfaceId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const sid = (payload as { surfaceId?: unknown }).surfaceId
  return typeof sid === 'string' && sid.length > 0 ? sid : null
}

/** Normalize persisted or streamed `a2ui` refs to a surface id string. */
export function resolveA2uiSurfaceRef(a2ui: unknown): string | null {
  if (a2ui == null) return null
  if (typeof a2ui === 'string' && a2ui.length > 0) return a2ui
  if (typeof a2ui === 'object') return extractA2uiSurfaceId(a2ui)
  return null
}

/** True when a persisted `a2ui` ref includes a renderable surface payload. */
export function isHydratableA2uiRef(a2ui: unknown): boolean {
  if (!a2ui || typeof a2ui !== 'object') return false
  const payload = a2ui as {
    surfaceId?: unknown
    component?: unknown
    components?: unknown
    a2uiMessages?: unknown
  }
  if (typeof payload.surfaceId !== 'string') return false
  if (payload.component != null) return true
  if (Array.isArray(payload.components) && payload.components.length > 0) return true
  if (Array.isArray(payload.a2uiMessages) && payload.a2uiMessages.length > 0) return true
  return false
}

/** Replay persisted/streamed A2UI payloads into the in-memory surface map. */
export function hydrateA2uiFromRef(a2ui: unknown, sessionId: string | null): void {
  if (!a2ui || typeof a2ui !== 'object') return
  const payload = a2ui as {
    surfaceId?: string
    component?: A2UIComponent
    components?: A2UIComponent[]
    a2uiMessages?: Array<{
      surfaceId?: string
      component?: A2UIComponent
      data?: Record<string, unknown>
      complete?: boolean
    }>
    data?: Record<string, unknown>
    complete?: boolean
  }

  if (Array.isArray(payload.a2uiMessages)) {
    for (const item of payload.a2uiMessages) {
      processA2UIMessage(item, sessionId)
    }
    return
  }

  if (Array.isArray(payload.components) && payload.components.length > 0) {
    for (const component of payload.components) {
      processA2UIMessage(
        {
          surfaceId: payload.surfaceId,
          component,
          data: payload.data,
          complete: payload.complete,
        },
        sessionId,
      )
    }
    return
  }

  if (isHydratableA2uiRef(a2ui)) {
    processA2UIMessage(a2ui, sessionId)
  }
}

export function processA2UIMessage(payload: unknown, sessionId: string | null): void {
  if (!payload || typeof payload !== 'object') return

  const msg = payload as {
    surfaceId?: string
    type?: string
    component?: A2UIComponent
    data?: Record<string, unknown>
    complete?: boolean
  }

  const surfaceId = msg.surfaceId ?? crypto.randomUUID()
  let surface = surfaces.get(surfaceId)

  if (!surface) {
    surface = {
      id: surfaceId,
      sessionId,
      components: [],
      data: {},
      complete: false,
    }
    surfaces.set(surfaceId, surface)
  }

  if (msg.component) {
    const idx = surface.components.findIndex((c) => c.id === msg.component!.id)
    if (idx >= 0) {
      surface.components[idx] = msg.component
    } else {
      surface.components.push(msg.component)
    }
  }

  if (msg.data) {
    surface.data = { ...surface.data, ...msg.data }
  }

  if (msg.complete) {
    surface.complete = true
  }

  notify()
}

/** @deprecated use sendA2UIAction from `@app/lib/a2ui/actions` */
export { sendA2UIAction } from './actions'
