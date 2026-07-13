import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'dim' | 'light'

export type PanelName =
  | 'sessions'
  | 'workspace'
  | 'skills'
  | 'memory'
  | 'connections'
  | 'office'
  | 'briefing'
  | 'cron'
  | 'kanban'
  | 'profiles'
  | 'settings'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'danger' | 'attention'
}

/** Prefill for Cowork New-request form (from Office gallery). */
export type CoworkFormPrefill = {
  deliverableType: 'presentation' | 'word' | 'spreadsheet' | 'pdf' | 'other'
  goalSeed?: string
}

interface UiState {
  theme: Theme
  sidebarOpen: boolean
  rightPanelOpen: boolean
  activePanel: PanelName | null
  /** Workspace file path requested by frontend tool `open_file_preview`. */
  workspacePreviewPath: string | null
  /** One-shot Office → Cowork form prefill (not persisted). */
  coworkFormPrefill: CoworkFormPrefill | null
  commandPaletteOpen: boolean
  toasts: Toast[]
  setTheme: (theme: Theme) => void
  cycleTheme: () => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setSidebarOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setActivePanel: (panel: PanelName | null) => void
  setWorkspacePreviewPath: (path: string | null) => void
  setCoworkFormPrefill: (prefill: CoworkFormPrefill | null) => void
  setCommandPaletteOpen: (open: boolean) => void
  addToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void
  removeToast: (id: string) => void
}

const THEMES: Theme[] = ['dark', 'dim', 'light']

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarOpen: true,
      rightPanelOpen: false,
      activePanel: null,
      workspacePreviewPath: null,
      coworkFormPrefill: null,
      commandPaletteOpen: false,
      toasts: [],
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      cycleTheme: () => {
        const current = get().theme
        const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] ?? 'dark'
        applyTheme(next)
        set({ theme: next })
      },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      setActivePanel: (activePanel) => set({ activePanel }),
      setWorkspacePreviewPath: (workspacePreviewPath) => set({ workspacePreviewPath }),
      setCoworkFormPrefill: (coworkFormPrefill) => set({ coworkFormPrefill }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      addToast: (toast) =>
        set((s) => ({
          toasts: [
            ...s.toasts,
            {
              id: toast.id ?? crypto.randomUUID(),
              title: toast.title,
              description: toast.description,
              variant: toast.variant ?? 'default',
            },
          ],
        })),
      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'hermes-ui',
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme)
      },
    },
  ),
)

applyTheme('dark')

export { applyTheme }
