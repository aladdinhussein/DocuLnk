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

/** Checkboxes that share this field's group, the field itself included. */
export function groupMembers(field: TemplateField, fields: TemplateField[]): TemplateField[] {
  if (field.type !== 'checkbox' || !field.group) return [field]
  return fields.filter((entry) => entry.type === 'checkbox' && entry.group === field.group)
}

/**
 * Whether the field's requirement is met. A grouped checkbox is satisfied by
 * any member of its group being ticked, since the group is one choice.
 */
export function isRequirementSatisfied(
  field: TemplateField,
  fields: TemplateField[],
  values: SignerValues,
): boolean {
  return groupMembers(field, fields).some((member) => isFieldFilled(member, values[member.id]))
}

/**
 * Whether the field is required right now, given what the signer has filled.
 *
 * A condition pointing at something that is not a checkbox on this template
 * (removed, retyped, or the field itself) is ignored rather than honoured, so a
 * broken reference can never silently make a required field optional.
 */
export function isEffectivelyRequired(
  field: TemplateField,
  fields: TemplateField[],
  values: SignerValues,
): boolean {
  if (!field.required) return false
  if (!field.requiredWhenFieldId) return true

  const controller = fields.find(
    (entry) =>
      entry.id === field.requiredWhenFieldId && entry.type === 'checkbox' && entry.id !== field.id,
  )
  if (!controller) return true
  return values[controller.id] === 'true'
}

/**
 * Required fields still to do, in reading order, one entry per group so a
 * missing choice is reported once rather than once per option.
 */
export function incompleteRequiredFields(
  fields: TemplateField[],
  values: SignerValues,
): TemplateField[] {
  const seenGroups = new Set<string>()
  return sortSignerFields(fields).filter((field) => {
    if (!isEffectivelyRequired(field, fields, values)) return false
    if (isRequirementSatisfied(field, fields, values)) return false
    if (field.type === 'checkbox' && field.group) {
      if (seenGroups.has(field.group)) return false
      seenGroups.add(field.group)
    }
    return true
  })
}

export function requiredFieldsComplete(fields: TemplateField[], values: SignerValues): boolean {
  return incompleteRequiredFields(fields, values).length === 0
}

/**
 * Progress over what is currently required. A group counts once, and a field
 * whose controlling checkbox is unticked is left out of the total entirely.
 */
export function signerProgress(
  fields: TemplateField[],
  values: SignerValues,
): { done: number; total: number } {
  const seenGroups = new Set<string>()
  const units = fields.filter((field) => {
    if (!isEffectivelyRequired(field, fields, values)) return false
    if (field.type === 'checkbox' && field.group) {
      if (seenGroups.has(field.group)) return false
      seenGroups.add(field.group)
    }
    return true
  })
  return {
    done: units.filter((field) => isRequirementSatisfied(field, fields, values)).length,
    total: units.length,
  }
}

/**
 * The signer's values after setting one field. Ticking a grouped checkbox
 * clears the rest of its group, so the group behaves as a single choice.
 */
export function applySignerValue(
  fields: TemplateField[],
  values: SignerValues,
  fieldId: string,
  value: string,
): SignerValues {
  const next: SignerValues = { ...values, [fieldId]: value }
  const field = fields.find((entry) => entry.id === fieldId)
  if (!field || field.type !== 'checkbox' || !field.group || value !== 'true') return next

  for (const member of groupMembers(field, fields)) {
    if (member.id !== fieldId && next[member.id] === 'true') next[member.id] = 'false'
  }
  return next
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
  // A grouped checkbox is done once any option in its group is chosen; Next
  // should not march the signer through the options they decided against.
  const unfilled = ordered.filter((field) => !isRequirementSatisfied(field, fields, values))
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
