import type { TemplateField } from '../types'
import { isFieldFilled } from './signerFieldModel'
import type { SignerValues } from './signerFieldModel'

/** Width reserved beside the page for the bookmark rail. */
export const BOOKMARK_RAIL_PX = 96

/*
 * Rows are grouped by genuine vertical overlap, with no proximity tolerance.
 * A tolerance chains transitively: with 26px fields on a 30px pitch, "within
 * 6px of the previous field" merged every row on the page into one bookmark.
 */

export type BookmarkState = 'pending' | 'active' | 'filled' | 'invalid'

export type Bookmark = {
  key: string
  /** Centre of the row, in field units — multiply by zoom to place it. */
  centreY: number
  label: string
  count: number
  state: BookmarkState
  /** Fields this bookmark stands for, in reading order. */
  fieldIds: string[]
  /** Where clicking the bookmark should take the signer. */
  targetFieldId: string
}

/** Fields whose vertical bands overlap belong to the same row. */
function groupIntoRows(fields: TemplateField[]): TemplateField[][] {
  const ordered = [...fields].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: TemplateField[][] = []

  let rowBottom = -Infinity
  for (const field of ordered) {
    if (field.y < rowBottom) {
      rows[rows.length - 1].push(field)
      rowBottom = Math.max(rowBottom, field.y + field.height)
    } else {
      rows.push([field])
      rowBottom = field.y + field.height
    }
  }

  return rows
}

/**
 * One bookmark per row of fields, to sit in the margin beside the page.
 *
 * Tags anchored next to each field covered the document text the signer is
 * being asked to agree to, and on a dense form neighbouring tags collided.
 * Living in the margin means a bookmark can never obscure content, and merging
 * a row into a single bookmark keeps the rail from stacking on itself.
 */
export function planBookmarks(
  fields: TemplateField[],
  values: SignerValues,
  activeFieldId: string,
  invalidFieldIds: ReadonlySet<string> = new Set(),
): Bookmark[] {
  return groupIntoRows(fields).map((row) => {
    const unfilled = row.filter((field) => !isFieldFilled(field, values[field.id]))
    const hasActive = row.some((field) => field.id === activeFieldId)
    const hasInvalid = row.some((field) => invalidFieldIds.has(field.id))

    const state: BookmarkState = hasInvalid
      ? 'invalid'
      : hasActive
        ? 'active'
        : unfilled.length === 0
          ? 'filled'
          : 'pending'

    // Label from the first field still needing attention, else the row's first.
    const subject = unfilled[0] ?? row[0]
    const top = Math.min(...row.map((field) => field.y))
    const bottom = Math.max(...row.map((field) => field.y + field.height))

    return {
      key: row.map((field) => field.id).join('+'),
      centreY: (top + bottom) / 2,
      label: subject.label,
      count: row.length,
      state,
      fieldIds: row.map((field) => field.id),
      targetFieldId: subject.id,
    }
  })
}
