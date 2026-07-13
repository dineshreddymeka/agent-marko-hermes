import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Star, Trash2 } from 'lucide-react'
import { useSettingsStore } from '@app/stores/settings'
import { useUiStore } from '@app/stores/ui'
import type { Profile } from '@hermes/shared'
import {
  createHermesProfile,
  deleteHermesProfile,
  fetchHermesProfiles,
  fetchHermesSettings,
  setHermesDefaultProfile,
  updateHermesProfile,
} from '@app/lib/hermes-adapters'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { labelTitle, modelLabel } from '@app/lib/display-names'
import { profileProviderLabel } from '@app/lib/labels'

const emptyForm = {
  name: '',
  systemPrompt: 'You are Open Jarvis, a helpful AI assistant.',
  model: 'composer-2.5',
  temperature: 0.7,
  provider: 'native' as Profile['provider'],
}

export function ProfilesPanel() {
  const setModel = useSettingsStore((s) => s.setModel)
  const defaultProfileId = useSettingsStore((s) => s.defaultProfileId)
  const setDefaultProfileId = useSettingsStore((s) => s.setDefaultProfileId)
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data: profiles, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchHermesProfiles,
    retry: false,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const all = await fetchHermesSettings()
      if (typeof all.default_profile_id === 'string') {
        setDefaultProfileId(all.default_profile_id)
      }
      return all
    },
    retry: false,
  })

  const create = useMutation({
    mutationFn: () => createHermesProfile(form),
    onSuccess: () => {
      addToast({ title: 'Profile created', variant: 'success' })
      setShowForm(false)
      setForm(emptyForm)
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: () => addToast({ title: 'Create failed', variant: 'danger' }),
  })

  const update = useMutation({
    mutationFn: () =>
      updateHermesProfile(editing!.id, {
        name: form.name,
        systemPrompt: form.systemPrompt,
        model: form.model,
        temperature: form.temperature,
        provider: form.provider,
      }),
    onSuccess: (profile) => {
      addToast({ title: 'Profile saved', variant: 'success' })
      setEditing(null)
      if (defaultProfileId === profile.id || settings?.default_profile_id === profile.id) {
        setModel(profile.model)
      }
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: () => addToast({ title: 'Save failed', variant: 'danger' }),
  })

  const setDefault = useMutation({
    mutationFn: (profile: Profile) => setHermesDefaultProfile(profile.id),
    onSuccess: (_data, profile) => {
      setDefaultProfileId(profile.id)
      setModel(profile.model)
      addToast({ title: `Default: ${profile.name}`, variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: () => addToast({ title: 'Could not set default', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteHermesProfile(id),
    onSuccess: () => {
      addToast({ title: 'Profile deleted', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  if (isLoading) return <Skeleton className="m-4 h-20 w-full" />

  if (isError) {
    return (
      <EmptyState
        title="Could not load profiles"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  const formOpen = showForm || !!editing

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg">Profiles</h2>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setForm(emptyForm)
            setShowForm((v) => !v)
          }}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Plus size={12} /> New profile
        </button>
      </div>

      {formOpen && (
        <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Profile name"
            className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm"
          />
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
            rows={4}
            placeholder="System prompt"
            className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="Model"
              className="min-w-[140px] flex-1 rounded border border-border bg-canvas px-2 py-1 text-sm"
            />
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
              className="w-24 rounded border border-border bg-canvas px-2 py-1 text-sm"
            />
            <select
              value={form.provider}
              onChange={(e) =>
                setForm((f) => ({ ...f, provider: e.target.value as Profile['provider'] }))
              }
              className="rounded border border-border bg-canvas px-2 py-1 text-sm"
            >
              <option value="native">{profileProviderLabel('native')}</option>
              <option value="agui-remote">{profileProviderLabel('agui-remote')}</option>
              <option value="hermes-python">{profileProviderLabel('hermes-python')}</option>
            </select>
          </div>
          <button
            type="button"
            disabled={!form.name.trim()}
            onClick={() => (editing ? update.mutate() : create.mutate())}
            className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            {editing ? 'Save' : 'Create'}
          </button>
        </div>
      )}

      {!profiles?.length ? (
        <EmptyState
          title="No profiles"
          description="Create agent profiles with custom prompts for Open Jarvis."
        />
      ) : (
        <ul className="space-y-2">
          {profiles.map((profile) => {
            const isDefault =
              defaultProfileId === profile.id ||
              settings?.default_profile_id === profile.id
            return (
              <li key={profile.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-fg">
                    {profile.name}
                    {isDefault && (
                      <span className="ml-2 text-[10px] text-accent">default</span>
                    )}
                  </h3>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      title="Set default"
                      onClick={() => setDefault.mutate(profile)}
                      className="rounded p-1 text-fg-muted hover:text-accent"
                    >
                      <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false)
                        setEditing(profile)
                        setForm({
                          name: profile.name,
                          systemPrompt: profile.systemPrompt,
                          model: profile.model,
                          temperature: profile.temperature,
                          provider: profile.provider,
                        })
                      }}
                      className="text-xs text-accent hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModel(profile.model)
                        addToast({
                          title: `Using ${modelLabel(profile.model)}`,
                          description: profile.model,
                          variant: 'success',
                        })
                      }}
                      className="text-xs text-accent hover:underline"
                    >
                      Use model
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete profile “${profile.name}”?`)) remove.mutate(profile.id)
                      }}
                      className="rounded p-1 text-fg-muted hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  <span title={profile.model}>{modelLabel(profile.model)}</span>
                  {' · '}
                  <span title={profile.provider}>{profileProviderLabel(profile.provider)}</span>
                  {' · temp '}
                  {profile.temperature}
                </p>
                <p className="mt-2 line-clamp-2 text-xs text-fg-subtle">{profile.systemPrompt}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
