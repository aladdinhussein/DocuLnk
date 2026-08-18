import { describe, expect, it } from 'vitest'
import { fitPreservingAspect } from './flattenSignedPdf'

describe('fitPreservingAspect', () => {
  it('keeps a wide signature from being stretched vertically', () => {
    // 400x100 image into a 200x100 box: width-constrained.
    const fitted = fitPreservingAspect(400, 100, 200, 100)

    expect(fitted.width).toBeCloseTo(200)
    expect(fitted.height).toBeCloseTo(50)
    expect(fitted.width / fitted.height).toBeCloseTo(4)
  })

  it('centres the image in the leftover space', () => {
    const fitted = fitPreservingAspect(400, 100, 200, 100)

    expect(fitted.offsetX).toBeCloseTo(0)
    expect(fitted.offsetY).toBeCloseTo(25)
  })

  it('constrains by height when the image is tall', () => {
    const fitted = fitPreservingAspect(100, 400, 200, 100)

    expect(fitted.height).toBeCloseTo(100)
    expect(fitted.width).toBeCloseTo(25)
    expect(fitted.offsetX).toBeCloseTo(87.5)
  })

  it('preserves the source ratio exactly', () => {
    const fitted = fitPreservingAspect(313, 97, 210, 26)

    expect(fitted.width / fitted.height).toBeCloseTo(313 / 97)
  })

  it('never exceeds the box', () => {
    const fitted = fitPreservingAspect(1000, 1000, 210, 26)

    expect(fitted.width).toBeLessThanOrEqual(210)
    expect(fitted.height).toBeLessThanOrEqual(26)
  })

  it('degrades safely on a zero-sized image', () => {
    expect(fitPreservingAspect(0, 0, 200, 100)).toEqual({
      width: 200, height: 100, offsetX: 0, offsetY: 0,
    })
  })
})
