import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyTheme } from '@app/stores/ui'

export type Theme = 'dark' | 'dim' | 'light'

interface SettingsState {
  theme: Theme
  model: string
  llmBaseUrl: string
  llmApiKey: string
  embeddingsModel: string
  workspaceRoot: string
  defaultProfileId: string | null
  setTheme: (theme: Theme) => void
  setModel: (model: string) => void
  setLlmBaseUrl: (url: string) => void
  setLlmApiKey: (key: string) => void
  setEmbeddingsModel: (model: string) => void
  setWorkspaceRoot: (root: string) => void
  setDefaultProfileId: (id: string | null) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      model: 'composer-2.5',
      llmBaseUrl: '',
      llmApiKey: '',
      embeddingsModel: 'text-embedding-3-small',
      workspaceRoot: '',
      defaultProfileId: null,
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      setModel: (model) => set({ model }),
      setLlmBaseUrl: (llmBaseUrl) => set({ llmBaseUrl }),
      setLlmApiKey: (llmApiKey) => set({ llmApiKey }),
      setEmbeddingsModel: (embeddingsModel) => set({ embeddingsModel }),
      setWorkspaceRoot: (workspaceRoot) => set({ workspaceRoot }),
      setDefaultProfileId: (defaultProfileId) => set({ defaultProfileId }),
    }),
    {
      name: 'hermes-settings',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme)
      },
    },
  ),
)
