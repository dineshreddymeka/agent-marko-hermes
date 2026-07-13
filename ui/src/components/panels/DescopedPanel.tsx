import { descopedFeatureMessage } from '@app/lib/hermes-adapters'
import { EmptyState } from '@app/components/common/EmptyState'

/** Shown for Open Jarvis–only panels that need Bun/Postgres (not Hermes). */
export function DescopedPanel({ feature }: { feature: string }) {
  return (
    <div className="p-4">
      <EmptyState
        title={`${feature} unavailable`}
        description={descopedFeatureMessage(feature)}
      />
    </div>
  )
}
