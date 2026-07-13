import { useEffect } from 'react'
import { useCapabilities } from '@app/hooks/useCapabilities'
import { syncCapabilitySlashCommands } from '@app/lib/slash-commands'

/** Prefetch capabilities and register MCP slash commands app-wide. */
export function CapabilitiesBootstrap() {
  const { data } = useCapabilities()

  useEffect(() => {
    if (!data?.slashCommands?.length) return
    syncCapabilitySlashCommands(data.slashCommands)
  }, [data?.slashCommands])

  return null
}
