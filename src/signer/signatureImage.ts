/** A cursive style the signer can pick for a typed signature. */
export type SignatureStyle = {
  id: string
  name: string
  fontFamily: string
}

/*
 * System font stacks rather than webfonts: the CSP in staticwebapp.config.json
 * sets `default-src 'self'` with no `font-src`, so Google Fonts and any other
 * remote face is blocked. Swapping in self-hosted woff2 later means changing
 * only `fontFamily` here plus an @font-face rule.
 *
 * Because the adopted signature is rasterised on the signer's own machine, the
 * bytes embedded in the PDF are always exactly what they saw and approved,
 * whichever face their OS resolved.
 */
export const SIGNATURE_STYLES: SignatureStyle[] = [
  { id: 'flowing', name: 'Flowing', fontFamily: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: 'classic', name: 'Classic', fontFamily: "'Lucida Handwriting', 'Apple Chancery', 'URW Chancery L', cursive" },
  { id: 'formal', name: 'Formal', fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif" },
]

export const DEFAULT_SIGNATURE_STYLE = SIGNATURE_STYLES[0].id

export function signatureStyleById(id: string): SignatureStyle {
  return SIGNATURE_STYLES.find((style) => style.id === id) ?? SIGNATURE_STYLES[0]
}

const INK = '#172033'

/**
 * Crop transparent margins so the signature fills its box. Returns null when
 * the canvas holds no ink at all.
 */
export function inkBounds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } | null {
  if (width <= 0 || height <= 0) return null

  const { data } = context.getImageData(0, 0, width, height)
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  return right === -1 ? null : { left, top, right, bottom }
}

/** Copy the inked region of a canvas into a tightly cropped PNG data URL. */
export function trimToInk(source: HTMLCanvasElement, padding = 6): string {
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) return ''

  const bounds = inkBounds(context, source.width, source.height)
  if (!bounds) return ''

  const width = bounds.right - bounds.left + 1 + padding * 2
  const height = bounds.bottom - bounds.top + 1 + padding * 2
  const trimmed = document.createElement('canvas')
  trimmed.width = width
  trimmed.height = height

  const target = trimmed.getContext('2d')
  if (!target) return ''
  target.drawImage(source, bounds.left - padding, bounds.top - padding, width, height, 0, 0, width, height)

  return trimmed.toDataURL('image/png')
}

/**
 * Render text in the chosen style to a cropped PNG.
 *
 * The font must be loaded before drawing or the canvas silently falls back to
 * a default face — the resulting image would not match the on-screen preview.
 */
export async function renderTextToPng(
  text: string,
  style: SignatureStyle,
  fontSize = 96,
): Promise<string> {
  const trimmedText = text.trim()
  if (!trimmedText) return ''

  const font = `${fontSize}px ${style.fontFamily}`
  try {
    await document.fonts.load(font, trimmedText)
  } catch {
    // System stacks need no loading; a failure here is not fatal.
  }

  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) return ''
  measure.font = font
  const width = Math.ceil(measure.measureText(trimmedText).width) + fontSize
  const height = Math.ceil(fontSize * 2)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(width, 1)
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return ''

  context.font = font
  context.fillStyle = INK
  context.textBaseline = 'middle'
  context.fillText(trimmedText, fontSize / 2, height / 2)

  return trimToInk(canvas)
}
