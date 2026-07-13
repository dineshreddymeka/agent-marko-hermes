import { ApiError } from '@app/lib/api'
import { fetchWorkspaceDefaultCwd, writeWorkspaceFile } from '@app/lib/workspace-api'

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

function joinWorkspacePath(cwd: string, fileName: string): string {
  const separator = cwd.includes('\\') ? '\\' : '/'
  return `${cwd.replace(/[/\\]+$/, '')}${separator}${fileName}`
}

/**
 * Upload a text file into the Hermes workspace via `POST /api/fs/write-text`.
 */
export async function uploadWorkspaceFile(file: File): Promise<UploadedAttachment> {
  if (!isLikelyText(file)) {
    throw new ApiError(
      'Binary uploads are not supported — Hermes write-text accepts UTF-8 text only.',
      400,
    )
  }

  const id = crypto.randomUUID()
  const safeName = sanitizeFileName(file.name)
  const fileName = `${Date.now()}-${safeName}`
  const { cwd } = await fetchWorkspaceDefaultCwd()
  const path = joinWorkspacePath(cwd, fileName)
  const content = await file.text()

  await writeWorkspaceFile(path, content)

  return { id, name: file.name, path, size: file.size }
}

export function formatAttachmentLine(att: UploadedAttachment): string {
  return `[Attached: ${att.path}]`
}
