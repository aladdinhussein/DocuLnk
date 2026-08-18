import { useCallback, useEffect, useState } from 'react'
import { apiEnabled } from '../lib/apiClient'
import { getRemoteSignerPayload } from '../lib/remoteSigner'
import { readLocalTemplates } from '../lib/localTemplates'
import type { PublishedTemplate } from '../types'

export type SignerSession =
  | { status: 'loading' }
  | { status: 'ready'; template: PublishedTemplate }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

/**
 * Loads the signing payload.
 *
 * The previous version had no pending flag and no `.catch`, so a slow network
 * and a genuinely missing form both rendered the same dead end — telling people
 * their request had expired while it was still in flight.
 */
export function useSignerSession(templateId: string) {
  const [session, setSession] = useState<SignerSession>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setSession({ status: 'loading' })
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!apiEnabled) {
      const template = readLocalTemplates().find((item) => item.templateId === templateId) ?? null
      setSession(template?.pdfDataUrl ? { status: 'ready', template } : { status: 'not-found' })
      return
    }

    void getRemoteSignerPayload(templateId)
      .then((template) => {
        if (cancelled) return
        setSession({ status: 'ready', template: template as PublishedTemplate })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Unable to load this document.'
        // The API returns the same failure for "gone" and "unreachable", so
        // only an explicit unavailable message is treated as not-found.
        setSession(
          /unavailable|not found/i.test(message)
            ? { status: 'not-found' }
            : { status: 'error', message },
        )
      })

    return () => {
      cancelled = true
    }
  }, [templateId, attempt])

  return { session, retry }
}
