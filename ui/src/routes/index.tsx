import { createFileRoute } from '@tanstack/react-router'
import { ChatColumn } from '@app/components/shell/ChatColumn'

export const Route = createFileRoute('/')({
  component: () => <ChatColumn />,
})
