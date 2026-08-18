import type { StoredSubmission } from './requestStore'
import { getAccessToken } from './auth'

export type RemoteTemplate = {
  templateId: string
  name: string
  pdfHash: string
  hashAlgorithm: string
  fields: unknown[]
  pdfDataUrl: string
  createdAt?: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const apiEnabled = Boolean(apiBaseUrl)

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!apiEnabled) {
    throw new Error('Azure API is not configured. Set VITE_API_BASE_URL to enable it.')
  }

  const token = await getAccessToken()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `API request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

export async function listRemoteTemplates(): Promise<RemoteTemplate[]> {
  const records = await apiRequest<Array<{
    templateId: string
    name: string
    pdfHash: string
    hashAlgorithm: string
    fieldConfig: string
    publishedAt: string
  }>>('/templates')

  return records.map((record) => ({
    templateId: record.templateId,
    name: record.name,
    pdfHash: record.pdfHash,
    hashAlgorithm: record.hashAlgorithm,
    fields: JSON.parse(record.fieldConfig),
    pdfDataUrl: '',
    createdAt: record.publishedAt,
  }))
}

export async function getRemoteTemplate(templateId: string): Promise<RemoteTemplate> {
  return apiRequest<RemoteTemplate>(`/templates/${templateId}`)
}

export async function updateRemoteTemplate(templateId: string, name: string, fields: unknown[]): Promise<void> {
  await apiRequest(`/templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, fields }),
  })
}

export async function deleteRemoteTemplate(templateId: string): Promise<void> {
  await apiRequest(`/templates/${templateId}`, { method: 'DELETE' })
}

export async function deleteRemoteSubmission(submissionId: string): Promise<void> {
  await apiRequest(`/submissions/${submissionId}`, { method: 'DELETE' })
}

export async function publishRemoteTemplate(file: File, template: {
  name: string
  pdfHash: string
  fields: unknown[]
}): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  await apiRequest('/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: template.name,
      pdfBase64: btoa(binary),
      pdfHash: template.pdfHash,
      fields: template.fields,
    }),
  })
}

export async function listRemoteSubmissions(): Promise<StoredSubmission[]> {
  return apiRequest<StoredSubmission[]>('/submissions')
}

export async function downloadRemoteDocument(submissionId: string, publicDownload = false): Promise<void> {
  const prefix = publicDownload ? '/public/submissions' : '/submissions'
  const token = publicDownload ? null : await getAccessToken()
  const response = await fetch(`${apiBaseUrl}${prefix}/${submissionId}/document`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) throw new Error('Signed document unavailable')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${submissionId}-signed.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function completeRemoteSubmission(
  templateId: string,
  pdfBytes: Uint8Array,
  consentAccepted: boolean,
  consentVersion: string,
  consentAcceptedAt: string,
  signerEmail?: string,
): Promise<StoredSubmission> {
  let binary = ''
  pdfBytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  const response = await fetch(`${apiBaseUrl}/public/forms/${templateId}/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      signedPdfBase64: btoa(binary),
      signerEmail: signerEmail || undefined,
      consentAccepted,
      consentVersion,
      consentAcceptedAt,
      signerUserAgent: navigator.userAgent,
    }),
  })
  if (!response.ok) {
    throw new Error('Unable to save the signed document')
  }
  return response.json() as Promise<StoredSubmission>
}

export async function getRemoteForm(templateId: string): Promise<RemoteTemplate> {
  return apiRequest<RemoteTemplate>(`/public/forms/${templateId}`)
}
