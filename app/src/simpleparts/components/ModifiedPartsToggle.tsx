interface ModifiedPartsToggleProps {
  showModifiedPartsGreen?: boolean
  onShowModifiedPartsGreenChange?: (value: boolean) => void
}

export default function ModifiedPartsToggle({
  showModifiedPartsGreen = false,
  onShowModifiedPartsGreenChange,
}: ModifiedPartsToggleProps) {
  return (
    <label className="modified-parts-toggle">
      <input
        type="checkbox"
        checked={showModifiedPartsGreen}
        onChange={(event) => onShowModifiedPartsGreenChange?.(event.target.checked)}
      />
      <span className="legend-part-green">Show modified parts in green</span>
    </label>
  )
}
