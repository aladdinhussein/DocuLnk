import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { BASE_PAGE_WIDTH } from './fieldGeometry'

type ZoomOptions = {
  min: number
  max: number
  step?: number
}

/**
 * Zoom as a multiple of BASE_PAGE_WIDTH. Clamps differ per surface: the editor
 * keeps its original 0.6-1.6 range, while signers get more room because a
 * 500px page overflows a phone at 1.0.
 */
export function useZoom({ min, max, step = 0.1 }: ZoomOptions) {
  const [zoom, setZoom] = useState(1)

  const clamp = useCallback(
    (value: number) => Math.min(max, Math.max(min, Number(value.toFixed(2)))),
    [min, max],
  )

  const zoomIn = useCallback(() => setZoom((current) => clamp(current + step)), [clamp, step])
  const zoomOut = useCallback(() => setZoom((current) => clamp(current - step)), [clamp, step])
  const resetZoom = useCallback(() => setZoom(1), [])

  const fitToWidth = useCallback(
    (container: HTMLElement | null) => {
      if (!container) return
      const available = container.clientWidth - 32
      if (available <= 0) return
      setZoom(clamp(available / BASE_PAGE_WIDTH))
    },
    [clamp],
  )

  return { zoom, setZoom, zoomIn, zoomOut, resetZoom, fitToWidth }
}

/** Fit once on mount, and keep fitting while the page is narrower than the viewport. */
export function useFitOnMount(
  containerRef: RefObject<HTMLElement | null>,
  fitToWidth: (container: HTMLElement | null) => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    fitToWidth(container)
    // Only follow viewport changes, not the zoom-driven size changes of children.
    const onResize = () => fitToWidth(container)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [containerRef, fitToWidth, enabled])
}
