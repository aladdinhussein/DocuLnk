import { describe, expect, it } from 'vitest'
import type { TemplateField } from '../types'
import {
  applySignerValue,
  incompleteRequiredFields,
  isEffectivelyRequired,
  isFieldApplicable,
  isFieldFilled,
  nextUnfilledField,
  requiredFieldsComplete,
  signerProgress,
  sortSignerFields,
} from './signerFieldModel'

function field(overrides: Partial<TemplateField> = {}): TemplateField {
  return {
    id: 'field-1',
    label: 'Field',
    type: 'text',
    required: true,
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    page: 1,
    ...overrides,
  }
}

describe('isFieldFilled', () => {
  it('treats an unticked checkbox as empty', () => {
    // The checkbox input stores String(checked), so unticking writes 'false'.
    // A truthiness test would report this as complete.
    expect(isFieldFilled(field({ type: 'checkbox' }), 'false')).toBe(false)
  })

  it('treats a ticked checkbox as filled', () => {
    expect(isFieldFilled(field({ type: 'checkbox' }), 'true')).toBe(true)
  })

  it('treats an untouched checkbox as empty', () => {
    expect(isFieldFilled(field({ type: 'checkbox' }), undefined)).toBe(false)
  })

  it('treats whitespace-only text as empty', () => {
    expect(isFieldFilled(field(), '   ')).toBe(false)
  })

  it('treats real text as filled', () => {
    expect(isFieldFilled(field(), 'Jane')).toBe(true)
  })

  it('treats a signature data url as filled', () => {
    expect(isFieldFilled(field({ type: 'signature' }), 'data:image/png;base64,AAA')).toBe(true)
  })
})

