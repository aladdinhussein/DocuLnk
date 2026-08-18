import { describe, expect, it } from 'vitest'
import { checkMarkGeometry } from './flattenSignedPdf'

/** Where the two strokes cross — the visual centre of the mark. */
function crossingPoint(mark: ReturnType<typeof checkMarkGeometry>) {
  const [a, b] = mark.segments
  return {
    x: (a.from.x + a.to.x + b.from.x + b.to.x) / 4,
    y: (a.from.y + a.to.y + b.from.y + b.to.y) / 4,
  }
}

describe('checkMarkGeometry', () => {
  it('centres the mark in a square box', () => {
    // The bug it replaces: the glyph was drawn at the box's bottom-left corner.
    const mark = checkMarkGeometry(100, 200, 20, 20)

    expect(crossingPoint(mark)).toEqual({ x: 110, y: 210 })
  })

  it('centres the mark in a wide box too', () => {
    const mark = checkMarkGeometry(0, 0, 200, 26)

    expect(crossingPoint(mark)).toEqual({ x: 100, y: 13 })
  })

  it('keeps the mark square in a non-square box', () => {
    const [diagonal] = checkMarkGeometry(0, 0, 200, 26).segments
    const width = Math.abs(diagonal.to.x - diagonal.from.x)
    const height = Math.abs(diagonal.to.y - diagonal.from.y)

    expect(width).toBeCloseTo(height)
  })

  it('never spills outside the box', () => {
    const mark = checkMarkGeometry(10, 10, 40, 24)

    for (const segment of mark.segments) {
      for (const point of [segment.from, segment.to]) {
        expect(point.x).toBeGreaterThanOrEqual(10)
        expect(point.x).toBeLessThanOrEqual(50)
        expect(point.y).toBeGreaterThanOrEqual(10)
        expect(point.y).toBeLessThanOrEqual(34)
      }
    }
  })

  it('draws two crossing strokes, not one', () => {
    const [a, b] = checkMarkGeometry(0, 0, 20, 20).segments
    const slopeA = (a.to.y - a.from.y) / (a.to.x - a.from.x)
    const slopeB = (b.to.y - b.from.y) / (b.to.x - b.from.x)

    expect(slopeA).toBeCloseTo(1)
    expect(slopeB).toBeCloseTo(-1)
  })

  it('scales the mark with the box', () => {
    const small = checkMarkGeometry(0, 0, 10, 10)
    const large = checkMarkGeometry(0, 0, 40, 40)
    const span = (mark: ReturnType<typeof checkMarkGeometry>) =>
      Math.abs(mark.segments[0].to.x - mark.segments[0].from.x)

    expect(span(large)).toBeCloseTo(span(small) * 4)
    expect(large.thickness).toBeGreaterThan(small.thickness)
  })

  it('keeps a usable stroke thickness on a tiny box', () => {
    expect(checkMarkGeometry(0, 0, 4, 4).thickness).toBeGreaterThanOrEqual(0.75)
  })
})
