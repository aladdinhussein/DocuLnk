import { apiEnabled } from './apiClient'
import type { StoredSigningRequest } from './requestStore'

export type RemoteSignerPayload = {
  request: StoredSigningRequest
  template: {
    templateId: string
    name: string
    pdfHash: string
    hashAlgorithm: string
    pageCount?: number
    fields: unknown[]
    pdfDataUrl: string
  }
}

export async function getRemoteSignerPayload(requestId: string): Promise<RemoteSignerPayload> {
  if (!apiEnabled) {
    throw new Error('Azure API is not configured.')
  }

  const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/public/requests/${requestId}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error('Signing request unavailable')
  }
  return response.json() as Promise<RemoteSignerPayload>
}
