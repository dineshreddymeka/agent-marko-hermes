interface FileDiffProps {
  path: string
  before: string
  after: string
}

export function FileDiff({ path, before, after }: FileDiffProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-canvas-inset px-3 py-1 font-mono text-xs text-fg-muted">
        {path}
      </div>
      <div className="grid grid-cols-2 divide-x divide-border text-xs font-mono">
        <pre className="max-h-48 overflow-auto bg-danger/5 p-2 text-danger">{before}</pre>
        <pre className="max-h-48 overflow-auto bg-success/5 p-2 text-success">{after}</pre>
      </div>
    </div>
  )
}