describe('sortSignerFields', () => {
  it('orders by page, then top to bottom, then left to right', () => {
    const fields = [
      field({ id: 'c', page: 2, y: 10, x: 10 }),
      field({ id: 'b', page: 1, y: 50, x: 10 }),
      field({ id: 'a', page: 1, y: 10, x: 10 }),
      field({ id: 'a2', page: 1, y: 10, x: 90 }),
    ]

    expect(sortSignerFields(fields).map((entry) => entry.id)).toEqual(['a', 'a2', 'b', 'c'])
  })

  it('does not mutate the input', () => {
    const fields = [field({ id: 'b', y: 50 }), field({ id: 'a', y: 10 })]
    sortSignerFields(fields)

    expect(fields.map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})

describe('incompleteRequiredFields', () => {
  it('reports every missing required field, not just the first', () => {
    const fields = [
      field({ id: 'a', y: 10 }),
      field({ id: 'b', y: 20 }),
      field({ id: 'c', y: 30, required: false }),
    ]

    expect(incompleteRequiredFields(fields, {}).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('ignores optional fields', () => {
    const fields = [field({ id: 'a' }), field({ id: 'b', required: false })]

    expect(incompleteRequiredFields(fields, { a: 'done' })).toEqual([])
  })

  it('catches a required checkbox that was ticked then unticked', () => {
    const fields = [field({ id: 'consent', type: 'checkbox' })]

    expect(incompleteRequiredFields(fields, { consent: 'false' }).map((entry) => entry.id))
      .toEqual(['consent'])
  })
})

describe('requiredFieldsComplete', () => {
  it('is false while a required checkbox is unticked', () => {
    expect(requiredFieldsComplete([field({ type: 'checkbox' })], { 'field-1': 'false' })).toBe(false)
  })

  it('is true once every required field is filled', () => {
    const fields = [field({ id: 'a' }), field({ id: 'b', type: 'checkbox' })]

    expect(requiredFieldsComplete(fields, { a: 'Jane', b: 'true' })).toBe(true)
  })
})

describe('signerProgress', () => {
  it('counts only required fields', () => {
    const fields = [
      field({ id: 'a' }),
      field({ id: 'b' }),
      field({ id: 'c', required: false }),
    ]

    expect(signerProgress(fields, { a: 'Jane', c: 'ignored' })).toEqual({ done: 1, total: 2 })
  })

  it('leaves out a field whose controlling checkbox is unticked', () => {
    const fields = [
      field({ id: 'has-spouse', type: 'checkbox', required: false }),
      field({ id: 'spouse-name', requiredWhenFieldId: 'has-spouse' }),
      field({ id: 'name' }),
    ]

    expect(signerProgress(fields, {})).toEqual({ done: 0, total: 1 })
    expect(signerProgress(fields, { 'has-spouse': 'true' })).toEqual({ done: 0, total: 2 })
  })

  it('counts a choice group once', () => {
    const fields = [
      field({ id: 'basic', type: 'checkbox', group: 'plan' }),
      field({ id: 'premium', type: 'checkbox', group: 'plan' }),
    ]

    expect(signerProgress(fields, {})).toEqual({ done: 0, total: 1 })
    expect(signerProgress(fields, { premium: 'true' })).toEqual({ done: 1, total: 1 })
  })
})

describe('isEffectivelyRequired', () => {
  const controller = field({ id: 'has-spouse', type: 'checkbox', required: false })
  const dependent = field({ id: 'spouse-name', requiredWhenFieldId: 'has-spouse' })
  const fields = [controller, dependent]

  it('is required only while the controlling checkbox is ticked', () => {
    expect(isEffectivelyRequired(dependent, fields, {})).toBe(false)
    expect(isEffectivelyRequired(dependent, fields, { 'has-spouse': 'false' })).toBe(false)
    expect(isEffectivelyRequired(dependent, fields, { 'has-spouse': 'true' })).toBe(true)
  })

  it('never makes an optional field required', () => {
    const optional = field({ id: 'note', required: false, requiredWhenFieldId: 'has-spouse' })
    expect(isEffectivelyRequired(optional, [controller, optional], { 'has-spouse': 'true' })).toBe(false)
  })

  it('falls back to always required when the controller is missing', () => {
    expect(isEffectivelyRequired(dependent, [dependent], {})).toBe(true)
  })

  it('falls back to always required when the controller is not a checkbox', () => {
    const textController = field({ id: 'has-spouse', type: 'text' })
    expect(isEffectivelyRequired(dependent, [textController, dependent], {})).toBe(true)
  })

  it('ignores a field that references itself', () => {
    const selfReferencing = field({ id: 'loop', type: 'checkbox', requiredWhenFieldId: 'loop' })
    expect(isEffectivelyRequired(selfReferencing, [selfReferencing], {})).toBe(true)
  })
})

describe('conditionally required fields', () => {
  const fields = [
    field({ id: 'has-spouse', type: 'checkbox', required: false, y: 10 }),
    field({ id: 'spouse-name', requiredWhenFieldId: 'has-spouse', y: 20 }),
  ]

  it('does not block finishing while the checkbox is unticked', () => {
    expect(requiredFieldsComplete(fields, {})).toBe(true)
  })

  it('blocks finishing once the checkbox is ticked and the field is empty', () => {
    expect(incompleteRequiredFields(fields, { 'has-spouse': 'true' }).map((entry) => entry.id))
      .toEqual(['spouse-name'])
  })

  it('releases the field again when the checkbox is unticked', () => {
    expect(requiredFieldsComplete(fields, { 'has-spouse': 'false' })).toBe(true)
  })
})

describe('checkbox groups', () => {
  const fields = [
    field({ id: 'basic', type: 'checkbox', group: 'plan', y: 10 }),
    field({ id: 'premium', type: 'checkbox', group: 'plan', y: 20 }),
    field({ id: 'newsletter', type: 'checkbox', required: false, y: 30 }),
  ]

  it('reports a missing group once, by its first option', () => {
    expect(incompleteRequiredFields(fields, {}).map((entry) => entry.id)).toEqual(['basic'])
  })

  it('is satisfied by any single option', () => {
    expect(requiredFieldsComplete(fields, { premium: 'true' })).toBe(true)
  })

  it('ticking one option clears the others in the group', () => {
    const values = applySignerValue(fields, { basic: 'true', newsletter: 'true' }, 'premium', 'true')

    expect(values).toEqual({ basic: 'false', newsletter: 'true', premium: 'true' })
  })

  it('unticking an option leaves the rest of the group alone', () => {
    const values = applySignerValue(fields, { basic: 'true' }, 'basic', 'false')

    expect(values).toEqual({ basic: 'false' })
  })

  it('does not treat ungrouped checkboxes as exclusive', () => {
    const values = applySignerValue(fields, { basic: 'true' }, 'newsletter', 'true')

    expect(values).toEqual({ basic: 'true', newsletter: 'true' })
  })

  it('skips the remaining options once a choice is made', () => {
    // 'newsletter' is optional, so nothing required is left.
    expect(nextUnfilledField(fields, {})?.id).toBe('basic')
    expect(nextUnfilledField(fields, { basic: 'true' })).toBeNull()
  })
})

describe('fields governed by a checkbox', () => {
  const fields = [
    field({ id: 'has-spouse', type: 'checkbox', required: false, y: 10 }),
    field({ id: 'spouse-name', requiredWhenFieldId: 'has-spouse', y: 20 }),
    field({ id: 'name', y: 30 }),
  ]

  it('are not applicable while the checkbox is unticked', () => {
    expect(isFieldApplicable(fields[1], fields, {})).toBe(false)
    expect(isFieldApplicable(fields[1], fields, { 'has-spouse': 'false' })).toBe(false)
    expect(isFieldApplicable(fields[1], fields, { 'has-spouse': 'true' })).toBe(true)
  })

  it('are always applicable when they have no controller', () => {
    expect(isFieldApplicable(fields[2], fields, {})).toBe(true)
    expect(isFieldApplicable(fields[0], fields, {})).toBe(true)
  })

  it('are skipped by Next while the checkbox is unticked', () => {
    expect(nextUnfilledField(fields, {})?.id).toBe('name')
    expect(nextUnfilledField(fields, { name: 'Jane' })).toBeNull()
  })

  it('are visited by Next once the checkbox is ticked', () => {
    expect(nextUnfilledField(fields, { 'has-spouse': 'true' })?.id).toBe('spouse-name')
  })

  it('lose their value when the checkbox is unticked', () => {
    const values = applySignerValue(
      fields,
      { 'has-spouse': 'true', 'spouse-name': 'Alex', name: 'Jane' },
      'has-spouse',
      'false',
    )

    expect(values).toEqual({ 'has-spouse': 'false', name: 'Jane' })
  })

  it('lose their value when another option in the controller group is chosen', () => {
    const grouped = [
      field({ id: 'married', type: 'checkbox', group: 'status', y: 10 }),
      field({ id: 'single', type: 'checkbox', group: 'status', y: 20 }),
      field({ id: 'spouse-name', requiredWhenFieldId: 'married', y: 30 }),
    ]
    const values = applySignerValue(grouped, { married: 'true', 'spouse-name': 'Alex' }, 'single', 'true')

    expect(values).toEqual({ married: 'false', single: 'true' })
  })

  it('keep their value while the checkbox stays ticked', () => {
    const values = applySignerValue(fields, { 'has-spouse': 'true', 'spouse-name': 'Alex' }, 'name', 'Jane')

    expect(values).toEqual({ 'has-spouse': 'true', 'spouse-name': 'Alex', name: 'Jane' })
  })
})
