import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib'
import type { TemplateField } from '../types'
import { BASE_PAGE_WIDTH } from '../pdf/fieldGeometry'
import { flattenSignedPdf } from './flattenSignedPdf'

const PORTRAIT_WIDTH = 612
const LANDSCAPE_WIDTH = 792

/** A two-page PDF: page 1 portrait, page 2 landscape. */
async function mixedOrientationDataUrl(): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([PORTRAIT_WIDTH, 792]).drawText('page one', { x: 40, y: 700, size: 12, font })
  doc.addPage([LANDSCAPE_WIDTH, 612]).drawText('page two', { x: 40, y: 540, size: 12, font })
  return doc.saveAsBase64({ dataUri: true })
}

/**
 * Every decoded content stream for one page, concatenated. pdf-lib appends
 * drawings as additional streams, so reading only the first returns the
 * prologue and nothing else.
 */
async function pageContentStream(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPages()[pageIndex].node.Contents()
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

/** X coordinates of every text-positioning matrix in a content stream. */
function drawnTextXPositions(contentStream: string): number[] {
  const matches = contentStream.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)
  return Array.from(matches, (match) => Number(match[1]))
}

/** pdf-lib writes strings as hex, so 'X' appears as <58>. */
function containsDrawnText(contentStream: string, text: string): boolean {
  const hex = Array.from(text, (character) =>
    character.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join('')
  return contentStream.includes('<' + hex + '>')
}

function textField(overrides: Partial<TemplateField>): TemplateField {
  return {
    id: 'f',
    label: 'Field',
    type: 'text',
    required: true,
    x: 100,
    y: 100,
    width: 200,
    height: 30,
    page: 1,
    ...overrides,
  }
}

describe('flattenSignedPdf', () => {
  it('scales each page by its own width, not page one', async () => {
    const dataUrl = await mixedOrientationDataUrl()
    const fields = [
      textField({ id: 'a', page: 1, x: 100 }),
      textField({ id: 'b', page: 2, x: 100 }),
    ]

    const signed = await flattenSignedPdf(dataUrl, fields, { a: 'ALPHA', b: 'BRAVO' })

    // x = field.x * (pageWidth / BASE_PAGE_WIDTH) + 4
    const expectedPortrait = 100 * (PORTRAIT_WIDTH / BASE_PAGE_WIDTH) + 4
    const expectedLandscape = 100 * (LANDSCAPE_WIDTH / BASE_PAGE_WIDTH) + 4
    expect(expectedPortrait).not.toBeCloseTo(expectedLandscape)

    const portraitX = drawnTextXPositions(await pageContentStream(signed, 0))
    const landscapeX = drawnTextXPositions(await pageContentStream(signed, 1))

    expect(portraitX).toContainEqual(expectedPortrait)
    expect(landscapeX).toContainEqual(expectedLandscape)
    // The bug this guards: page 2 drawn at page 1's scale.
    expect(landscapeX).not.toContainEqual(expectedPortrait)
  })

  it('does not draw an unticked checkbox', async () => {
    const dataUrl = await mixedOrientationDataUrl()
    const fields = [textField({ id: 'c', type: 'checkbox', page: 1 })]

    const signed = await flattenSignedPdf(dataUrl, fields, { c: 'false' })

    expect(containsDrawnText(await pageContentStream(signed, 0), 'X')).toBe(false)
  })

  it('draws a ticked checkbox as two crossing strokes', async () => {
    const dataUrl = await mixedOrientationDataUrl()
    const fields = [textField({ id: 'c', type: 'checkbox', page: 1 })]

    const signed = await flattenSignedPdf(dataUrl, fields, { c: 'true' })
    const stream = await pageContentStream(signed, 0)

    // Vectors rather than the glyph "X", so the mark centres exactly in the box.
    const strokes = stream.match(/^S$/gm) ?? []
    expect(strokes.length).toBe(2)
    expect(containsDrawnText(stream, 'X')).toBe(false)
  })

  it('does not draw a field whose value is only whitespace', async () => {
    const dataUrl = await mixedOrientationDataUrl()
    const fields = [textField({ id: 'blank', page: 1 })]

    const signed = await flattenSignedPdf(dataUrl, fields, { blank: '   ' })

    expect(drawnTextXPositions(await pageContentStream(signed, 0))).toHaveLength(1) // only the template's own text
  })

  it('skips fields whose page does not exist', async () => {
    const dataUrl = await mixedOrientationDataUrl()
    const fields = [textField({ id: 'ghost', page: 99 })]

    await expect(flattenSignedPdf(dataUrl, fields, { ghost: 'nowhere' })).resolves.toBeInstanceOf(Uint8Array)
  })
})
