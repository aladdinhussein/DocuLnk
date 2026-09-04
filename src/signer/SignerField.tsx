import type { TemplateField } from '../types'
import { FIELD_VERB, describedBy, fieldErrorText, isFieldFilled } from './signerFieldModel'
import { calloutPlacement, fieldBoxStyle } from '../pdf/fieldGeometry'
import FieldCallout from './FieldCallout'

export type FieldState = 'pending' | 'active' | 'filled' | 'invalid' | 'inactive'

type SignerFieldProps = {
  field: TemplateField
  value: string | undefined
  zoom: number
  isActive: boolean
  isInvalid: boolean
  /** Whether the field is required right now, conditions already evaluated. */
  required: boolean
  /**
   * Whether the field is part of the form right now. A field whose controlling
   * checkbox is unticked is shown greyed and cannot be filled.
   */
  applicable: boolean
  /** Label of the checkbox that governs this field, when it has one. */
  controllerLabel?: string
  /** Rendered page width, so callouts can stop at the page's right edge. */
  pageWidthPx: number
  locked: boolean
  hasSignature: boolean
  registerRef: (element: HTMLInputElement | HTMLButtonElement | null) => void
  onFocus: () => void
  onChange: (value: string) => void
  onRequestSignature: () => void
}

function fieldState(
  filled: boolean,
  isActive: boolean,
  isInvalid: boolean,
  applicable: boolean,
): FieldState {
  if (!applicable) return 'inactive'
  if (isInvalid) return 'invalid'
  if (isActive) return 'active'
  return filled ? 'filled' : 'pending'
}

export default function SignerField({
  field,
  value,
  zoom,
  isActive,
  isInvalid,
  required,
  applicable,
  controllerLabel,
  pageWidthPx,
  locked,
  hasSignature,
  registerRef,
  onFocus,
  onChange,
  onRequestSignature,
}: SignerFieldProps) {
  const filled = isFieldFilled(field, value)
  const state = fieldState(filled, isActive, isInvalid, applicable)
  const disabled = locked || !applicable
  const verb = FIELD_VERB[field.type]
  const isImageField = field.type === 'signature' || field.type === 'initials'
  const errorId = `${field.id}-error`
  const hintId = `${field.id}-hint`
  const requirement = required ? 'required' : 'optional'

  // Only rendered while inapplicable, so the reason travels with the grey box.
  const inactiveHint = !applicable
    ? `Applies only if '${controllerLabel ?? 'the related box'}' is checked`
    : undefined
  const title = inactiveHint ?? field.label
  const describe = describedBy(isInvalid && errorId, !applicable && hintId)

  const placement = calloutPlacement(field.y * zoom)
  const calloutWidth = pageWidthPx - field.x * zoom

  return (
    <div
      className={`signer-field field-${field.type}`}
      data-state={state}
      data-required={required}
      data-active={isActive || undefined}
      style={fieldBoxStyle(field, zoom)}
    >
      {isImageField ? (
        <button
          type="button"
          className="sign-here-button"
          ref={registerRef}
          disabled={disabled}
          title={title}
          aria-label={`${verb} ${field.label}, ${requirement}`}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describe}
          onFocus={onFocus}
          onClick={onRequestSignature}
        >
          {value?.startsWith('data:image/png') ? (
            <img src={value} alt={`${field.label} signed`} />
          ) : (
            <span>{hasSignature ? verb : `${verb} here`}</span>
          )}
        </button>
      ) : field.type === 'checkbox' ? (
        <input
          type="checkbox"
          ref={registerRef}
          disabled={disabled}
          checked={value === 'true'}
          name={field.group || undefined}
          title={title}
          aria-label={field.group ? `${field.label}, ${field.group}` : field.label}
          aria-required={required || undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describe}
          onFocus={onFocus}
          onChange={(event) => onChange(String(event.target.checked))}
        />
      ) : (
        <input
          type={field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text'}
          inputMode={field.type === 'phone' ? 'tel' : undefined}
          autoComplete={field.type === 'phone' ? 'tel' : undefined}
          ref={registerRef}
          disabled={disabled}
          required={required}
          value={value ?? ''}
          // A date input ignores placeholder, so its name rides on the callout.
          placeholder={field.type === 'text' || field.type === 'phone' ? field.label : undefined}
          title={title}
          aria-label={field.label}
          aria-required={required || undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describe}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {inactiveHint && (
        <span id={hintId} className="sr-only">{inactiveHint}</span>
      )}

      {/*
        The error bubble stays in the DOM for every flagged field so the
        aria-describedby above resolves; CSS only reveals it on the field that
        is focused or hovered, so a dense form does not sprout a pile of red.
      */}
      {state === 'invalid' ? (
        <FieldCallout
          id={errorId}
          tone="error"
          text={fieldErrorText(field)}
          placement={placement}
          maxWidthPx={calloutWidth}
        />
      ) : state === 'active' ? (
        <FieldCallout
          tone="info"
          text={`${field.label} · ${required ? 'Required' : 'Optional'}`}
          placement={placement}
          maxWidthPx={calloutWidth}
        />
      ) : null}
    </div>
  )
}
