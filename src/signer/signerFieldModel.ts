import type { FieldType, TemplateField } from '../types'

export type SignerValues = Record<string, string | undefined>

/** The action each field asks the signer to take, shown on its tag. */
export const FIELD_VERB: Record<FieldType, string> = {
  signature: 'Sign',
  initials: 'Initial',
  date: 'Date',
  text: 'Fill',
  checkbox: 'Check',
}

/**
 * A checkbox stores the literal strings 'true' / 'false', so a truthiness test
 * reports an unticked required box as complete. Every completeness check must
 * go through here.
 */
export function isFieldFilled(field: TemplateField, value: string | undefined): boolean {
  if (field.type === 'checkbox') {
    return value === 'true'
  }
  return typeof value === 'string' && value.trim() !== ''
}

/** Reading order: page, then top to bottom, then left to right. */
export function sortSignerFields(fields: TemplateField[]): TemplateField[] {
  return [...fields].sort(
    (first, second) => first.page - second.page || first.y - second.y || first.x - second.x,
  )
}

export function incompleteRequiredFields(
  fields: TemplateField[],
  values: SignerValues,
): TemplateField[] {
  return sortSignerFields(fields).filter(
    (field) => field.required && !isFieldFilled(field, values[field.id]),
  )
}

export function requiredFieldsComplete(fields: TemplateField[], values: SignerValues): boolean {
  return incompleteRequiredFields(fields, values).length === 0
}

export function signerProgress(
  fields: TemplateField[],
  values: SignerValues,
): { done: number; total: number } {
  const required = fields.filter((field) => field.required)
  return {
    done: required.filter((field) => isFieldFilled(field, values[field.id])).length,
    total: required.length,
  }
}

/**
 * The next field needing attention, in reading order.
 *
 * `visited` holds the fields navigation has already taken the signer to, so
 * repeated Next presses advance rather than sticking. Without it, a field the
 * signer was sent to by validation would be skipped on the next press — the
 * form would flag a missing field and then refuse to go back to it.
 */
export function nextUnfilledField(
  fields: TemplateField[],
  values: SignerValues,
  visited: ReadonlySet<string> = new Set(),
): TemplateField | null {
  const ordered = sortSignerFields(fields)
  const unfilled = ordered.filter((field) => !isFieldFilled(field, values[field.id]))
  return unfilled.find((field) => !visited.has(field.id)) ?? unfilled[0] ?? null
}

/**
 * Initials from a full name: first letter of the first and last words. Middle
 * names are dropped, matching how people usually initial a document.
 */
export function deriveInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Today in the YYYY-MM-DD form an <input type="date"> expects. */
export function todayAsInputValue(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Date fields hold an ISO value for the input, but the flattened PDF shows
 * MM/DD/YYYY. Anything unparseable passes through untouched.
 */
export function formatFieldValueForPdf(field: TemplateField, value: string): string {
  if (field.type !== 'date') return value

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}
