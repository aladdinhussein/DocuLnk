import type { FieldType } from '../types'

/**
 * Field coordinates are stored in the CSS pixel space of a page rendered at
 * this width. Both viewers render with <Page width={BASE_PAGE_WIDTH * zoom} />,
 * and flattening converts back via each page's own intrinsic width.
 */
export const BASE_PAGE_WIDTH = 500

/** Scale from stored field units to PDF points, for one specific page. */
export function pageScaleFor(pageWidthInPoints: number): number {
  return pageWidthInPoints / BASE_PAGE_WIDTH
}

/** Absolute box for a field overlay at the given zoom. */
export function fieldBoxStyle(
  field: { x: number; y: number; width: number; height: number },
  zoom: number,
): { left: string; top: string; width: string; height: string } {
  return {
    left: `${field.x * zoom}px`,
    top: `${field.y * zoom}px`,
    width: `${field.width * zoom}px`,
    height: `${field.height * zoom}px`,
  }
}

/**
 * Smallest sensible size per field type.
 *
 * A single 48x24 floor was applied to everything, so saving an 18x18 checkbox
 * silently inflated it to 48x24 and it no longer matched the printed box it had
 * been aligned to. A checkbox needs to be allowed to stay small.
 */
export const FIELD_MIN_SIZE: Record<FieldType, { width: number; height: number }> = {
  text: { width: 48, height: 18 },
  date: { width: 48, height: 18 },
  signature: { width: 60, height: 24 },
  initials: { width: 28, height: 20 },
  checkbox: { width: 10, height: 10 },
}

export function clampFieldSize(
  type: FieldType,
  width: number,
  height: number,
): { width: number; height: number } {
  const min = FIELD_MIN_SIZE[type] ?? FIELD_MIN_SIZE.text
  return {
    width: Math.max(min.width, width),
    height: Math.max(min.height, height),
  }
}

/**
 * Rendered height below which a field is awkward to tap or read. Dense forms
 * place 26px rows a few pixels apart, so at fit-to-width on a phone they can
 * land near 10px — technically present, practically unusable.
 */
export const MIN_USABLE_FIELD_PX = 20

/** Rendered height that makes a field comfortable to fill, not merely hittable. */
export const MIN_COMFORTABLE_FIELD_PX = 28

/** Rendered height below which a field can no longer carry its own tag legibly. */
export const MIN_TAGGABLE_FIELD_PX = 16

/** The zoom at which a field of this height renders at least `minPx` tall. */
export function zoomForFieldHeight(fieldHeight: number, minPx: number): number {
  if (fieldHeight <= 0) return 1
  return minPx / fieldHeight
}

/** Shortest field in a set — the one that decides whether a zoom level works. */
export function smallestFieldHeight(fields: Array<{ height: number }>): number {
  const heights = fields.map((field) => field.height).filter((height) => height > 0)
  return heights.length > 0 ? Math.min(...heights) : 0
}

/**
 * A zoom that fits the container but never squashes the smallest field below
 * `minPx`. Horizontal scrolling is the lesser evil: a form you must pan beats
 * one you cannot fill.
 */
export function usableFitZoom(
  fitZoom: number,
  fields: Array<{ height: number }>,
  minPx = MIN_USABLE_FIELD_PX,
): number {
  const shortest = smallestFieldHeight(fields)
  if (shortest === 0) return fitZoom
  return Math.max(fitZoom, zoomForFieldHeight(shortest, minPx))
}

/** Convert a client point into field units relative to a rendered page rect. */
export function clientPointToFieldUnits(
  clientX: number,
  clientY: number,
  pageRect: { left: number; top: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: (clientX - pageRect.left) / zoom,
    y: (clientY - pageRect.top) / zoom,
  }
}
