import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { CodeBlock } from '@app/components/chat/CodeBlock'
import { cn } from '@app/lib/utils'
import 'katex/dist/katex.min.css'

interface StreamingMarkdownProps {
  content: string
  streaming?: boolean
}

function mermaidTheme(): 'dark' | 'neutral' {
  const theme = document.documentElement.dataset.theme
  return theme === 'light' ? 'neutral' : 'dark'
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: mermaidTheme(),
          securityLevel: 'strict',
        })
        const id = `mmd-${Math.random().toString(36).slice(2, 9)}`
        const { svg } = await mermaid.render(id, code)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Mermaid render failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md border border-danger/30 bg-danger/10 p-3 font-mono text-xs text-danger">
        {error}
        {'\n\n'}
        {code}
      </pre>
    )
  }

  return (
    <div
      ref={ref}
      className="my-2 overflow-x-auto rounded-md border border-border bg-canvas-inset p-3 [&_svg]:max-w-full"
    />
  )
}

export function StreamingMarkdown({ content, streaming }: StreamingMarkdownProps) {
  const prevLenRef = useRef(0)

  useEffect(() => {
    if (!streaming) prevLenRef.current = 0
  }, [streaming])

  const committedLen = streaming ? prevLenRef.current : content.length
  const committed = content.slice(0, committedLen)
  const tail = streaming ? content.slice(committedLen) : ''
  const renderText = committed + tail

  useEffect(() => {
    if (streaming) prevLenRef.current = content.length
  }, [content, streaming])

  return (
    <div
      className={cn(
        'markdown-body max-w-none text-sm',
        streaming && 'streaming-cursor streaming-response',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '')
            const code = String(children).replace(/\n$/, '')
            const lang = match?.[1] ?? ''
            if (lang === 'mermaid') {
              if (streaming) {
                return (
                  <pre className="my-2 overflow-x-auto rounded-md border border-border bg-canvas-inset p-3 font-mono text-xs text-fg-muted">
                    {code}
                  </pre>
                )
              }
              return <MermaidBlock code={code} />
            }
            if (match) {
              return <CodeBlock code={code} lang={lang || 'text'} />
            }
            return (
              <code
                className="rounded bg-canvas-inset px-1 py-0.5 font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre({ children }) {
            return <>{children}</>
          },
          a({ href, children }) {
            return (
              <a href={href} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {renderText}
      </ReactMarkdown>
      {streaming && tail && (
        <span className="sr-only stream-tail-reveal">{tail.slice(-1)}</span>
      )}
      {streaming && <span className="streaming-caret" aria-hidden />}
    </div>
  )
}
