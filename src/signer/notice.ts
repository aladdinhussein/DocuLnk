/** A message shown in the signer's sticky action bar. */
export type Notice = {
  tone: 'info' | 'error' | 'success'
  text: string
  /** Clears itself after a few seconds, for changes the signer caused themselves. */
  transient?: boolean
} | null

/** How long a transient notice stays on screen. */
export const TRANSIENT_NOTICE_MS = 6000
