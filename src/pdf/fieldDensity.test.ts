import { describe, expect, it } from 'vitest'
import {
  BASE_PAGE_WIDTH,
  MIN_COMFORTABLE_FIELD_PX,
  MIN_USABLE_FIELD_PX,
  smallestFieldHeight,
  usableFitZoom,
  zoomForFieldHeight,
} from './fieldGeometry'

describe('zoomForFieldHeight', () => {
  it('finds the zoom that makes a short field comfortable', () => {
    // A 26px row needs ~1.08x to reach 28px.
    expect(zoomForFieldHeight(26, MIN_COMFORTABLE_FIELD_PX)).toBeCloseTo(28 / 26)
  })

  it('returns a zoom that actually reaches the target', () => {
    const zoom = zoomForFieldHeight(26, MIN_COMFORTABLE_FIELD_PX)

    expect(26 * zoom).toBeGreaterThanOrEqual(MIN_COMFORTABLE_FIELD_PX)
  })

  it('does not divide by zero on a degenerate field', () => {
    expect(zoomForFieldHeight(0, MIN_COMFORTABLE_FIELD_PX)).toBe(1)
  })
})

describe('smallestFieldHeight', () => {
  it('returns the shortest field, which decides whether a zoom works', () => {
    expect(smallestFieldHeight([{ height: 44 }, { height: 20 }, { height: 26 }])).toBe(20)
  })

  it('ignores zero-height fields rather than reporting 0', () => {
    expect(smallestFieldHeight([{ height: 0 }, { height: 26 }])).toBe(26)
  })

  it('returns 0 for an empty form', () => {
    expect(smallestFieldHeight([])).toBe(0)
  })
})

describe('usableFitZoom', () => {
  const dense = [{ height: 26 }, { height: 26 }, { height: 20 }]

  it('raises a squashing fit so the shortest field stays usable', () => {
    // 375px phone: (375 - 32) / 500 = 0.686 fit, which renders a 20px field
    // at 13.7px. That is the bug being fixed.
    const fit = (375 - 32) / BASE_PAGE_WIDTH
    const zoom = usableFitZoom(fit, dense)

    expect(zoom).toBeGreaterThan(fit)
    expect(20 * zoom).toBeGreaterThanOrEqual(MIN_USABLE_FIELD_PX)
  })

  it('leaves a fit alone when every field is already usable', () => {
    const roomy = [{ height: 44 }, { height: 60 }]
    const fit = 0.9

    expect(usableFitZoom(fit, roomy)).toBe(fit)
  })

  it('never lowers the fit zoom', () => {
    expect(usableFitZoom(1.8, dense)).toBe(1.8)
  })

  it('passes the fit through for a form with no fields', () => {
    expect(usableFitZoom(0.55, [])).toBe(0.55)
  })

  it('respects a caller-supplied minimum', () => {
    const zoom = usableFitZoom(0.5, [{ height: 10 }], 30)

    expect(10 * zoom).toBeGreaterThanOrEqual(30)
  })
})
