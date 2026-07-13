import { create } from 'zustand'
import { applyPatch, type Operation } from 'fast-json-patch'
import type { AgentState } from '@app/types/hermes'

interface AgentStateStore {
  state: AgentState
  setState: (state: AgentState) => void
  applyDelta: (operations: Operation[]) => void
  updateField: <K extends keyof AgentState>(key: K, value: AgentState[K]) => void
}

const defaultState: AgentState = {
  todos: [],
  plan: '',
  workspaceContext: {},
}

export const useAgentStateStore = create<AgentStateStore>()((set, get) => ({
  state: defaultState,
  setState: (state) => set({ state }),
  applyDelta: (operations) => {
    const current = structuredClone(get().state)
    const result = applyPatch(current, operations, true, false)
    if (result.newDocument) set({ state: result.newDocument as AgentState })
  },
  updateField: (key, value) =>
    set((s) => ({ state: { ...s.state, [key]: value } })),
}))
