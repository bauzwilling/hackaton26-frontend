import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  buildDownloadFilename,
  formatSheetDimensions,
  formatSheetThickness,
  getMissingRequiredDownloadFields,
  hasSheetSizeForDownload,
} from '../features/shared/downloadFilename.js'

type DownloadKind = 'nesting' | 'unassigned'
interface DownloadNamingProps {
  open?: boolean
  downloadKind?: DownloadKind
  sheetX?: number | null
  sheetY?: number | null
  sheetThickness?: number | null
  defaultMaterial?: string
  onClose?: () => void
  onConfirm?: (result: Record<string, string>) => void
}

const UNASSIGNED_DOWNLOAD_MESSAGE = 'A DXF file with joined 2D curves of the unassigned parts will be downloaded. Please repeat the nesting process with an appropriate sheet size with that file.'

export default function DownloadFileNamingPanelComponent({
  open = false,
  downloadKind = 'nesting',
  sheetX = null,
  sheetY = null,
  sheetThickness = null,
  defaultMaterial = '',
  onClose,
  onConfirm,
}: DownloadNamingProps) {
  const [values, setValues] = useState({ owner: '', projectId: '', element: '', material: '', comments: '' })
  const ownerRef = useRef<HTMLInputElement>(null)
  const dimensions = formatSheetDimensions(sheetX, sheetY) || '—'
  const thickness = formatSheetThickness(sheetThickness) || '—'
  const fields = useMemo(() => ({
    ...values,
    dimensions: dimensions === '—' ? '' : dimensions,
    thickness: thickness === '—' ? '' : thickness,
  }), [dimensions, thickness, values])

  useEffect(() => {
    if (!open) return
    setValues({ owner: '', projectId: '', element: '', material: defaultMaterial, comments: '' })
    requestAnimationFrame(() => ownerRef.current?.focus())
  }, [open, defaultMaterial])

  if (!open) return null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!hasSheetSizeForDownload(sheetX, sheetY, sheetThickness)) {
      window.alert('Sheet size is unavailable for this nesting result. Please run nesting again.')
      return
    }
    const missing = getMissingRequiredDownloadFields(fields)
    if (missing.length) {
      window.alert(`Please fill in all required fields: ${missing.join(', ')}.`)
      return
    }
    onConfirm?.({ ...fields, filename: buildDownloadFilename(fields, downloadKind) })
  }
  const input = (key: keyof typeof values, label: string, required = false) => (
    <label className="download-naming__segment">
      <span className={`download-naming__label${required ? ' download-naming__label--required' : ''}`}>{label}</span>
      <input
        ref={key === 'owner' ? ownerRef : undefined}
        value={values[key]}
        type="text"
        className="download-naming__input"
        autoComplete="off"
        onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
      />
    </label>
  )
  const separator = <span className="download-naming__separator" aria-hidden="true">-</span>

  return createPortal(
    <div className="download-naming" role="dialog" aria-modal="true" aria-labelledby="download-naming-title" onKeyDown={(event) => event.key === 'Escape' && onClose?.()}>
      <div className="download-naming__backdrop" onClick={onClose} />
      <form className="download-naming__panel" onSubmit={submit}>
        <header className="download-naming__header"><h2 id="download-naming-title" className="download-naming__title">Name download file</h2><button type="button" className="download-naming__close" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="download-naming__body">
          {downloadKind === 'unassigned' && <p className="download-naming__warning">{UNASSIGNED_DOWNLOAD_MESSAGE}</p>}
          <div className="download-naming__composer" role="group" aria-label="Download file name">
            {input('owner', 'Owner', true)}{separator}{input('projectId', 'Project Id', true)}{separator}{input('element', 'Element', true)}{separator}{input('material', 'Material', true)}{separator}
            <div className="download-naming__segment"><span className="download-naming__label">Dimensions</span><span className="download-naming__static-value">{dimensions}</span></div>{separator}
            <div className="download-naming__segment"><span className="download-naming__label">Thickness</span><span className="download-naming__static-value">{thickness}</span></div>{separator}
            {input('comments', 'Comments')}<span className="download-naming__static-suffix" aria-hidden="true">{downloadKind === 'unassigned' ? '-unassigned.dxf' : '-nesting.zip'}</span>
          </div>
        </div>
        <footer className="download-naming__footer"><button type="button" className="download-naming__btn download-naming__btn--secondary" onClick={onClose}>Cancel</button><button type="submit" className="download-naming__btn download-naming__btn--primary">Download</button></footer>
      </form>
    </div>,
    document.body,
  )
}
