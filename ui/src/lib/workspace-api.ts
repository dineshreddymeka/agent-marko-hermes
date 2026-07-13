/**
 * Hermes filesystem + git adapters for the Workspace panel.
 * Maps `/api/fs/*` and `/api/git/status` to Marko shared DTOs.
 */
import { apiClient } from '@app/lib/api'
import { isImagePath } from '@app/lib/panels'
import type { WorkspaceGitStatus, WorkspaceTreeResponse } from '@hermes/shared'

export type WorkspaceFilePayload = {
  path: string
  content: string | null
  encoding?: string
  mime?: string
  contentBase64?: string
}

type HermesFsEntry = {
  name: string
  path: string
  isDirectory: boolean
}

type HermesFsListResponse = {
  entries: HermesFsEntry[]
  error?: string
}

type HermesReadTextResponse = {
  path: string
  text: string
  mimeType: string
  binary: boolean
  truncated?: boolean
}

type HermesReadDataUrlResponse = {
  dataUrl: string
}

export type HermesDefaultCwdResponse = {
  cwd: string
  branch: string
}

type HermesGitStatusFile = {
  path: string
}

type HermesGitStatusResponse = {
  branch: string | null
  changed: number
  files: HermesGitStatusFile[]
} | null

export function mapFsListToTree(
  rootPath: string,
  data: HermesFsListResponse,
): WorkspaceTreeResponse {
  if (data.error) {
    throw new Error(data.error)
  }
  return {
    path: rootPath,
    entries: data.entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.isDirectory ? 'dir' : 'file',
    })),
  }
}

function joinWorkspacePath(cwd: string, relativePath: string): string {
  const separator = cwd.includes('\\') ? '\\' : '/'
  const base = cwd.replace(/[/\\]+$/, '')
  const parts = relativePath.split(/[/\\]/).filter(Boolean)
  return parts.reduce((current, part) => `${current}${separator}${part}`, base)
}

export function mapGitStatusToDto(
  status: HermesGitStatusResponse,
  cwd: string,
): WorkspaceGitStatus {
  if (!status) {
    return { isRepo: false, dirty: false, files: [] }
  }
  return {
    isRepo: true,
    dirty: status.changed > 0,
    files: status.files.map((file) => joinWorkspacePath(cwd, file.path)),
  }
}

function parseDataUrl(dataUrl: string): { mime: string; contentBase64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid data URL')
  }
  return { mime: match[1], contentBase64: match[2] }
}

export async function fetchWorkspaceDefaultCwd(): Promise<HermesDefaultCwdResponse> {
  return apiClient.get<HermesDefaultCwdResponse>('/api/fs/default-cwd')
}

export async function fetchWorkspaceTree(path: string): Promise<WorkspaceTreeResponse> {
  const data = await apiClient.get<HermesFsListResponse>('/api/fs/list', { path })
  return mapFsListToTree(path, data)
}

export async function fetchWorkspaceGitStatus(cwd: string): Promise<WorkspaceGitStatus> {
  const status = await apiClient.get<HermesGitStatusResponse>('/api/git/status', { path: cwd })
  return mapGitStatusToDto(status, cwd)
}

export async function fetchWorkspaceFile(path: string): Promise<WorkspaceFilePayload> {
  if (isImagePath(path)) {
    const { dataUrl } = await apiClient.get<HermesReadDataUrlResponse>('/api/fs/read-data-url', {
      path,
    })
    const { mime, contentBase64 } = parseDataUrl(dataUrl)
    return { path, content: null, mime, contentBase64 }
  }

  const data = await apiClient.get<HermesReadTextResponse>('/api/fs/read-text', { path })
  return {
    path: data.path,
    content: data.text,
    mime: data.mimeType,
  }
}

export async function writeWorkspaceFile(path: string, content: string): Promise<void> {
  await apiClient.post('/api/fs/write-text', { path, content })
}
