import type { Notice } from './notice'

type FinishBarProps = {
  done: number
  total: number
  started: boolean
  consentAccepted: boolean
  notice: Notice
  isSubmitting: boolean
  onReviewNotice: () => void
  onNext: () => void
  onFinish: () => void
  finishRef: (element: HTMLButtonElement | null) => void
}

type StepStatus = 'done' | 'current' | 'todo'

function statusFor(step: number, current: number): StepStatus {
  if (step < current) return 'done'
  return step === current ? 'current' : 'todo'
}

/**
 * The sticky bar that tells the signer where they are: three steps, the
 * progress through the fields, and whatever the screen last had to say.
 *
 * The notice lives here rather than below the bar because validation scrolls
 * the page to the offending field, and a message that scrolls away with the
 * top of the panel is a message nobody reads.
 */
export default function FinishBar({
  done,
  total,
  started,
  consentAccepted,
  notice,
  isSubmitting,
  onReviewNotice,
  onNext,
  onFinish,
  finishRef,
}: FinishBarProps) {
  const fieldsComplete = total === 0 || done >= total
  const percent = total === 0 ? 100 : Math.round((done / total) * 100)
  const current = !consentAccepted ? 1 : fieldsComplete ? 3 : 2

  return (
    <div className="signer-action-bar">
      <ol className="signer-steps" aria-label="Signing steps">
        <li className="signer-step" data-status={statusFor(1, current)}>
          <span className="signer-step-index" aria-hidden="true">
            {consentAccepted ? '✓' : '1'}
          </span>
          <div className="signer-step-body">
            <span className="signer-step-title">E-sign notice</span>
            {consentAccepted ? (
              <span className="signer-step-detail">Accepted</span>
            ) : (
              <button type="button" className="quiet-button signer-step-action" onClick={onReviewNotice}>
                Review notice
              </button>
            )}
          </div>
        </li>

        <li className="signer-step signer-step-fields" data-status={statusFor(2, current)}>
          <span className="signer-step-index" aria-hidden="true">
            {fieldsComplete && total > 0 ? '✓' : '2'}
          </span>
          <div className="signer-step-body">
            <span className="signer-step-title">Fill required fields</span>
            <span className="signer-step-detail" aria-live="polite" aria-atomic="true">
              {total === 0 ? 'None on this form' : `${done} of ${total} complete`}
            </span>
            <div
              className="progress-meter"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Required fields complete"
            >
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
          <button
            type="button"
            className="secondary-button signer-next-button"
            onClick={onNext}
            disabled={fieldsComplete && started}
          >
            {started ? 'Next field' : 'Start'}
          </button>
        </li>

        <li className="signer-step signer-step-finish" data-status={statusFor(3, current)}>
          <span className="signer-step-index" aria-hidden="true">3</span>
          {/*
            Always enabled. A disabled Finish with no explanation was the worst
            thing on this page: clicking it now runs validation and shows exactly
            what is missing.
          */}
          <button
            ref={finishRef}
            type="button"
            className="primary-button"
            disabled={isSubmitting}
            onClick={onFinish}
          >
            {isSubmitting ? 'Submitting...' : 'Finish'}
          </button>
        </li>
      </ol>

      {/* Always present so the live region exists before the first message. */}
      <p className="signer-bar-notice" role="status" aria-live="polite" data-tone={notice?.tone}>
        {notice?.text}
      </p>
    </div>
  )
}
