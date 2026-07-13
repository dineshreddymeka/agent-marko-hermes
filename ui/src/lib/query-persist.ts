/**
 * Lightweight TanStack Query IndexedDB persister for Open Jarvis panels.
 * Author: Dinesh Reddy Meka
 */

const DB_NAME = 'open-jarvis-query'
const STORE = 'queries'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as string | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export type PersistedClient = {
  timestamp: number
  buster: string
  clientState: unknown
}

const CACHE_KEY = 'tanstack-query-cache'
/** Bump when persisted empty/stale session lists must be discarded. */
const BUSTER = 'open-jarvis-v2'

/** Query keys safe to persist for offline panel reload. */
export const PERSISTABLE_QUERY_PREFIXES = [
  'sessions',
  'skills',
  'memory',
  'cron',
  'profiles',
  'settings',
  'mcp-servers',
] as const

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const root = String(queryKey[0] ?? '')
  return (PERSISTABLE_QUERY_PREFIXES as readonly string[]).includes(root)
}

export async function persistQueryClientState(clientState: unknown): Promise<void> {
  const payload: PersistedClient = {
    timestamp: Date.now(),
    buster: BUSTER,
    clientState,
  }
  await idbSet(CACHE_KEY, JSON.stringify(payload))
}

export async function restoreQueryClientState(
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<unknown | null> {
  const raw = await idbGet(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PersistedClient
    if (parsed.buster !== BUSTER) {
      await idbDel(CACHE_KEY)
      return null
    }
    if (Date.now() - parsed.timestamp > maxAgeMs) {
      await idbDel(CACHE_KEY)
      return null
    }
    return parsed.clientState
  } catch {
    await idbDel(CACHE_KEY)
    return null
  }
}

export async function clearPersistedQueryClient(): Promise<void> {
  await idbDel(CACHE_KEY)
}
