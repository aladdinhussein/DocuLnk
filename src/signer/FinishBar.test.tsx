import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FinishBar from './FinishBar'

function renderBar(props: Partial<Parameters<typeof FinishBar>[0]> = {}) {
  return render(
    <FinishBar
      done={1}
      total={3}
      started={false}
      consentAccepted={false}
      notice={null}
      isSubmitting={false}
      onReviewNotice={vi.fn()}
      onNext={vi.fn()}
      onFinish={vi.fn()}
      finishRef={() => {}}
      {...props}
    />,
  )
}

afterEach(cleanup)

describe('FinishBar', () => {
  it('offers a way back to the e-sign notice until it is accepted', () => {
    const onReviewNotice = vi.fn()
    renderBar({ onReviewNotice })

    fireEvent.click(screen.getByRole('button', { name: 'Review notice' }))

    expect(onReviewNotice).toHaveBeenCalledTimes(1)
  })

  it('shows the notice as accepted and drops the button once consented', () => {
    renderBar({ consentAccepted: true })

    expect(screen.queryByRole('button', { name: 'Review notice' })).toBeNull()
    expect(screen.getByText('Accepted')).toBeTruthy()
  })

  it('keeps the message inside the bar as a status region', () => {
    renderBar({ notice: { tone: 'error', text: 'Complete the required field: Name.' } })

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Complete the required field: Name.')
    expect(status.getAttribute('data-tone')).toBe('error')
    expect(status.closest('.signer-action-bar')).not.toBeNull()
  })

  it('labels the walker Start, then Next field', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    cleanup()

    renderBar({ started: true })
    expect(screen.getByRole('button', { name: 'Next field' })).toBeTruthy()
  })

  it('reports progress as N of M complete', () => {
    renderBar({ done: 2, total: 5 })

    expect(screen.getByText('2 of 5 complete')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')
  })
})
