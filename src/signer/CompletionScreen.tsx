type CompletionScreenProps = {
  documentName: string
  emailFailed: boolean
  onDownload: () => void
}

/**
 * Shown after the signed document has been persisted.
 *
 * The download is deliberately a button here rather than an automatic click
 * during submission: previously the file was pushed to the signer's disk before
 * the server had accepted it, so a failed save left them holding a copy of a
 * document nobody had recorded.
 */
export default function CompletionScreen({
  documentName,
  emailFailed,
  onDownload,
}: CompletionScreenProps) {
  return (
    <div className="app-shell signer-shell">
      <section className="signer-panel completion-panel" aria-live="polite">
        <div className="signed-complete-mark" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle className="signed-complete-ring" cx="40" cy="40" r="36" />
            <circle className="signed-complete-circle" cx="40" cy="40" r="36" />
            <path className="signed-complete-check" d="M24 41l11 11 21-23" />
          </svg>
        </div>
        <h1>Your document has been signed</h1>
        <p className="completion-name">{documentName}</p>
        <p className="completion-note">
          {emailFailed
            ? 'Your signed copy is saved. The notification email could not be delivered, but the stored copy is safe.'
            : 'Your signed copy is saved and the sender has been notified.'}
        </p>
        <button type="button" className="primary-button" onClick={onDownload}>
          Download signed copy
        </button>
        <p className="completion-hint">You can close this window when you are done.</p>
      </section>
    </div>
  )
}
