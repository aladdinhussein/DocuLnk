type SignerUnavailableProps = {
  kind: 'not-found' | 'error'
  message?: string
  onRetry: () => void
}

export function SignerLoading() {
  return (
    <div className="app-shell signer-shell">
      <section className="signer-panel signer-skeleton" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your document</span>
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-page" />
      </section>
    </div>
  )
}

/**
 * A network failure and a genuinely missing form are different situations and
 * now say so — previously both, plus the entire loading period, rendered the
 * same "missing, expired" dead end.
 */
export function SignerUnavailable({ kind, message, onRetry }: SignerUnavailableProps) {
  const notFound = kind === 'not-found'

  return (
    <div className="app-shell centered-message">
      <h1>{notFound ? 'Signing request unavailable' : 'Could not load this document'}</h1>
      <p>
        {notFound
          ? 'This request is missing, expired, or no longer matches its template. Check with whoever sent you the link.'
          : message || 'Something went wrong reaching the server.'}
      </p>
      {!notFound && (
        <button type="button" className="primary-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
