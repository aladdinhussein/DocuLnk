import { describe, expect, it } from 'vitest'
import { FIELD_MIN_SIZE, clampFieldSize } from './fieldGeometry'

describe('clampFieldSize', () => {
  it('leaves an 18x18 checkbox alone', () => {
    // The reported bug: a single 48x24 floor inflated every saved checkbox,
    // breaking the alignment it had just been given.
    expect(clampFieldSize('checkbox', 18, 18)).toEqual({ width: 18, height: 18 })
  })

  it('allows a checkbox smaller than a text field could be', () => {
    expect(clampFieldSize('checkbox', 12, 12)).toEqual({ width: 12, height: 12 })
  })

  it('still floors a checkbox that has collapsed', () => {
    expect(clampFieldSize('checkbox', 2, 1)).toEqual({ width: 10, height: 10 })
  })

  it('keeps text fields wide enough to type in', () => {
    expect(clampFieldSize('text', 10, 4)).toEqual({ width: 48, height: 18 })
  })

  it('does not shrink a field that is already larger', () => {
    expect(clampFieldSize('text', 210, 26)).toEqual({ width: 210, height: 26 })
  })

  it('gives initials a narrower floor than a full signature', () => {
    expect(FIELD_MIN_SIZE.initials.width).toBeLessThan(FIELD_MIN_SIZE.signature.width)
  })

  it('covers every field type', () => {
    const types = ['text', 'date', 'signature', 'initials', 'checkbox'] as const

    for (const type of types) {
      expect(FIELD_MIN_SIZE[type]).toBeDefined()
      const clamped = clampFieldSize(type, 0, 0)
      expect(clamped.width).toBeGreaterThan(0)
      expect(clamped.height).toBeGreaterThan(0)
    }
  })
})
