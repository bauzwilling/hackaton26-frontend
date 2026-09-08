import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { EXPORTABLE_LAYERS, defaultExportLayerNames } from '../boundaryDetection.js'

interface EditLayerNamesPanelProps {
  open?: boolean
  layerNames?: Record<string, string> | null
  onClose?: () => void
  onConfirm?: (names: Record<string, string>) => void
}

export default function EditLayerNamesPanelComponent({
  open = false,
  layerNames = null,
  onClose,
  onConfirm,
}: EditLayerNamesPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>(defaultExportLayerNames())
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const next = defaultExportLayerNames()
    for (const canonical of EXPORTABLE_LAYERS as string[]) {
      next[canonical] = String(layerNames?.[canonical] ?? '').trim() || canonical
    }
    setDrafts(next)
    requestAnimationFrame(() => firstInputRef.current?.focus())
  }, [open, layerNames])

  const duplicateError = useMemo(() => {
    const seen = new Set<string>()
    for (const canonical of EXPORTABLE_LAYERS as string[]) {
      const value = String(drafts[canonical] ?? '').trim() || canonical
      const key = value.toLowerCase()
      if (seen.has(key)) return `Duplicate name “${value}”. Each layer must be unique.`
      seen.add(key)
    }
    return ''
  }, [drafts])

  if (!open) return null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (duplicateError) return
    const confirmed = defaultExportLayerNames()
    for (const canonical of EXPORTABLE_LAYERS as string[]) {
      confirmed[canonical] = String(drafts[canonical] ?? '').trim() || canonical
    }
    onConfirm?.(confirmed)
  }

  return createPortal(
    <div className="edit-layers" role="dialog" aria-modal="true" aria-labelledby="edit-layers-title" onKeyDown={(event) => event.key === 'Escape' && onClose?.()}>
      <div className="edit-layers__backdrop" onClick={onClose} />
      <form className="edit-layers__panel" onSubmit={submit}>
        <header className="edit-layers__header"><h2 id="edit-layers-title" className="edit-layers__title">Edit layer names</h2><button type="button" className="edit-layers__close" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="edit-layers__body">
          <p className="edit-layers__hint">These names are applied to DXFs in the downloaded ZIP. The viewer keeps the default names.</p>
          {(EXPORTABLE_LAYERS as string[]).map((canonical, index) => (
            <div key={canonical} className="edit-layers__row">
              <label className="edit-layers__label" htmlFor={`edit-layer-${canonical}`}>{canonical}</label>
              <input
                id={`edit-layer-${canonical}`}
                ref={index === 0 ? firstInputRef : undefined}
                value={drafts[canonical] ?? ''}
                type="text"
                className="edit-layers__input"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setDrafts((current) => ({ ...current, [canonical]: event.target.value }))}
              />
            </div>
          ))}
          {duplicateError && <p className="edit-layers__error">{duplicateError}</p>}
        </div>
        <footer className="edit-layers__footer"><button type="button" className="edit-layers__btn edit-layers__btn--secondary" onClick={onClose}>Cancel</button><button type="submit" className="edit-layers__btn edit-layers__btn--primary" disabled={Boolean(duplicateError)}>Apply</button></footer>
      </form>
    </div>,
    document.body,
  )
}
