import { createRootRoute } from '@tanstack/react-router'
import { AppShell } from '@app/components/shell/AppShell'

export const Route = createRootRoute({
  component: AppShell,
})
