import { Component, type ReactNode } from 'react'
import { copyToClipboard } from '@app/lib/utils'
import { useChatStore } from '@app/stores/chat'
import { useSettingsStore } from '@app/stores/settings'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  copyDiagnostics = () => {
    const chat = useChatStore.getState()
    const settings = useSettingsStore.getState()
    const diagnostics = {
      version: '0.2.0',
      product: 'Open Jarvis',
      theme: settings.theme,
      model: settings.model,
      recentEvents: chat.recentEvents.slice(-50),
      storeSnapshot: {
        runStatus: chat.runStatus,
        runId: chat.runId,
        contextUsage: chat.contextUsage,
        messageSessions: Object.keys(chat.messagesBySession),
      },
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      timestamp: new Date().toISOString(),
    }
    void copyToClipboard(JSON.stringify(diagnostics, null, 2))
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-lg font-medium text-danger">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-fg-muted">
            {this.state.error.message}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.copyDiagnostics}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-emphasis"
            >
              Copy diagnostics
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-fg hover:bg-canvas-subtle"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
