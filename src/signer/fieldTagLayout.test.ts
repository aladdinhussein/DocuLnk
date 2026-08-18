import { describe, expect, it } from 'vitest'
import type { TemplateField } from '../types'
import { planBookmarks } from './fieldTagLayout'

function field(overrides: Partial<TemplateField>): TemplateField {
  return {
    id: 'f',
    label: 'Field',
    type: 'text',
    required: true,
    x: 100,
    y: 100,
    width: 150,
    height: 26,
    page: 1,
    ...overrides,
  }
}

describe('planBookmarks', () => {
  it('gives each row its own bookmark', () => {
    const fields = [
      field({ id: 'a', y: 100 }),
      field({ id: 'b', y: 200 }),
      field({ id: 'c', y: 300 }),
    ]

    expect(planBookmarks(fields, {}, '').map((b) => b.fieldIds)).toEqual([['a'], ['b'], ['c']])
  })

  it('merges two columns on the same line into one bookmark', () => {
    // The reported problem: tags beside each field collided and covered the
    // form. One tab per line keeps the rail from stacking on itself.
    const fields = [
      field({ id: 'left', x: 60, y: 100 }),
      field({ id: 'right', x: 300, y: 100 }),
    ]

    const bookmarks = planBookmarks(fields, {}, '')

    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].count).toBe(2)
    expect(bookmarks[0].fieldIds).toEqual(['left', 'right'])
  })

  it('centres the bookmark on its row', () => {
    const fields = [field({ id: 'a', y: 100, height: 26 })]

    expect(planBookmarks(fields, {}, '')[0].centreY).toBe(113)
  })

  it('spans the full row when field heights differ', () => {
    const fields = [
      field({ id: 'short', y: 100, height: 20 }),
      field({ id: 'tall', x: 300, y: 100, height: 40 }),
    ]

    // Row runs 100..140, so its centre is 120.
    expect(planBookmarks(fields, {}, '')[0].centreY).toBe(120)
  })

  it('keeps tightly stacked rows separate', () => {
    // A dense form: 26px rows on a 30px pitch, only 4px apart. These are
    // distinct rows and must not chain into one bookmark.
    const fields = Array.from({ length: 6 }, (_, index) =>
      field({ id: `r${index}`, y: 300 + index * 30, height: 26 }))

    expect(planBookmarks(fields, {}, '')).toHaveLength(6)
  })

  it('keeps rows separate when they do not overlap', () => {
    const fields = [
      field({ id: 'a', y: 100, height: 20 }),
      field({ id: 'b', y: 200, height: 20 }),
    ]

    expect(planBookmarks(fields, {}, '')).toHaveLength(2)
  })

  it('labels the row after the first field still needing attention', () => {
    const fields = [
      field({ id: 'done', x: 60, y: 100, label: 'Already done' }),
      field({ id: 'todo', x: 300, y: 100, label: 'Still needed' }),
    ]

    const bookmark = planBookmarks(fields, { done: 'filled in' }, '')[0]

    expect(bookmark.label).toBe('Still needed')
    expect(bookmark.targetFieldId).toBe('todo')
  })

  it('reports a row as filled only when every field in it is', () => {
    const fields = [
      field({ id: 'a', x: 60, y: 100 }),
      field({ id: 'b', x: 300, y: 100 }),
    ]

    expect(planBookmarks(fields, { a: 'x' }, '')[0].state).toBe('pending')
    expect(planBookmarks(fields, { a: 'x', b: 'y' }, '')[0].state).toBe('filled')
  })

  it('does not report a row filled on an unticked required checkbox', () => {
    const fields = [field({ id: 'box', type: 'checkbox', y: 100 })]

    expect(planBookmarks(fields, { box: 'false' }, '')[0].state).toBe('pending')
  })

  it('marks the row holding the active field', () => {
    const fields = [field({ id: 'a', y: 100 }), field({ id: 'b', y: 200 })]

    const states = planBookmarks(fields, {}, 'b').map((bookmark) => bookmark.state)

    expect(states).toEqual(['pending', 'active'])
  })

  it('lets invalid outrank active, so errors stay visible', () => {
    const fields = [field({ id: 'a', y: 100 })]

    expect(planBookmarks(fields, {}, 'a', new Set(['a']))[0].state).toBe('invalid')
  })

  it('returns nothing for a form with no fields', () => {
    expect(planBookmarks([], {}, '')).toEqual([])
  })
})
