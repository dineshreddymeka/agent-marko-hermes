import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ChatColumn } from '@app/components/shell/ChatColumn'
import { useSessionsStore } from '@app/stores/sessions'

export const Route = createFileRoute('/session/$id')({
  component: SessionRoute,
})

function SessionRoute() {
  const { id } = Route.useParams()
  const setActiveSessionId = useSessionsStore((s) => s.setActiveSessionId)

  useEffect(() => {
    setActiveSessionId(id)
  }, [id, setActiveSessionId])

  return <ChatColumn sessionId={id} />
}
