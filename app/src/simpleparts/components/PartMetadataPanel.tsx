import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

interface PartMetadataPanelProps {
  nr?: string
  mat?: string
  anz?: string
  embedded?: boolean
  style?: CSSProperties
  onUpdate?: (field: 'nr' | 'anz', value: string) => void
}

const VARIES = '<varies>'

function display(value: string) {
  return value === VARIES ? VARIES : value.trim() || '—'
}

function missing(value: string) {
  return value !== VARIES && !value.trim()
}

export default function PartMetadataPanel({
  nr = '',
  mat = '',
  anz = '',
  embedded = false,
  style,
  onUpdate,
}: PartMetadataPanelProps) {
  const [editing, setEditing] = useState<'nr' | 'anz' | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEdit = (field: 'nr' | 'anz', value: string) => {
    setDraft(value === VARIES ? '' : value.trim())
    setEditing(field)
  }
  const commit = (field: 'nr' | 'anz') => {
    if (editing !== field) return
    onUpdate?.(field, draft.trim())
    setEditing(null)
  }
  const stopPropagation = (event: PointerEvent<HTMLDivElement>) => event.stopPropagation()

  return (
    <div
      className={`part-metadata-panel${embedded ? ' embedded' : ''}`}
      style={style}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={stopPropagation}
    >
      <table className="part-metadata-table">
        <tbody>
          {([
            ['nr', 'Name', nr, true],
            ['mat', 'Material', mat, false],
            ['anz', 'Amount', anz, true],
          ] as const).map(([field, label, value, editable]) => (
            <tr key={field}>
              <th className="part-metadata-label" scope="row">{label}</th>
              <td className={`part-metadata-value${missing(value) ? ' missing' : ''}${editable && editing !== field ? ' editable' : ''}`}>
                {editable && editing === field ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    className="part-metadata-input"
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commit(field as 'nr' | 'anz')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commit(field as 'nr' | 'anz')
                      if (event.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span
                    className="part-metadata-value-text"
                    onClick={() => editable && startEdit(field as 'nr' | 'anz', value)}
                  >
                    {display(value)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {anz !== VARIES && Number.parseInt(anz.trim(), 10) === 0 && (
        <p className="part-metadata-disclaimer">Parts with 0 amount will not be nested.</p>
      )}
    </div>
  )
}
