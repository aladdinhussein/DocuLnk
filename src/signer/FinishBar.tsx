type FinishBarProps = {
  done: number
  total: number
  started: boolean
  consentAccepted: boolean
  isSubmitting: boolean
  onNext: () => void
  onFinish: () => void
  finishRef: (element: HTMLButtonElement | null) => void
}

export default function FinishBar({
  done,
  total,
  started,
  consentAccepted,
  isSubmitting,
  onNext,
  onFinish,
  finishRef,
}: FinishBarProps) {
  const complete = total === 0 || done >= total
  const percent = total === 0 ? 100 : Math.round((done / total) * 100)

  return (
    <div className="signer-action-bar">
      <div className="signer-progress">
        <strong>
          {total === 0 ? 'No required fields' : `${done} of ${total} required fields complete`}
        </strong>
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
        <span className="signer-progress-note">
          {consentAccepted ? 'Authorized to sign' : 'Authorization required'}
        </span>
      </div>

      <button type="button" className="secondary-button" onClick={onNext} disabled={complete && started}>
        {started ? 'Next' : 'Start'}
      </button>

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
    </div>
  )
}
