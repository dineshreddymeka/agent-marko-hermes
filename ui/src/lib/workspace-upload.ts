import { ApiError } from '@app/lib/api'

export interface UploadedAttachment {
  id: string
  name: string
  path: string
  size: number
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
}

function isLikelyText(file: File): boolean {
  if (file.type.startsWith('text/')) return true
  if (
    /^(application\/(json|xml|javascript|typescript|x-yaml|yaml)|image\/svg\+xml)/.test(
      file.type,
    )
  ) {
    return true
  }
  return /\.(txt|md|json|ts|tsx|js|jsx|css|html|csv|yml|yaml|xml|py|rs|go|toml|env|sh)$/i.test(
    file.name,
  )
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Upload a file into the workspace (`uploads/…`) via existing REST
 * `POST /api/workspace/upload` (JSON path + content, optional base64).
 */
export async function uploadWorkspaceFile(file: File): Promise<UploadedAttachment> {
  const id = crypto.randomUUID()
  const safeName = sanitizeFileName(file.name)
  const path = `uploads/${Date.now()}-${safeName}`

  const useBase64 = !isLikelyText(file)
  const content = useBase64 ? await fileToBase64(file) : await file.text()

  const res = await fetch('/api/workspace/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      path,
      content,
      ...(useBase64 ? { encoding: 'base64' } : {}),
    }),
  })

  if (!res.ok) {
    // Fallback to PUT /api/workspace/file
    const put = await fetch('/api/workspace/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        path,
        content,
        ...(useBase64 ? { encoding: 'base64' } : {}),
      }),
    })
    if (!put.ok) {
      let message = put.statusText || res.statusText
      try {
        const err = (await put.json()) as { message?: string; error?: string }
        message = err.message ?? err.error ?? message
      } catch {
        /* ignore */
      }
      throw new ApiError(message || 'Upload failed', put.status)
    }
    return { id, name: file.name, path, size: file.size }
  }

  const body = (await res.json()) as { path?: string; name?: string }
  return {
    id,
    name: body.name ?? file.name,
    path: body.path ?? path,
    size: file.size,
  }
}

export function formatAttachmentLine(att: UploadedAttachment): string {
  return `[Attached: ${att.path}]`
}
