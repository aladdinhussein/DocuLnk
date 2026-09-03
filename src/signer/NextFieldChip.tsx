type NextFieldChipProps = {
  label: string
  isFinish: boolean
  hidden: boolean
  onClick: () => void
}

/**
 * Floating walker for narrow screens, where the sticky bar hides its own
 * Start / Next field button so there is one thumb-reachable control instead of
 * two that say the same thing. CSS hides this at desktop widths.
 */
export default function NextFieldChip({ label, isFinish, hidden, onClick }: NextFieldChipProps) {
  if (hidden) return null

  return (
    <div className="signer-navigation">
      <button type="button" className="primary-button chip-button" onClick={onClick}>
        <span aria-hidden="true">{isFinish ? '✓' : '▼'}</span>
        {label}
      </button>
    </div>
  )
}
