import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSigningRequest,
  isRequestExpired,
  listSigningRequests,
  saveSigningRequest,
  updateSigningRequest,
} from './requestStore'

const request = {
  requestId: 'request-1',
  templateId: 'template-1',
  templateHash: 'abc123',
  status: 'sent' as const,
  createdAt: '2026-08-16T10:00:00.000Z',
  expiresAt: '2026-08-23T10:00:00.000Z',
}

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size
      },
    },
  })
})

describe('requestStore', () => {
  it('saves and lists signing requests', () => {
    saveSigningRequest(request)

    expect(getSigningRequest(request.requestId)).toEqual(request)
    expect(listSigningRequests()).toEqual([request])
  })

  it('updates request status', () => {
    saveSigningRequest(request)

    expect(updateSigningRequest(request.requestId, { status: 'revoked' })?.status).toBe('revoked')
  })

  it('detects expired requests', () => {
    expect(isRequestExpired(request, new Date('2026-08-24T10:00:00.000Z'))).toBe(true)
  })
})
