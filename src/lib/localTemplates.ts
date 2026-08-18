import type { PublishedTemplate } from '../types'

export const localTemplatesKey = 'doculnk-templates'

export function readLocalTemplates(): PublishedTemplate[] {
  const collection = JSON.parse(localStorage.getItem(localTemplatesKey) ?? '[]') as PublishedTemplate[]
  if (collection.length > 0) return collection

  const legacy = JSON.parse(localStorage.getItem('doculnk-template-demo') ?? 'null') as PublishedTemplate | null
  return legacy ? [legacy] : []
}

export function writeLocalTemplates(templates: PublishedTemplate[]): void {
  localStorage.setItem(localTemplatesKey, JSON.stringify(templates))
}
