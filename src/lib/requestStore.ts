export type RequestStatus = 'sent' | 'viewed' | 'completed' | 'expired' | 'revoked'

export type StoredSigningRequest = {
  requestId: string
  templateId: string
  templateHash: string
  recipientEmail?: string
  status: RequestStatus
  createdAt: string
  expiresAt: string
  viewedAt?: string
  signedAt?: string
  signedPdfHash?: string
  signedPdfDataUrl?: string
  consentVersion?: string
  consentAcceptedAt?: string
  signerUserAgent?: string
}

const requestPrefix = 'doculnk-request-'

function requestKey(requestId: string): string {
  return `${requestPrefix}${requestId}`
}

export function saveSigningRequest(request: StoredSigningRequest): void {
  localStorage.setItem(requestKey(request.requestId), JSON.stringify(request))
}

export function getSigningRequest(requestId: string): StoredSigningRequest | null {
  const raw = localStorage.getItem(requestKey(requestId))
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as StoredSigningRequest
  } catch {
    return null
  }
}

export function listSigningRequests(): StoredSigningRequest[] {
  const requests: StoredSigningRequest[] = []

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(requestPrefix)) {
      continue
    }

    const requestId = key.slice(requestPrefix.length)
    const request = getSigningRequest(requestId)
    if (request) {
      requests.push(request)
    }
  }

  return requests.sort((first, second) => second.createdAt.localeCompare(first.createdAt))
}

export function updateSigningRequest(
  requestId: string,
  changes: Partial<StoredSigningRequest>,
): StoredSigningRequest | null {
  const request = getSigningRequest(requestId)
  if (!request) {
    return null
  }

  const updatedRequest = { ...request, ...changes }
  saveSigningRequest(updatedRequest)
  return updatedRequest
}

export function deleteSigningRequest(requestId: string): void {
  localStorage.removeItem(requestKey(requestId))
}

export function isRequestExpired(request: StoredSigningRequest, now = new Date()): boolean {
  return new Date(request.expiresAt) <= now
}
