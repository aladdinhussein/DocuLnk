import type { CSSProperties, ReactNode } from 'react'
import '../styles/skeleton.css'

type SkeletonProps = {
  width?: number | string
  height?: number | string
  radius?: number | string
  circle?: boolean
  /** Stagger offset in ms, so a list of rows sweeps as a cascade. */
  delay?: number
  className?: string
}

/**
 * A single placeholder block.
 *
 * Always decorative: the surrounding region carries `aria-busy` and a
 * screen-reader label, so these are hidden from assistive technology rather
 * than announced as empty boxes.
 */
export function Skeleton({
  width,
  height,
  radius,
  circle = false,
  delay,
  className = '',
}: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    ...(delay ? ({ '--skeleton-delay': `${delay}ms` } as CSSProperties) : {}),
  }

  return (
    <span
      aria-hidden="true"
      className={`skeleton ${circle ? 'skeleton-circle' : ''} ${className}`.trim()}
      style={style}
    />
  )
}

/** Several lines of placeholder text, last line short like real prose. */
export function SkeletonText({ lines = 3, delay = 0 }: { lines?: number; delay?: number }) {
  return (
    <span className="skeleton-paragraph">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="skeleton-text" delay={delay + index * 60} />
      ))}
    </span>
  )
}

/**
 * Wraps a loading region so assistive technology gets one clear message
 * instead of a pile of anonymous blocks.
 */
export function SkeletonRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
