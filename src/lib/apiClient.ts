import type { StoredSigningRequest } from './requestStore'

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

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
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

export async function listRemoteRequests(): Promise<StoredSigningRequest[]> {
  return apiRequest<StoredSigningRequest[]>('/requests')
}

export async function createRemoteRequest(
  templateId: string,
  recipientEmail: string,
  expiresInDays = 7,
): Promise<StoredSigningRequest> {
  return apiRequest<StoredSigningRequest>('/requests', {
    method: 'POST',
    body: JSON.stringify({ templateId, recipientEmail, expiresInDays }),
  })
}

export async function revokeRemoteRequest(requestId: string): Promise<StoredSigningRequest> {
  return apiRequest<StoredSigningRequest>(`/requests/${requestId}/revoke`, { method: 'POST' })
}

export async function deleteRemoteRequest(requestId: string): Promise<void> {
  await apiRequest(`/requests/${requestId}`, { method: 'DELETE' })
}

export async function resendRemoteRequest(requestId: string): Promise<StoredSigningRequest> {
  return apiRequest<StoredSigningRequest>(`/requests/${requestId}/resend`, { method: 'POST' })
}

export async function extendRemoteRequest(requestId: string, days: number): Promise<StoredSigningRequest> {
  return apiRequest<StoredSigningRequest>(`/requests/${requestId}/extend`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

export async function downloadRemoteDocument(requestId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/documents/${requestId}`, { credentials: 'include' })
  if (!response.ok) throw new Error('Signed document unavailable')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${requestId}-signed.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function completeRemoteRequest(
  requestId: string,
  pdfBytes: Uint8Array,
  consentAccepted: boolean,
  consentVersion: string,
  consentAcceptedAt: string,
): Promise<StoredSigningRequest> {
  let binary = ''
  pdfBytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  const response = await fetch(`${apiBaseUrl}/public/requests/${requestId}/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      signedPdfBase64: btoa(binary),
      consentAccepted,
      consentVersion,
      consentAcceptedAt,
      signerUserAgent: navigator.userAgent,
    }),
  })
  if (!response.ok) {
    throw new Error('Unable to save the signed document')
  }
  return response.json() as Promise<StoredSigningRequest>
}

export async function getRemoteRequest(requestId: string): Promise<StoredSigningRequest> {
  return apiRequest<StoredSigningRequest>(`/public/requests/${requestId}`)
}
