import { describe, expect, it } from 'vitest'
import type { TemplateField } from '../types'
import {
  incompleteRequiredFields,
  isFieldFilled,
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
})
