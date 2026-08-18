import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { TemplateField } from '../types'
import { pageScaleFor } from '../pdf/fieldGeometry'
import { formatFieldValueForPdf, isFieldFilled } from '../signer/signerFieldModel'
import { dataUrlToBytes } from './dataUrl'

const PADDING = 4

export type Segment = { from: { x: number; y: number }; to: { x: number; y: number } }

/**
 * A centred X for a ticked checkbox, as two vector strokes.
 *
 * Drawing the glyph "X" anchored it to the box's bottom-left corner, so the
 * mark landed off the pre-printed box on the form and the only way to correct
 * it was nudging the field until it happened to line up. Vectors centre
 * exactly, at any box size, with no font metrics involved.
 */
export function checkMarkGeometry(
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): { segments: [Segment, Segment]; thickness: number } {
  const centreX = boxX + boxWidth / 2
  const centreY = boxY + boxHeight / 2
  // Square mark inset inside the box, so a non-square field still reads as an X.
  const size = Math.min(boxWidth, boxHeight) * 0.6
  const half = size / 2

  return {
    segments: [
      {
        from: { x: centreX - half, y: centreY - half },
        to: { x: centreX + half, y: centreY + half },
      },
      {
        from: { x: centreX - half, y: centreY + half },
        to: { x: centreX + half, y: centreY - half },
      },
    ],
    thickness: Math.max(0.75, size * 0.16),
  }
}

/** Largest box with the image's aspect ratio that fits the field, centred in it. */
export function fitPreservingAspect(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number; offsetX: number; offsetY: number } {
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { width: Math.max(boxWidth, 0), height: Math.max(boxHeight, 0), offsetX: 0, offsetY: 0 }
  }

  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    width,
    height,
    offsetX: (boxWidth - width) / 2,
    offsetY: (boxHeight - height) / 2,
  }
}

/**
 * Burn the signer's values into the template PDF.
 *
 * Scale is computed per page. react-pdf renders every page at the same CSS
 * width regardless of its intrinsic size, so a document mixing page sizes or
 * orientations needs each page converted by its own width.
 */
export async function flattenSignedPdf(
  pdfDataUrl: string,
  fields: TemplateField[],
  values: Record<string, string | undefined>,
): Promise<Uint8Array> {
  const pdfDocument = await PDFDocument.load(dataUrlToBytes(pdfDataUrl))
  const pages = pdfDocument.getPages()
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica)
  const signatureFont = await pdfDocument.embedFont(StandardFonts.HelveticaOblique)

  for (const field of fields) {
    const page = pages[field.page - 1]
    if (!page) {
      continue
    }

    const value = values[field.id]
    if (!value || !isFieldFilled(field, value)) {
      continue
    }

    const pageScale = pageScaleFor(page.getWidth())
    const boxX = field.x * pageScale + PADDING
    const boxY = page.getHeight() - (field.y + field.height) * pageScale + PADDING
    const boxWidth = field.width * pageScale - PADDING * 2
    const boxHeight = field.height * pageScale - PADDING * 2

    // Signatures and initials are both adopted as PNGs, so what the signer
    // approved on screen is exactly what lands in the document.
    if (value.startsWith('data:image/png')) {
      const image = await pdfDocument.embedPng(dataUrlToBytes(value))
      const fitted = fitPreservingAspect(image.width, image.height, boxWidth, boxHeight)
      page.drawImage(image, {
        x: boxX + fitted.offsetX,
        y: boxY + fitted.offsetY,
        width: fitted.width,
        height: fitted.height,
      })
      continue
    }

    if (field.type === 'checkbox') {
      const mark = checkMarkGeometry(boxX, boxY, boxWidth, boxHeight)
      for (const segment of mark.segments) {
        page.drawLine({
          start: segment.from,
          end: segment.to,
          thickness: mark.thickness,
          color: rgb(0.1, 0.12, 0.2),
        })
      }
      continue
    }

    const fontSize = Math.max(9, Math.min(18, field.height * pageScale * 0.55))
    page.drawText(formatFieldValueForPdf(field, value), {
      x: boxX,
      y: boxY,
      size: fontSize,
      font: field.type === 'signature' || field.type === 'initials' ? signatureFont : font,
      color: rgb(0.1, 0.12, 0.2),
      maxWidth: boxWidth,
    })
  }

  return pdfDocument.save()
}
