import type { Bookmark } from './fieldTagLayout'

type FieldBookmarksProps = {
  bookmarks: Bookmark[]
  zoom: number
  onJump: (fieldId: string) => void
}

const STATE_GLYPH: Record<Bookmark['state'], string> = {
  filled: '✓',
  invalid: '!',
  active: '▸',
  pending: '▸',
}

/**
 * The rail of bookmarks in the page margin.
 *
 * Each tab points at its row and is clickable, so it doubles as navigation
 * rather than being decoration that happens to cover the document.
 */
export default function FieldBookmarks({ bookmarks, zoom, onJump }: FieldBookmarksProps) {
  if (bookmarks.length === 0) return null

  return (
    <div className="bookmark-rail" aria-label="Fields on this page">
      {bookmarks.map((bookmark) => (
        <button
          type="button"
          key={bookmark.key}
          className="field-bookmark"
          data-state={bookmark.state}
          style={{ top: `${bookmark.centreY * zoom}px` }}
          onClick={() => onJump(bookmark.targetFieldId)}
          title={bookmark.count > 1
            ? `${bookmark.label} and ${bookmark.count - 1} more on this line`
            : bookmark.label}
        >
          <span className="bookmark-glyph" aria-hidden="true">{STATE_GLYPH[bookmark.state]}</span>
          <span className="bookmark-label">{bookmark.label}</span>
          {bookmark.count > 1 && (
            <span className="bookmark-count" aria-hidden="true">{bookmark.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
