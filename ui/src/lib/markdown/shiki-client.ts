type HighlightRequest = {
  id: string
  code: string
  lang: string
}

type HighlightResponse = {
  id: string
  html: string
}

let worker: Worker | null = null
const pending = new Map<string, { resolve: (html: string) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/shiki.worker.ts', import.meta.url))
    worker.onmessage = (e: MessageEvent<HighlightResponse>) => {
      const { id, html } = e.data
      const p = pending.get(id)
      if (p) {
        pending.delete(id)
        p.resolve(html)
      }
    }
    worker.onerror = () => {
      for (const [, p] of pending) p.reject(new Error('Shiki worker error'))
      pending.clear()
    }
  }
  return worker
}

export function highlightCode(code: string, lang: string): Promise<string> {
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, code, lang } satisfies HighlightRequest)
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        resolve(`<pre><code>${escapeHtml(code)}</code></pre>`)
      }
    }, 5000)
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
