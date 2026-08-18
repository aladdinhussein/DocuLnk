export type FieldType = 'text' | 'signature' | 'initials' | 'date' | 'checkbox'

export type TemplateField = {
  id: string
  label: string
  type: FieldType
  required: boolean
  x: number
  y: number
  width: number
  height: number
  page: number
}

export type PublishedTemplate = {
  templateId: string
  name: string
  pdfHash: string
  hashAlgorithm: string
  pageCount?: number
  fields: TemplateField[]
  pdfDataUrl: string
}

export type FieldInteraction = {
  fieldId: string
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  fieldX: number
  fieldY: number
  fieldWidth: number
  fieldHeight: number
  fieldPage: number
}
