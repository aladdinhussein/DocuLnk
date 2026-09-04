export type FieldType = 'text' | 'phone' | 'signature' | 'initials' | 'date' | 'checkbox'

export type TemplateField = {
  id: string
  label: string
  type: FieldType
  required: boolean
  /**
   * Id of a checkbox field on the same template. When set, `required` only
   * applies while that checkbox is ticked. Unset means always required.
   */
  requiredWhenFieldId?: string
  /**
   * Checkboxes sharing a group act like radio buttons: ticking one clears the
   * others, and a required group is satisfied by any one selection.
   */
  group?: string
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
