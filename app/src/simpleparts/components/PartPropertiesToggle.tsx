interface PartPropertiesToggleProps {
  clickForProperties?: boolean
  onClickForPropertiesChange?: (value: boolean) => void
}

export default function PartPropertiesToggle({
  clickForProperties = false,
  onClickForPropertiesChange,
}: PartPropertiesToggleProps) {
  return (
    <label className="part-properties-toggle">
      <input
        type="checkbox"
        checked={clickForProperties}
        onChange={(event) => onClickForPropertiesChange?.(event.target.checked)}
      />
      Click for properties / layer
    </label>
  )
}
