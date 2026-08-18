import { apiEnabled } from './apiClient'
export type RemoteSignerPayload = {
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

export async function getRemoteSignerPayload(templateId: string): Promise<RemoteSignerPayload['template']> {
  if (!apiEnabled) {
    throw new Error('Azure API is not configured.')
  }

  const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/public/forms/${templateId}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error('Signing request unavailable')
  }
  return response.json() as Promise<RemoteSignerPayload['template']>
}
