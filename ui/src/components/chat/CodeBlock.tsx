import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { highlightCode } from '@app/lib/markdown/shiki-client'
import { copyToClipboard } from '@app/lib/utils'

interface CodeBlockProps {
  code: string
  lang: string
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void highlightCode(code, lang).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  const copy = async () => {
    await copyToClipboard(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border bg-canvas-inset px-3 py-1">
        <span className="font-mono text-[11px] text-fg-muted">{lang}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg"
          title="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto p-3 text-[13px] [&_pre]:!bg-transparent [&_pre]:!p-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-[13px] text-fg-muted">{code}</pre>
      )}
    </div>
  )
}
