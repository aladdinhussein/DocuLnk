import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Skeleton, SkeletonRegion, SkeletonText } from './Skeleton'
import {
  DocumentSkeleton,
  SubmissionListSkeleton,
  TemplateTableSkeleton,
} from './DashboardSkeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton width={100} height={12} />)

    expect(container.querySelector('.skeleton')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('applies explicit dimensions', () => {
    const { container } = render(<Skeleton width={120} height={16} />)
    const style = container.querySelector<HTMLElement>('.skeleton')?.style

    expect(style?.width).toBe('120px')
    expect(style?.height).toBe('16px')
  })

  it('staggers the sweep so rows cascade', () => {
    const { container } = render(<Skeleton delay={160} />)

    expect(container.querySelector<HTMLElement>('.skeleton')?.style
      .getPropertyValue('--skeleton-delay')).toBe('160ms')
  })

  it('omits the delay variable when there is no stagger', () => {
    const { container } = render(<Skeleton />)

    expect(container.querySelector<HTMLElement>('.skeleton')?.style
      .getPropertyValue('--skeleton-delay')).toBe('')
  })

  it('adds the circle modifier when asked', () => {
    const { container } = render(<Skeleton circle />)

    expect(container.querySelector('.skeleton')?.classList.contains('skeleton-circle')).toBe(true)
  })
})

describe('SkeletonText', () => {
  it('renders the requested number of lines', () => {
    const { container } = render(<SkeletonText lines={4} />)

    expect(container.querySelectorAll('.skeleton')).toHaveLength(4)
  })

  it('staggers each line', () => {
    const { container } = render(<SkeletonText lines={3} />)
    const delays = Array.from(container.querySelectorAll<HTMLElement>('.skeleton'))
      .map((node) => node.style.getPropertyValue('--skeleton-delay'))

    expect(delays).toEqual(['', '60ms', '120ms'])
  })
})

describe('SkeletonRegion', () => {
  it('announces one message rather than a pile of empty boxes', () => {
    const { container } = render(
      <SkeletonRegion label="Loading templates"><Skeleton /></SkeletonRegion>,
    )

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByText('Loading templates').classList.contains('sr-only')).toBe(true)
  })
})

describe('dashboard skeletons', () => {
  it('renders one placeholder row per requested row', () => {
    const { container } = render(<TemplateTableSkeleton rows={4} />)

    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(4)
  })

  it('shapes submission rows differently from template rows', () => {
    const { container } = render(<SubmissionListSkeleton rows={2} />)

    expect(container.querySelectorAll('.skeleton-row-submission')).toHaveLength(2)
  })

  it('labels the document placeholder for screen readers', () => {
    render(<DocumentSkeleton label="Rendering template" />)

    expect(screen.getByText('Rendering template')).toBeTruthy()
  })

  it('marks every loading region busy', () => {
    const { container } = render(<TemplateTableSkeleton />)

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
})
