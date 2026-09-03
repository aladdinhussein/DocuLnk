const ENTRIES: Array<{ state: string; label: string }> = [
  { state: 'required', label: 'Required' },
  { state: 'optional', label: 'Optional' },
  { state: 'filled', label: 'Done' },
  { state: 'invalid', label: 'Needs attention' },
]

/** What the coloured boxes on the page mean. */
export default function FieldLegend() {
  return (
    <ul className="field-legend" aria-label="Field colours">
      {ENTRIES.map((entry) => (
        <li key={entry.state}>
          <span className="field-legend-swatch" data-state={entry.state} aria-hidden="true" />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}
