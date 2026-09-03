import type { TemplateField } from '../types'
import { FIELD_VERB, isFieldFilled } from './signerFieldModel'
import { fieldBoxStyle } from '../pdf/fieldGeometry'

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

  return (
    <div
      className={`signer-field field-${field.type}`}
      data-state={state}
      style={fieldBoxStyle(field, zoom)}
    >

      {isImageField ? (
        <button
          type="button"
          className="sign-here-button"
          ref={registerRef}
          disabled={disabled}
          aria-label={`${verb} ${field.label}`}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? errorId : undefined}
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
          aria-label={field.group ? `${field.label}, ${field.group}` : field.label}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? errorId : undefined}
          onFocus={onFocus}
          onChange={(event) => onChange(String(event.target.checked))}
        />
      ) : (
        <input
          type={field.type === 'date' ? 'date' : 'text'}
          ref={registerRef}
          disabled={disabled}
          required={required}
          value={value ?? ''}
          aria-label={field.label}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? errorId : undefined}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}
