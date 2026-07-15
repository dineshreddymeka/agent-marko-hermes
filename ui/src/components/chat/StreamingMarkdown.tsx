import { memo, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
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

/**
 * Split streamed markdown at the last block boundary (blank line) that is
 * not inside an unclosed code fence. The stable prefix only ever grows, so
 * the expensive render (remark/rehype/KaTeX/shiki) is memoized and re-runs
 * only when a block completes — not on every animation frame. The short
 * tail re-renders cheaply.
 */
export function splitStableMarkdown(content: string): { stable: string; tail: string } {
  let inFence = false
  let pos = 0
  let lastBoundary = 0
  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    pos += line.length + 1
    // A blank line outside any code fence is a safe block boundary: text
    // before it can never be re-interpreted by what streams in later.
    if (!inFence && line.trim() === '') {
      lastBoundary = Math.min(pos, content.length)
    }
  }
  return { stable: content.slice(0, lastBoundary), tail: content.slice(lastBoundary) }
}

const markdownComponents = (opts: { streaming: boolean }) => ({
  code({ className, children, ...props }: ComponentProps<'code'>) {
    const match = /language-(\w+)/.exec(className ?? '')
    const code = String(children).replace(/\n$/, '')
    const lang = match?.[1] ?? ''
    if (lang === 'mermaid') {
      if (opts.streaming) {
        return (
          <pre className="my-2 overflow-x-auto rounded-md border border-border bg-canvas-inset p-3 font-mono text-xs text-fg-muted">
            {code}
          </pre>
        )
      }
      return <MermaidBlock code={code} />
    }
    if (match) {
      // While the block is still streaming in (tail), render plain — shiki
      // highlighting a growing block per frame is the top CPU cost in chat.
      if (opts.streaming) {
        return (
          <pre className="my-2 overflow-x-auto rounded-md border border-border bg-canvas-inset p-3 font-mono text-[13px] text-fg">
            {code}
          </pre>
        )
      }
      return <CodeBlock code={code} lang={lang || 'text'} />
    }
    return (
      <code className="rounded bg-canvas-inset px-1 py-0.5 font-mono text-[13px]" {...props}>
        {children}
      </code>
    )
  },
  pre({ children }: ComponentProps<'pre'>) {
    return <>{children}</>
  },
  a({ href, children }: ComponentProps<'a'>) {
    return (
      <a href={href} className="text-accent hover:underline" target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  },
})

/** Fully-featured render for completed markdown. Memoized: re-renders only
 * when the stable text grows past a block boundary, not per frame. */
const StableMarkdown = memo(function StableMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents({ streaming: false })}
    >
      {text}
    </ReactMarkdown>
  )
})

/** Light render for the in-flight tail: gfm only (no KaTeX on partial math,
 * no shiki on incomplete code blocks, no mermaid). */
const TailMarkdown = memo(function TailMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents({ streaming: true })}>
      {text}
    </ReactMarkdown>
  )
})

export function StreamingMarkdown({ content, streaming }: StreamingMarkdownProps) {
  const { stable, tail } = useMemo(
    () => (streaming ? splitStableMarkdown(content) : { stable: content, tail: '' }),
    [content, streaming],
  )

  return (
    <div
      className={cn(
        'markdown-body max-w-none text-sm',
        streaming && 'streaming-cursor streaming-response',
      )}
    >
      {stable && <StableMarkdown text={stable} />}
      {tail && <TailMarkdown text={tail} />}
      {streaming && tail && (
        <span className="sr-only stream-tail-reveal">{tail.slice(-1)}</span>
      )}
      {streaming && <span className="streaming-caret" aria-hidden />}
    </div>
  )
}
