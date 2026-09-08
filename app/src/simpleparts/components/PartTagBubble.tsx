export interface PartTagLabel {
  left: number
  top: number
  mode: 'text' | 'dot'
  text?: string
  fontSize: number
  dotSize: number
}

export default function PartTagBubble({ labels = [] }: { labels?: PartTagLabel[] }) {
  return (
    <div className="part-tag-bubbles">
      {labels.map((label, index) => (
        <span
          key={`${label.left}:${label.top}:${index}`}
          className={`part-tag-marker ${label.mode === 'dot' ? 'part-tag-dot' : 'part-tag-bubble'}`}
          style={{
            left: label.left,
            top: label.top,
            fontSize: label.fontSize,
            width: label.mode === 'dot' ? label.dotSize : undefined,
            height: label.mode === 'dot' ? label.dotSize : undefined,
          }}
        >
          {label.mode === 'text' ? label.text : ''}
        </span>
      ))}
    </div>
  )
}
