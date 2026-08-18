import { useEffect, useMemo, useState } from 'react'
import { dataUrlToBytes } from '../lib/dataUrl'

/**
 * A stable source object for react-pdf's <Document file={...}>.
 *
 * Passing the raw data URL string made react-pdf re-parse the whole file on
 * every render. A blob: URL is not an option — the CSP's connect-src is
 * `'self' https:` with no blob: — so the bytes are handed over directly, which
 * also skips a network round trip entirely.
 *
 * pdf.js transfers this ArrayBuffer to its worker and detaches it, so anything
 * else needing the bytes (flattening, for one) must decode its own copy.
 */
export function usePdfSource(pdfDataUrl: string | undefined) {
  return useMemo(() => {
    if (!pdfDataUrl) return null
    try {
      return { data: dataUrlToBytes(pdfDataUrl) }
    } catch {
      return null
    }
  }, [pdfDataUrl])
}

/**
 * Which page is currently in view, from an IntersectionObserver over the
 * rendered pages.
 */
export function useVisiblePage(pageCount: number, containerSelector = '.pdf-page'): number {
  const [visiblePage, setVisiblePage] = useState(1)

  useEffect(() => {
    if (pageCount <= 1) {
      setVisiblePage(1)
      return
    }

    const pages = Array.from(document.querySelectorAll<HTMLElement>(`${containerSelector}[data-page-number]`))
    if (pages.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!best) return
        const page = Number((best.target as HTMLElement).dataset.pageNumber)
        if (page) setVisiblePage(page)
      },
      { threshold: [0.1, 0.5, 0.9] },
    )

    pages.forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [pageCount, containerSelector])

  return visiblePage
}

export function scrollToPage(pageNumber: number): void {
  const target = document.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
