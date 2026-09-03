import { describe, expect, it } from 'vitest'
import type { TemplateField } from '../types'
import {
  FIELD_VERB,
  deriveInitials,
  formatFieldValueForPdf,
  nextUnfilledField,
  todayAsInputValue,
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

describe('deriveInitials', () => {
  it('takes the first and last name', () => {
    expect(deriveInitials('Jane Smith')).toBe('JS')
  })

  it('skips middle names', () => {
    expect(deriveInitials('Jane Alice Marie Smith')).toBe('JS')
  })

  it('handles a single name', () => {
    expect(deriveInitials('Prince')).toBe('P')
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(deriveInitials('   jane    smith  ')).toBe('JS')
  })

  it('returns empty for empty input', () => {
    expect(deriveInitials('   ')).toBe('')
  })
})

describe('formatFieldValueForPdf', () => {
  it('renders a date field as MM/DD/YYYY', () => {
    expect(formatFieldValueForPdf(field({ type: 'date' }), '2026-08-19')).toBe('08/19/2026')
  })

  it('passes an unparseable date through untouched', () => {
    expect(formatFieldValueForPdf(field({ type: 'date' }), 'sometime')).toBe('sometime')
  })

  it('leaves non-date fields alone', () => {
    expect(formatFieldValueForPdf(field(), '2026-08-19')).toBe('2026-08-19')
  })
})

describe('todayAsInputValue', () => {
  it('zero-pads month and day', () => {
    expect(todayAsInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses local date parts, not UTC', () => {
    // 23:30 local on the 19th must not roll forward to the 20th.
    expect(todayAsInputValue(new Date(2026, 7, 19, 23, 30))).toBe('2026-08-19')
  })
})

describe('nextUnfilledField', () => {
  const fields = [
    field({ id: 'a', y: 10 }),
    field({ id: 'b', y: 20 }),
    field({ id: 'c', y: 30 }),
  ]

  it('starts at the first unfilled field', () => {
    expect(nextUnfilledField(fields, {})?.id).toBe('a')
  })

  it('skips fields that are already filled', () => {
    expect(nextUnfilledField(fields, { a: 'x', b: 'y' })?.id).toBe('c')
  })

  it('advances past fields navigation has already visited', () => {
    expect(nextUnfilledField(fields, {}, new Set(['a']))?.id).toBe('b')
  })

  it('does not skip a field the signer was sent to but has not filled', () => {
    // Finish flags the first missing field and focuses it; pressing Next must
    // take the signer to that field rather than jumping over it.
    expect(nextUnfilledField(fields, {}, new Set())?.id).toBe('a')
  })

  it('wraps back to the first gap once everything has been visited', () => {
    const visited = new Set(['a', 'b', 'c'])

    expect(nextUnfilledField(fields, { b: 'y' }, visited)?.id).toBe('a')
  })

  it('does not skip an unticked required checkbox', () => {
    const withBox = [field({ id: 'a', y: 10 }), field({ id: 'box', type: 'checkbox', y: 20 })]

    expect(nextUnfilledField(withBox, { a: 'x', box: 'false' })?.id).toBe('box')
  })

  it('returns null when everything is filled', () => {
    expect(nextUnfilledField(fields, { a: 'x', b: 'y', c: 'z' })).toBeNull()
  })

  it('steps over optional fields', () => {
    const withOptional = [
      field({ id: 'a', y: 10 }),
      field({ id: 'note', y: 20, required: false }),
      field({ id: 'c', y: 30 }),
    ]

    expect(nextUnfilledField(withOptional, { a: 'x' })?.id).toBe('c')
    expect(nextUnfilledField(withOptional, { a: 'x', c: 'z' })).toBeNull()
  })
})

describe('FIELD_VERB', () => {
  it('names the action for every field type', () => {
    expect(FIELD_VERB).toEqual({
      signature: 'Sign',
      initials: 'Initial',
      date: 'Date',
      text: 'Fill',
      checkbox: 'Check',
    })
  })
})
