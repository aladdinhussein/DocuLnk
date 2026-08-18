import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSubmission,
  listSubmissions,
  saveSubmission,
  updateSubmission,
} from './requestStore'

const submission = {
  submissionId: 'submission-1',
  templateId: 'template-1',
  templateHash: 'abc123',
  createdAt: '2026-08-16T10:00:00.000Z',
  signedPdfDataUrl: 'data:application/pdf;base64,JVBERi0=',
  emailStatus: 'pending' as const,
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

describe('submissionStore', () => {
  it('saves and lists submissions', () => {
    saveSubmission(submission)

    expect(getSubmission(submission.submissionId)).toEqual(submission)
    expect(listSubmissions()).toEqual([submission])
  })

  it('updates email delivery state without losing the signed copy', () => {
    saveSubmission(submission)

    expect(updateSubmission(submission.submissionId, { emailStatus: 'failed', emailError: 'ACS unavailable' })?.emailStatus).toBe('failed')
    expect(getSubmission(submission.submissionId)?.signedPdfDataUrl).toBe(submission.signedPdfDataUrl)
  })
})
