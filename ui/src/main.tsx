import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from '@app/routeTree.gen'
import { applyTheme } from '@app/stores/ui'
import {
  persistQueryClientState,
  restoreQueryClientState,
  shouldPersistQueryKey,
} from '@app/lib/query-persist'
import { fetchCapabilities, CAPABILITIES_QUERY_KEY } from '@app/hooks/useCapabilities'
import { ensureHermesSessionToken } from '@app/lib/hermes-boot'
import '@app/styles/index.css'

applyTheme('dark')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
})

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function bootstrap() {
  await ensureHermesSessionToken()

  try {
    const cached = await restoreQueryClientState()
    if (cached && typeof cached === 'object' && cached !== null && 'queries' in cached) {
      const state = cached as {
        queries?: Array<{ queryKey: unknown[]; state: { data: unknown } }>
      }
      for (const q of state.queries ?? []) {
        if (!shouldPersistQueryKey(q.queryKey as readonly unknown[])) continue
        if (q.state?.data !== undefined) {
          queryClient.setQueryData(q.queryKey, q.state.data)
        }
      }
    }
  } catch {
    // IndexedDB unavailable (SSR/tests) — continue without cache
  }

  void queryClient.prefetchQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: fetchCapabilities,
    staleTime: 30_000,
  })

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  queryClient.getQueryCache().subscribe(() => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const snapshot = {
        queries: queryClient
          .getQueryCache()
          .getAll()
          .filter((q) => shouldPersistQueryKey(q.queryKey))
          .map((q) => ({
            queryKey: q.queryKey,
            state: { data: q.state.data },
          })),
      }
      void persistQueryClientState(snapshot)
    }, 1000)
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap()
