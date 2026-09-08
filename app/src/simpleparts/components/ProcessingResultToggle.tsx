interface ProcessingResultToggleProps {
  showCorrectParts?: boolean
  showIncorrectParts?: boolean
  onShowCorrectPartsChange?: (value: boolean) => void
  onShowIncorrectPartsChange?: (value: boolean) => void
}

export default function ProcessingResultToggle({
  showCorrectParts = false,
  showIncorrectParts = false,
  onShowCorrectPartsChange,
  onShowIncorrectPartsChange,
}: ProcessingResultToggleProps) {
  return (
    <>
      <label className="output-parts-toggle">
        <input
          type="checkbox"
          checked={showCorrectParts}
          onChange={(event) => onShowCorrectPartsChange?.(event.target.checked)}
        />
        <span className="legend-part-green">Correct parts (only)</span>
      </label>
      <label className="output-parts-toggle">
        <input
          type="checkbox"
          checked={showIncorrectParts}
          onChange={(event) => onShowIncorrectPartsChange?.(event.target.checked)}
        />
        <span className="legend-part-red">Incorrect parts (only)</span>
      </label>
    </>
  )
}
