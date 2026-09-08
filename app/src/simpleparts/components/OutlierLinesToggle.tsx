interface OutlierLinesToggleProps {
  disabled?: boolean
  showOutlierLines?: boolean
  onShowOutlierLinesChange?: (value: boolean) => void
}

export default function OutlierLinesToggle({
  disabled = false,
  showOutlierLines = false,
  onShowOutlierLinesChange,
}: OutlierLinesToggleProps) {
  return (
    <label className={`outlier-lines-toggle${disabled ? ' outlier-lines-toggle--disabled' : ''}`}>
      <input
        type="checkbox"
        checked={showOutlierLines}
        disabled={disabled}
        onChange={(event) => onShowOutlierLinesChange?.(event.target.checked)}
      />
      Show closing lines
    </label>
  )
}
