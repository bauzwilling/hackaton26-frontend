interface PartTagToggleProps {
  showPartLabels?: boolean
  onShowPartLabelsChange?: (value: boolean) => void
}

export default function PartTagToggle({
  showPartLabels = false,
  onShowPartLabelsChange,
}: PartTagToggleProps) {
  return (
    <label className="part-tag-toggle">
      <input
        type="checkbox"
        checked={showPartLabels}
        onChange={(event) => onShowPartLabelsChange?.(event.target.checked)}
      />
      Show all part names
    </label>
  )
}
