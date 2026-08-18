type NextFieldChipProps = {
  label: 'Start' | 'Next' | 'Finish'
  hidden: boolean
  onClick: () => void
}

/** Floating jump-to-next-field control, pinned above the fold on every viewport. */
export default function NextFieldChip({ label, hidden, onClick }: NextFieldChipProps) {
  if (hidden) return null

  return (
    <div className="signer-navigation">
      <button type="button" className="primary-button chip-button" onClick={onClick}>
        <span aria-hidden="true">{label === 'Finish' ? '✓' : '▼'}</span>
        {label}
      </button>
    </div>
  )
}
