import { useEffect, useRef, useState } from 'react'
import { useSignaturePad } from './useSignaturePad'
import {
  DEFAULT_SIGNATURE_STYLE,
  SIGNATURE_STYLES,
  renderTextToPng,
  signatureStyleById,
} from './signatureImage'
import { deriveInitials } from './signerFieldModel'

export type AdoptedSignature = {
  fullName: string
  initials: string
  mode: 'draw' | 'type'
  styleId: string
  signaturePng: string
  initialsPng: string
  adoptedAt: string
}

type AdoptSignatureDialogProps = {
  open: boolean
  existing: AdoptedSignature | null
  onAdopt: (signature: AdoptedSignature) => void
  onCancel: () => void
}

export default function AdoptSignatureDialog({
  open,
  existing,
  onAdopt,
  onCancel,
}: AdoptSignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [fullName, setFullName] = useState(existing?.fullName ?? '')
  const [initials, setInitials] = useState(existing?.initials ?? '')
  const [initialsEdited, setInitialsEdited] = useState(Boolean(existing?.initials))
  const [mode, setMode] = useState<'draw' | 'type'>(existing?.mode ?? 'type')
  const [styleId, setStyleId] = useState(existing?.styleId ?? DEFAULT_SIGNATURE_STYLE)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const signaturePad = useSignaturePad()
  const initialsPad = useSignaturePad()

  // showModal() brings a focus trap and Escape handling that the old hand-rolled
  // backdrop never had.
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
      onCancel()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onCancel])

  const handleNameChange = (value: string) => {
    setFullName(value)
    // Track the name until the signer takes over the initials themselves.
    if (!initialsEdited) setInitials(deriveInitials(value))
  }

  const adopt = async () => {
    setMessage('')
    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setMessage('Enter your full name.')
      return
    }

    setBusy(true)
    try {
      const style = signatureStyleById(styleId)
      const signaturePng = mode === 'draw'
        ? signaturePad.toPng()
        : await renderTextToPng(trimmedName, style)

      if (!signaturePng) {
        setMessage(mode === 'draw' ? 'Draw your signature first.' : 'Enter your full name.')
        return
      }

      const initialsText = initials.trim() || deriveInitials(trimmedName)
      const initialsPng = mode === 'draw'
        ? (initialsPad.toPng() || signaturePng)
        : await renderTextToPng(initialsText, style)

      onAdopt({
        fullName: trimmedName,
        initials: initialsText,
        mode,
        styleId,
        signaturePng,
        initialsPng: initialsPng || signaturePng,
        adoptedAt: new Date().toISOString(),
      })
    } finally {
      setBusy(false)
    }
  }

  const previewStyle = signatureStyleById(styleId)

  return (
    <dialog ref={dialogRef} className="adopt-dialog" aria-labelledby="adopt-title">
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <header className="adopt-header">
          <h2 id="adopt-title">Adopt your signature</h2>
          <p>Confirm your name and style. This is applied wherever the document asks you to sign.</p>
        </header>

        <div className="adopt-identity">
          <label>
            Full name
            <input
              value={fullName}
              autoFocus
              placeholder="Jane Smith"
              onChange={(event) => handleNameChange(event.target.value)}
            />
          </label>
          <label className="adopt-initials">
            Initials
            <input
              value={initials}
              placeholder="JS"
              maxLength={6}
              onChange={(event) => {
                setInitialsEdited(true)
                setInitials(event.target.value)
              }}
            />
          </label>
        </div>

        <div className="signature-mode-tabs" role="tablist" aria-label="Signature method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'type'}
            className={mode === 'type' ? 'active' : ''}
            onClick={() => setMode('type')}
          >
            Type
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'draw'}
            className={mode === 'draw' ? 'active' : ''}
            onClick={() => setMode('draw')}
          >
            Draw
          </button>
        </div>

        {mode === 'type' ? (
          <div className="style-picker" role="radiogroup" aria-label="Signature style">
            {SIGNATURE_STYLES.map((style) => (
              <button
                type="button"
                key={style.id}
                role="radio"
                aria-checked={styleId === style.id}
                className={`style-option ${styleId === style.id ? 'selected' : ''}`}
                onClick={() => setStyleId(style.id)}
              >
                <span className="style-name">{style.name}</span>
                <span className="style-sample" style={{ fontFamily: style.fontFamily }}>
                  {fullName.trim() || 'Your signature'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="draw-pads">
            <div className="draw-pad">
              <div className="draw-pad-head">
                <span>Signature</span>
                <span className="draw-pad-actions">
                  <button type="button" className="quiet-button" onClick={signaturePad.undo}>Undo</button>
                  <button type="button" className="quiet-button" onClick={signaturePad.clear}>Clear</button>
                </span>
              </div>
              <canvas
                ref={signaturePad.canvasRef}
                className="signature-canvas"
                aria-label="Draw your signature"
                {...signaturePad.handlers}
              />
            </div>
            <div className="draw-pad draw-pad-initials">
              <div className="draw-pad-head">
                <span>Initials</span>
                <span className="draw-pad-actions">
                  <button type="button" className="quiet-button" onClick={initialsPad.clear}>Clear</button>
                </span>
              </div>
              <canvas
                ref={initialsPad.canvasRef}
                className="signature-canvas"
                aria-label="Draw your initials"
                {...initialsPad.handlers}
              />
            </div>
          </div>
        )}

        {mode === 'type' && (
          <div className="adopt-preview" style={{ fontFamily: previewStyle.fontFamily }}>
            {fullName.trim() || 'Your signature'}
          </div>
        )}

        <p className="adopt-legal">
          By adopting this signature you agree it is the electronic representation of your
          signature for all purposes when used on documents, including legally binding contracts.
        </p>

        {message && <p className="adopt-message" role="alert">{message}</p>}

        <footer className="adopt-actions">
          <button type="button" className="quiet-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void adopt()}>
            {busy ? 'Adopting...' : 'Adopt and sign'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
