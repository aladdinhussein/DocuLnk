import { describe, expect, it } from 'vitest'
import { BASE_PAGE_WIDTH, clientPointToFieldUnits, fieldBoxStyle, pageScaleFor } from './fieldGeometry'

describe('pageScaleFor', () => {
  it('maps a US Letter page to its own scale', () => {
    expect(pageScaleFor(612)).toBeCloseTo(612 / BASE_PAGE_WIDTH)
  })

  it('gives a landscape page a different scale from a portrait one', () => {
    // The bug this guards: one scale taken from page 1 and applied to all pages.
    expect(pageScaleFor(792)).not.toBeCloseTo(pageScaleFor(612))
  })
})

describe('fieldBoxStyle', () => {
  it('scales the box by zoom', () => {
    const style = fieldBoxStyle({ x: 10, y: 20, width: 100, height: 30 }, 2)

    expect(style).toEqual({ left: '20px', top: '40px', width: '200px', height: '60px' })
  })

  it('is identity at zoom 1', () => {
    const style = fieldBoxStyle({ x: 10, y: 20, width: 100, height: 30 }, 1)

    expect(style).toEqual({ left: '10px', top: '20px', width: '100px', height: '30px' })
  })
})

describe('clientPointToFieldUnits', () => {
  it('removes the page offset and the zoom factor', () => {
    const point = clientPointToFieldUnits(220, 140, { left: 20, top: 40 }, 2)

    expect(point).toEqual({ x: 100, y: 50 })
  })
})
