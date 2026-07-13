import { useAgentStateStore } from '@app/stores/agentState'
import { Plus, Trash2 } from 'lucide-react'
import { generateId } from '@app/lib/utils'

export function AgentStatePanel() {
  const state = useAgentStateStore((s) => s.state)
  const updateField = useAgentStateStore((s) => s.updateField)

  const todos = state.todos ?? []
  const workspaceContext = state.workspaceContext ?? {}
  const contextEntries = Object.entries(workspaceContext)

  const addTodo = () => {
    updateField('todos', [...todos, { id: generateId(), text: '', done: false }])
  }

  const updateTodo = (id: string, patch: Partial<{ id: string; text: string; done: boolean }>) => {
    updateField(
      'todos',
      todos.map((t: { id: string; text: string; done: boolean }) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    )
  }

  const removeTodo = (id: string) => {
    updateField(
      'todos',
      todos.filter((t: { id: string }) => t.id !== id),
    )
  }

  const setContextKey = (key: string, value: string, prevKey?: string) => {
    const next = { ...workspaceContext }
    if (prevKey && prevKey !== key) delete next[prevKey]
    if (!key.trim()) return
    try {
      next[key] = JSON.parse(value) as unknown
    } catch {
      next[key] = value
    }
    updateField('workspaceContext', next)
  }

  const removeContextKey = (key: string) => {
    const next = { ...workspaceContext }
    delete next[key]
    updateField('workspaceContext', next)
  }

  const addContextKey = () => {
    const key = `key_${Object.keys(workspaceContext).length + 1}`
    updateField('workspaceContext', { ...workspaceContext, [key]: '' })
  }

  return (
    <div className="space-y-4 p-3 text-sm">
      <p className="text-xs text-fg-muted">
        Edits apply to the next Open Jarvis run (STATE included in RunAgentInput).
      </p>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Todos
        </h3>
        <ul className="space-y-1">
          {todos.map((todo: { id: string; text: string; done: boolean }) => (
            <li key={todo.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={todo.done}
                onChange={(e) => updateTodo(todo.id, { done: e.target.checked })}
              />
              <input
                type="text"
                value={todo.text}
                onChange={(e) => updateTodo(todo.id, { text: e.target.value })}
                className="flex-1 rounded border border-border bg-canvas px-2 py-0.5 text-xs text-fg"
              />
              <button
                type="button"
                onClick={() => removeTodo(todo.id)}
                className="text-fg-muted hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addTodo}
          className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Plus size={12} /> Add todo
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Plan
        </h3>
        <textarea
          value={state.plan ?? ''}
          onChange={(e) => updateField('plan', e.target.value)}
          rows={6}
          className="w-full rounded border border-border bg-canvas px-2 py-1 font-mono text-xs text-fg"
          placeholder="Agent plan…"
        />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Workspace context
        </h3>
        <ul className="space-y-2">
          {contextEntries.map(([key, value]) => (
            <li key={key} className="flex flex-col gap-1 rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  defaultValue={key}
                  onBlur={(e) =>
                    setContextKey(
                      e.target.value,
                      typeof value === 'string' ? value : JSON.stringify(value),
                      key,
                    )
                  }
                  className="flex-1 rounded border border-border bg-canvas px-2 py-0.5 font-mono text-xs text-accent"
                />
                <button
                  type="button"
                  onClick={() => removeContextKey(key)}
                  className="text-fg-muted hover:text-danger"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <textarea
                defaultValue={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                onBlur={(e) => setContextKey(key, e.target.value)}
                rows={2}
                className="w-full rounded border border-border bg-canvas px-2 py-1 font-mono text-[11px] text-fg"
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addContextKey}
          className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Plus size={12} /> Add context key
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
          State JSON
        </h3>
        <pre className="max-h-40 overflow-auto rounded border border-border bg-canvas-inset p-2 font-mono text-[11px] text-fg-muted">
          {JSON.stringify(state, null, 2)}
        </pre>
      </section>
    </div>
  )
}
