type FieldCalloutProps = {
  /** Set for error callouts so the field's aria-describedby can point at it. */
  id?: string
  tone: 'info' | 'error'
  text: string
  placement: 'above' | 'below'
  /** Room to the page's right edge, so the bubble never spills into the scroller. */
  maxWidthPx: number
}

/**
 * A small bubble beside a field carrying its label or what it is missing.
 *
 * Fields on the page are otherwise anonymous boxes; the bubble gives the one
 * the signer is looking at a name, and gives a flagged field its reason.
 */
export default function FieldCallout({ id, tone, text, placement, maxWidthPx }: FieldCalloutProps) {
  return (
    <span
      id={id}
      className="field-callout"
      data-tone={tone}
      data-placement={placement}
      style={{ maxWidth: `${Math.max(48, Math.floor(maxWidthPx))}px` }}
    >
      {text}
    </span>
  )
}
