import { useEffect, useRef, useState } from 'react'

type ConsentGateProps = {
  open: boolean
  consentVersion: string
  supportEmail: string
  email: string
  onEmailChange: (value: string) => void
  onAccept: () => void
  onReviewFirst: () => void
}

/**
 * The electronic-records disclosure, shown before signing rather than buried
 * below the document as it was previously.
 *
 * The document stays visible and scrollable behind this — "Review document
 * first" dismisses it without consenting. Blocking the document outright would
 * be more aggressive than the flows this mirrors, and arguably a compliance
 * regression: people are entitled to read what they are being asked to sign.
 */
export default function ConsentGate({
  open,
  consentVersion,
  supportEmail,
  email,
  onEmailChange,
  onAccept,
  onReviewFirst,
}: ConsentGateProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleCancel = (event: Event) => {
      event.preventDefault()
      onReviewFirst()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onReviewFirst])

  return (
    <dialog ref={dialogRef} className="consent-dialog" aria-labelledby="consent-title">
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <h2 id="consent-title">Electronic records notice</h2>
        <p>
          You may save or print this document and the completed signed copy. Your signature
          is associated with this request, its timestamp, and the email invitation used to
          access it. This notice is version {consentVersion}.
        </p>

        {/*
          The email lives here, at the identity-and-consent moment, rather than
          at the top of the form where it read as a login and explained nothing.
        */}
        <label className="signer-email-field">
          Your email (optional)
          <input
            type="email"
            value={email}
            autoComplete="email"
            placeholder="you@example.com"
            aria-describedby="consent-email-hint"
            onChange={(event) => onEmailChange(event.target.value)}
          />
          <span id="consent-email-hint" className="signer-email-hint">
            Shared with the sender so they know who signed. We do not send you a copy.
          </span>
        </label>

        <label className="consent-row">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            I authorize the use of my electronic signature and agree to the electronic records
            notice above.
          </span>
        </label>

        <div className="consent-links">
          <button type="button" className="quiet-button" onClick={() => window.print()}>
            Print or save notice
          </button>
          {supportEmail && (
            <a className="quiet-button" href={`mailto:${supportEmail}?subject=Paper copy request`}>
              Request a paper copy
            </a>
          )}
        </div>

        <footer className="consent-actions">
          <button type="button" className="quiet-button" onClick={onReviewFirst}>
            Review document first
          </button>
          <button type="button" className="primary-button" disabled={!accepted} onClick={onAccept}>
            Continue
          </button>
        </footer>
      </form>
    </dialog>
  )
}
