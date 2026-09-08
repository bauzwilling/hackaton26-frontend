interface DimensionsToggleProps {
  disabled?: boolean
  showDimensions?: boolean
  onShowDimensionsChange?: (value: boolean) => void
}

export default function DimensionsToggle({
  disabled = false,
  showDimensions = true,
  onShowDimensionsChange,
}: DimensionsToggleProps) {
  return (
    <label className={`dimensions-toggle${disabled ? ' dimensions-toggle--disabled' : ''}`}>
      <input
        type="checkbox"
        checked={showDimensions}
        disabled={disabled}
        onChange={(event) => onShowDimensionsChange?.(event.target.checked)}
      />
      Show dimensions
    </label>
  )
}
