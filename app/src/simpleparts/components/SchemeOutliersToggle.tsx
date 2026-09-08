interface SchemeOutliersToggleProps {
  disabled?: boolean
  showSchemeOutliers?: boolean
  onShowSchemeOutliersChange?: (value: boolean) => void
}

export default function SchemeOutliersToggle({
  disabled = false,
  showSchemeOutliers = false,
  onShowSchemeOutliersChange,
}: SchemeOutliersToggleProps) {
  return (
    <label className={`scheme-outliers-toggle${disabled ? ' scheme-outliers-toggle--disabled' : ''}`}>
      <input
        type="checkbox"
        checked={showSchemeOutliers}
        disabled={disabled}
        onChange={(event) => onShowSchemeOutliersChange?.(event.target.checked)}
      />
      Show outliers
    </label>
  )
}
