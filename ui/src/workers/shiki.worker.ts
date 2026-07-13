import { createHighlighter } from 'shiki'

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null

async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'javascript', 'json', 'bash', 'python', 'sql', 'markdown', 'tsx', 'jsx'],
    })
  }
  return highlighter
}

self.onmessage = async (e: MessageEvent<{ id: string; code: string; lang: string }>) => {
  const { id, code, lang } = e.data
  try {
    const hl = await getHighlighter()
    const theme = 'github-dark'
    const html = hl.codeToHtml(code, { lang: lang || 'text', theme })
    self.postMessage({ id, html })
  } catch {
    self.postMessage({
      id,
      html: `<pre class="shiki"><code>${code.replace(/</g, '&lt;')}</code></pre>`,
    })
  }
}

export default self
