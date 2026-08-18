import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { trimToInk } from './signatureImage'

type Point = { x: number; y: number }

/**
 * A drawing pad whose strokes are stored as normalised 0..1 points rather than
 * device pixels.
 *
 * The previous implementation drew straight into a fixed 520x150 bitmap that
 * CSS then stretched to `width: 100%`, so strokes drifted away from the cursor
 * at any other width. Keeping a resolution-independent model instead means the
 * pad can be resized losslessly and rendered at devicePixelRatio for crisp ink.
 */
export function useSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Point[][]>([])
  const activeStrokeRef = useRef<Point[] | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const ratio = window.devicePixelRatio || 1
    const width = canvas.width / ratio
    const height = canvas.height / ratio

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#172033'

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue
      context.beginPath()
      context.moveTo(stroke[0].x * width, stroke[0].y * height)
      for (const point of stroke.slice(1)) {
        context.lineTo(point.x * width, point.y * height)
      }
      // A single tap should still leave a visible dot.
      if (stroke.length === 1) context.lineTo(stroke[0].x * width + 0.1, stroke[0].y * height)
      context.stroke()
    }
  }, [])

  // Match the backing store to the element's real size, at device resolution.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(bounds.width * ratio)
      canvas.height = Math.round(bounds.height * ratio)
      redraw()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [redraw])

  const pointFrom = (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return null
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFrom(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activeStrokeRef.current = [point]
    strokesRef.current = [...strokesRef.current, activeStrokeRef.current]
    setIsEmpty(false)
    redraw()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current
    if (!stroke) return
    const point = pointFrom(event)
    if (!point) return
    stroke.push(point)
    redraw()
  }

  const onPointerUp = () => {
    activeStrokeRef.current = null
  }

  const clear = useCallback(() => {
    strokesRef.current = []
    activeStrokeRef.current = null
    setIsEmpty(true)
    redraw()
  }, [redraw])

  const undo = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1)
    setIsEmpty(strokesRef.current.length === 0)
    redraw()
  }, [redraw])

  /** Cropped PNG of the ink, or '' when nothing has been drawn. */
  const toPng = useCallback((): string => {
    const canvas = canvasRef.current
    if (!canvas || strokesRef.current.length === 0) return ''
    return trimToInk(canvas)
  }, [])

  return {
    canvasRef,
    isEmpty,
    clear,
    undo,
    toPng,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
