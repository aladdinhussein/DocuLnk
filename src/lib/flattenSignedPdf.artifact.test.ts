import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib'
import type { TemplateField } from '../types'
import { flattenSignedPdf } from './flattenSignedPdf'

/** 8x2 PNG — deliberately a 4:1 ratio so aspect handling is observable. */
const WIDE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAACCAIAAADq9gq6AAAAEUlEQVR4nGMQkTPCihhwSQAAmpIGQWiHBCIAAAAASUVORK5CYII='

async function singlePageDataUrl(): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([612, 792]).drawText('agreement', { x: 40, y: 700, size: 12, font })
  return doc.saveAsBase64({ dataUri: true })
}

async function pageContentStream(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPages()[0].node.Contents()
  const streams: PDFRawStream[] = []

  if (contents instanceof PDFRawStream) {
    streams.push(contents)
  } else if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index += 1) {
      const entry = doc.context.lookup(contents.get(index))
      if (entry instanceof PDFRawStream) streams.push(entry)
    }
  }

  const decoder = new TextDecoder('latin1')
  return streams
    .map((stream) => decoder.decode(decodePDFRawStream(stream).decode()))
    .join(String.fromCharCode(10))
}

/** Count image XObjects reachable from page 1's resources. */
async function embeddedImageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes)
  const resources = doc.getPages()[0].node.Resources() as unknown as {
    get: (key: PDFName) => unknown
  } | undefined
  const xObjects = doc.context.lookup(resources?.get(PDFName.of('XObject')) as never) as unknown as {
    entries?: () => Array<[unknown, unknown]>
  } | undefined
  if (!xObjects?.entries) return 0

  let count = 0
  for (const [, value] of xObjects.entries()) {
    const stream = doc.context.lookup(value as never)
    const subtype = (stream as { dict?: { get: (key: PDFName) => unknown } })?.dict?.get(PDFName.of('Subtype'))
    if (String(subtype) === '/Image') count += 1
  }
  return count
}

function containsDrawnText(contentStream: string, text: string): boolean {
  const hex = Array.from(text, (character) =>
    character.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join('')
  return contentStream.includes('<' + hex + '>')
}

function field(overrides: Partial<TemplateField>): TemplateField {
  return {
    id: 'f',
    label: 'Field',
    type: 'text',
    required: true,
    x: 60,
    y: 100,
    width: 200,
    height: 40,
    page: 1,
    ...overrides,
  }
}

describe('flattened signed document', () => {
  it('embeds an adopted signature as an image, not as text', async () => {
    const dataUrl = await singlePageDataUrl()
    const fields = [field({ id: 'sig', type: 'signature' })]

    const signed = await flattenSignedPdf(dataUrl, fields, { sig: WIDE_PNG })

    expect(await embeddedImageCount(signed)).toBe(1)
  })

  it('embeds initials as an image too', async () => {
    // Initials used to fall through to the plain-text branch and render in
    // Helvetica regardless of what the signer adopted.
    const dataUrl = await singlePageDataUrl()
    const fields = [
      field({ id: 'sig', type: 'signature', x: 60 }),
      field({ id: 'ini', type: 'initials', x: 300, width: 70 }),
    ]

    const signed = await flattenSignedPdf(dataUrl, fields, { sig: WIDE_PNG, ini: WIDE_PNG })

    expect(await embeddedImageCount(signed)).toBe(2)
  })

  it('draws the signature at its own aspect ratio, not stretched to the box', async () => {
    const dataUrl = await singlePageDataUrl()
    const fields = [field({ id: 'sig', type: 'signature', width: 200, height: 40 })]

    // Field units are converted by the page's own width, then padded 4pt a side.
    const pageScale = 612 / 500
    const boxWidth = 200 * pageScale - 8
    const boxHeight = 40 * pageScale - 8

    const signed = await flattenSignedPdf(dataUrl, fields, { sig: WIDE_PNG })
    const stream = await pageContentStream(signed)

    // pdf-lib emits several `cm` operators before `Do`; the scaling one is the
    // entry with no translation and a non-unit scale.
    const scales = Array.from(stream.matchAll(/([\d.]+) 0 0 ([\d.]+) 0 0 cm/g))
      .map((match) => ({ width: Number(match[1]), height: Number(match[2]) }))
      .filter((entry) => entry.width !== 1 || entry.height !== 1)
    expect(scales).toHaveLength(1)

    const drawnWidth = scales[0].width
    const drawnHeight = scales[0].height
    expect(drawnWidth / drawnHeight).toBeCloseTo(4, 1)
    expect(drawnWidth).toBeLessThanOrEqual(boxWidth + 0.01)
    expect(drawnHeight).toBeLessThanOrEqual(boxHeight + 0.01)
    // Height-constrained here, so it should fill the box vertically.
    expect(drawnHeight).toBeCloseTo(boxHeight, 1)
  })

  it('writes dates as MM/DD/YYYY rather than the input value', async () => {
    const dataUrl = await singlePageDataUrl()
    const fields = [field({ id: 'when', type: 'date' })]

    const signed = await flattenSignedPdf(dataUrl, fields, { when: '2026-08-19' })
    const stream = await pageContentStream(signed)

    expect(containsDrawnText(stream, '08/19/2026')).toBe(true)
    expect(containsDrawnText(stream, '2026-08-19')).toBe(false)
  })

  it('centres the checkbox mark on the field box in the real document', async () => {
    const dataUrl = await singlePageDataUrl()
    // An 18x18 checkbox at (60, 100), the shape the editor now snaps to.
    const fields = [field({ id: 'box', type: 'checkbox', x: 60, y: 100, width: 18, height: 18 })]

    const signed = await flattenSignedPdf(dataUrl, fields, { box: 'true' })
    const stream = await pageContentStream(signed)

    // Stroke endpoints, from `x y m` and `x y l` operators.
    const points = Array.from(stream.matchAll(/^([\d.]+) ([\d.]+) [ml]$/gm))
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
    expect(points.length).toBeGreaterThanOrEqual(4)

    // Bounding-box centre, not a centroid: pdf-lib emits each line's `moveto`
    // twice, which would double-weight the start points.
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const centre = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    }

    // Field units convert by the page's own width, then 4pt padding a side.
    const pageScale = 612 / 500
    const expectedX = 60 * pageScale + 4 + (18 * pageScale - 8) / 2
    const expectedY = 792 - (100 + 18) * pageScale + 4 + (18 * pageScale - 8) / 2

    expect(centre.x).toBeCloseTo(expectedX, 1)
    expect(centre.y).toBeCloseTo(expectedY, 1)
  })

  it('writes plain text fields verbatim', async () => {
    const dataUrl = await singlePageDataUrl()
    const fields = [field({ id: 'name' })]

    const signed = await flattenSignedPdf(dataUrl, fields, { name: 'Jane Alice Smith' })

    expect(containsDrawnText(await pageContentStream(signed), 'Jane Alice Smith')).toBe(true)
  })
})
