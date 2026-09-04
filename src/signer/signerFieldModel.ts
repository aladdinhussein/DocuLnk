import type { FieldType, TemplateField } from '../types'

export type SignerValues = Record<string, string | undefined>

/** The action each field asks the signer to take, shown on its tag. */
export const FIELD_VERB: Record<FieldType, string> = {
  signature: 'Sign',
  initials: 'Initial',
  date: 'Date',
  text: 'Fill',
  phone: 'Enter',
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
 * The checkbox that governs this field, if it has one.
 *
 * A condition pointing at something that is not a checkbox on this template
 * (removed, retyped, or the field itself) is ignored rather than honoured, so a
 * broken reference can never silently make a required field optional.
 */
export function controllerOf(field: TemplateField, fields: TemplateField[]): TemplateField | null {
  if (!field.requiredWhenFieldId) return null
  return (
    fields.find(
      (entry) =>
        entry.id === field.requiredWhenFieldId && entry.type === 'checkbox' && entry.id !== field.id,
    ) ?? null
  )
}

/**
 * Whether the field exists for the signer right now. A field governed by a
 * checkbox is only part of the form while that checkbox is ticked; otherwise
 * it is not fillable, not navigable, and not printed.
 */
export function isFieldApplicable(
  field: TemplateField,
  fields: TemplateField[],
  values: SignerValues,
): boolean {
  const controller = controllerOf(field, fields)
  return controller === null || values[controller.id] === 'true'
}

/** Whether the field is required right now, given what the signer has filled. */
export function isEffectivelyRequired(
  field: TemplateField,
  fields: TemplateField[],
  values: SignerValues,
): boolean {
  return field.required && isFieldApplicable(field, fields, values)
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
 *
 * Any field whose controlling checkbox ends up unticked is wiped as well: once
 * the signer says the section does not apply, whatever they typed into it
 * before must not linger, or it would be flattened into the signed PDF.
 */
export function applySignerValue(
  fields: TemplateField[],
  values: SignerValues,
  fieldId: string,
  value: string,
): SignerValues {
  const next: SignerValues = { ...values, [fieldId]: value }
  const field = fields.find((entry) => entry.id === fieldId)
  if (!field || field.type !== 'checkbox') return next

  if (field.group && value === 'true') {
    for (const member of groupMembers(field, fields)) {
      if (member.id !== fieldId && next[member.id] === 'true') next[member.id] = 'false'
    }
  }

  for (const dependent of fields) {
    if (dependent.id in next && !isFieldApplicable(dependent, fields, next)) delete next[dependent.id]
  }
  return next
}

/**
 * The next required field still to do, in reading order.
 *
 * Only what is required right now counts: optional fields and fields whose
 * controlling checkbox is unticked are stepped over as if they were not there.
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
  // A grouped checkbox is done once any option in its group is chosen; Next
  // should not march the signer through the options they decided against.
  const outstanding = sortSignerFields(fields).filter(
    (field) =>
      isEffectivelyRequired(field, fields, values) && !isRequirementSatisfied(field, fields, values),
  )
  // Likewise a group the signer has already been shown counts as visited as a
  // whole: being walked from Basic to Premium to Deluxe is not progress.
  const groupVisited = (field: TemplateField) =>
    groupMembers(field, fields).some((member) => visited.has(member.id))
  return outstanding.find((field) => !groupVisited(field)) ?? outstanding[0] ?? null
}

/**
 * Flagged ids widened to whole choice groups. Validation reports a missing
 * group once, by its first option, but on the page every option in the group
 * is the thing left undone, so they are all outlined together.
 */
export function expandToGroups(ids: ReadonlySet<string>, fields: TemplateField[]): Set<string> {
  const expanded = new Set(ids)
  for (const field of fields) {
    if (!ids.has(field.id)) continue
    for (const member of groupMembers(field, fields)) expanded.add(member.id)
  }
  return expanded
}

export type ApplicabilityDelta = {
  /** Fields that were not part of the form before and are now, in reading order. */
  nowApply: TemplateField[]
  /** Fields that were part of the form before and no longer are, in reading order. */
  noLongerApply: TemplateField[]
}

/**
 * Which fields ticking or unticking a controlling checkbox brought in or took
 * out. The signer sees greyed boxes wake up or fade with no other cue, so the
 * screen announces this difference.
 */
export function applicabilityDelta(
  fields: TemplateField[],
  before: SignerValues,
  after: SignerValues,
): ApplicabilityDelta {
  const nowApply: TemplateField[] = []
  const noLongerApply: TemplateField[] = []
  for (const field of sortSignerFields(fields)) {
    const was = isFieldApplicable(field, fields, before)
    const is = isFieldApplicable(field, fields, after)
    if (!was && is) nowApply.push(field)
    if (was && !is) noLongerApply.push(field)
  }
  return { nowApply, noLongerApply }
}

/** Human sentence for an applicability change, or null when nothing changed. */
export function applicabilityNotice(delta: ApplicabilityDelta): string | null {
  const parts: string[] = []
  const added = delta.nowApply.length
  const removed = delta.noLongerApply.length
  if (added > 0) parts.push(`${added} more ${added === 1 ? 'field' : 'fields'} now ${added === 1 ? 'applies' : 'apply'}.`)
  if (removed > 0) {
    parts.push(`${removed} ${removed === 1 ? 'field' : 'fields'} no longer ${removed === 1 ? 'applies' : 'apply'}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** What a flagged field is asking for, shown in the bubble beside it. */
export function fieldErrorText(field: TemplateField): string {
  switch (field.type) {
    case 'checkbox':
      return field.group ? 'Choose one option' : 'Check this box'
    case 'signature':
      return 'Sign here'
    case 'initials':
      return 'Initial here'
    default:
      return 'Required'
  }
}

/**
 * Label for the button that walks the signer through the form. It carries the
 * count so the signer knows how much is left before they press it.
 */
export function walkerLabel(progress: { done: number; total: number }, started: boolean): string {
  if (progress.total === 0 || progress.done >= progress.total) return 'Finish'
  if (!started) return `Start · ${progress.total} ${progress.total === 1 ? 'field' : 'fields'}`
  const left = progress.total - progress.done
  return `Next field · ${left} left`
}

/** Space-joined id list for aria-describedby, or undefined when there is none. */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const present = ids.filter((id): id is string => typeof id === 'string' && id !== '')
  return present.length > 0 ? present.join(' ') : undefined
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
