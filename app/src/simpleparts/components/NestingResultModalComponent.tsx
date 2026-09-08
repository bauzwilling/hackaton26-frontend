import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import DownloadFileNamingPanelComponent from './DownloadFileNamingPanelComponent'
import EditLayerNamesPanelComponent from './EditLayerNamesPanelComponent'
import DXFViewerComponent, { type DXFViewerHandle } from './DXFViewerComponent'
import { formatUnassignedIdsDisplay } from '../features/shared/unassignedDisplay.js'
import { defaultExportLayerNames, serializeLayerRenameMap, toCanonicalLayerNames } from '../boundaryDetection.js'
import { partsApi } from '../api.js'
import type { BlockInsert, PartBoundary, UnknownRecord } from '../types'
import '../simpleparts-react.css'

interface NestingResultModalProps {
  open?: boolean
  jobId?: string | null
  partCount?: number
  nestedCount?: number
  unassignedCount?: number
  unassignedIds?: unknown[]
  unassignedReasons?: string[]
  hasUnassignedDxf?: boolean
  dxfText?: string
  boundaries?: PartBoundary[]
  blockInserts?: BlockInsert[]
  sheetCount?: number
  sheetX?: number | null
  sheetY?: number | null
  sheetThickness?: number | null
  defaultMaterial?: string
  leftoverDefaultMaterial?: string
  leftoverJobId?: string | null
  leftoverDxfText?: string
  leftoverBoundaries?: PartBoundary[]
  leftoverBlockInserts?: BlockInsert[]
  leftoverSheetCount?: number
  leftoverSheetX?: number | null
  leftoverSheetY?: number | null
  leftoverSheetThickness?: number | null
  nestingMetrics?: UnknownRecord | null
  leftoverNestingMetrics?: UnknownRecord | null
  onClose?: () => void
  onNestUnassigned?: () => void
}

const METRIC_ROWS = [
  ['sheetAmount', 'Sheet quantity', 'int', ''],
  ['cutLength', 'Cutting length', 'float', 'mm'],
  ['boreCount', 'Number of drill holes', 'int', ''],
  ['grossArea', 'Gross area', 'float', 'm²'],
  ['netArea', 'Net area', 'float', 'm²'],
] as const
const DOWNLOAD_HINT = 'Configure layer visibility in the viewer to determine the content of each DXF and the merged PDF inside the downloaded ZIP.'

function sheetIndexFromName(name: string) {
  const base = name.split('/').pop() || ''
  const match = base.match(/_(\d+)\.dxf$/i)
  if (match) return Math.max(0, Number(match[1]) - 1)
  if (/^\d+\.dxf$/i.test(base)) return Number(base.slice(0, -4))
  return null
}

export default function NestingResultModalComponent({
  open = false,
  jobId = null,
  partCount = 0,
  nestedCount = 0,
  unassignedCount = 0,
  unassignedIds = [],
  unassignedReasons = [],
  hasUnassignedDxf = false,
  dxfText = '',
  boundaries = [],
  blockInserts = [],
  sheetCount = 1,
  sheetX = null,
  sheetY = null,
  sheetThickness = null,
  defaultMaterial = '',
  leftoverDefaultMaterial = '',
  leftoverJobId = null,
  leftoverDxfText = '',
  leftoverBoundaries = [],
  leftoverBlockInserts = [],
  leftoverSheetCount = 1,
  leftoverSheetX = null,
  leftoverSheetY = null,
  leftoverSheetThickness = null,
  nestingMetrics = null,
  leftoverNestingMetrics = null,
  onClose,
  onNestUnassigned,
}: NestingResultModalProps) {
  const viewerRef = useRef<DXFViewerHandle>(null)
  const [activeTab, setActiveTab] = useState<'assigned' | 'unassigned'>('assigned')
  const [viewMode, setViewMode] = useState<'all' | 'per'>('all')
  const [sheetIndex, setSheetIndex] = useState(0)
  const [sheetCache, setSheetCache] = useState<Map<string, string>>(new Map())
  const [sheetCounts, setSheetCounts] = useState<Map<string, number>>(new Map())
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetError, setSheetError] = useState('')
  const [unassignedText, setUnassignedText] = useState('')
  const [unassignedLoading, setUnassignedLoading] = useState(false)
  const [unassignedError, setUnassignedError] = useState('')
  const [namingOpen, setNamingOpen] = useState(false)
  const [downloadKind, setDownloadKind] = useState<'nesting' | 'unassigned'>('nesting')
  const [pendingHiddenLayers, setPendingHiddenLayers] = useState<string[]>([])
  const [editLayersOpen, setEditLayersOpen] = useState(false)
  const [exportLayerNames, setExportLayerNames] = useState<Record<string, string>>(defaultExportLayerNames())

  const hasLeftover = Boolean(leftoverJobId && leftoverDxfText)
  const showingLeftover = hasLeftover && activeTab === 'unassigned'
  const showingUnassignedParts = activeTab === 'unassigned' && !hasLeftover
  const activeJobId = showingUnassignedParts ? null : showingLeftover ? leftoverJobId : jobId
  const activeSheetCount = showingUnassignedParts ? 1 : sheetCounts.get(activeJobId ?? '') ?? (showingLeftover ? leftoverSheetCount : sheetCount)
  const perSheet = !showingUnassignedParts && viewMode === 'per'
  const activeDxf = showingUnassignedParts ? unassignedText : perSheet ? sheetCache.get(`${activeJobId}:${sheetIndex}`) ?? '' : showingLeftover ? leftoverDxfText : dxfText
  const activeBoundaries = showingUnassignedParts || perSheet ? [] : showingLeftover ? leftoverBoundaries : boundaries
  const activeBlocks = showingUnassignedParts || perSheet ? [] : showingLeftover ? leftoverBlockInserts : blockInserts
  const activeMetrics = showingLeftover ? leftoverNestingMetrics : nestingMetrics
  const effectiveNested = nestedCount || partCount

  useEffect(() => {
    if (!open) return
    setActiveTab('assigned')
    setViewMode('all')
    setSheetIndex(0)
    setEditLayersOpen(false)
  }, [open])
  useEffect(() => {
    setExportLayerNames(defaultExportLayerNames())
    setEditLayersOpen(false)
  }, [jobId])
  useEffect(() => {
    if (!open || !perSheet || !activeJobId || sheetCache.has(`${activeJobId}:0`)) return
    const controller = new AbortController()
    setSheetLoading(true)
    setSheetError('')
    // WAITING BFF: GET /api/jobs/:id/download should become the artifact download endpoint.
    void fetch(partsApi(`/jobs/${encodeURIComponent(activeJobId)}/download?filename=nesting.zip`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to load sheets')
        const zip = await JSZip.loadAsync(await response.arrayBuffer())
        const entries: { index: number; file: JSZip.JSZipObject }[] = []
        zip.forEach((path, file) => {
          const index = sheetIndexFromName(path)
          if (!file.dir && /\.dxf$/i.test(path) && index != null) entries.push({ index, file })
        })
        if (!entries.length) throw new Error('No sheet DXFs found in nesting result')
        const loaded = await Promise.all(entries.map(async ({ index, file }) => [index, await file.async('string')] as const))
        setSheetCache((current) => {
          const next = new Map(current)
          loaded.forEach(([index, text]) => next.set(`${activeJobId}:${index}`, text))
          return next
        })
        setSheetCounts((current) => new Map(current).set(activeJobId, entries.length))
      })
      .catch((error) => { if (error.name !== 'AbortError') setSheetError(error.message || 'Failed to load sheets') })
      .finally(() => setSheetLoading(false))
    return () => controller.abort()
  }, [activeJobId, open, perSheet, sheetCache])
  useEffect(() => {
    if (!open || activeTab !== 'unassigned' || hasLeftover || !hasUnassignedDxf || !jobId || unassignedText) return
    const controller = new AbortController()
    setUnassignedLoading(true)
    setUnassignedError('')
    // WAITING BFF: GET /api/jobs/:id/download/unassigned should become the artifact download endpoint.
    void fetch(partsApi(`/jobs/${encodeURIComponent(jobId)}/download/unassigned?filename=unassigned.dxf`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to load unassigned parts')
        setUnassignedText(await response.text())
      })
      .catch((error) => { if (error.name !== 'AbortError') setUnassignedError(error.message || 'Failed to load unassigned parts') })
      .finally(() => setUnassignedLoading(false))
    return () => controller.abort()
  }, [activeTab, hasLeftover, hasUnassignedDxf, jobId, open, unassignedText])
  useEffect(() => { requestAnimationFrame(() => viewerRef.current?.resize()) }, [activeDxf])

  const title = hasLeftover
    ? `Nesting complete — ${effectiveNested} nested + ${unassignedCount} previously unassigned ${unassignedCount === 1 ? 'part' : 'parts'} nested`
    : unassignedCount > 0
      ? `Nesting complete — ${effectiveNested} nested, ${unassignedCount} not nested`
      : `Nesting complete — ${partCount} part${partCount === 1 ? '' : 's'}`
  const metrics = useMemo(() => METRIC_ROWS.map(([key, label, kind, unit]) => {
    const number = Number(activeMetrics?.[key])
    const display = activeMetrics?.[key] == null || Number.isNaN(number) ? '—' : `${kind === 'int' ? Math.round(number).toLocaleString('de-DE') : number.toLocaleString('de-DE', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`
    return { key, label, display }
  }), [activeMetrics])
  const activeSheetX = showingLeftover ? leftoverSheetX : sheetX
  const activeSheetY = showingLeftover ? leftoverSheetY : sheetY
  const activeThickness = showingLeftover ? leftoverSheetThickness : sheetThickness
  const activeMaterial = showingLeftover ? leftoverDefaultMaterial : defaultMaterial
  const openNaming = (kind: 'nesting' | 'unassigned') => {
    const hidden = kind === 'nesting' ? viewerRef.current?.getHiddenLayers() ?? [] : []
    const all = viewerRef.current?.getLayerNames() ?? []
    if (kind === 'nesting' && all.length && all.every((name) => hidden.includes(name))) {
      window.alert('No layers are visible. Show at least one layer to download.')
      return
    }
    setDownloadKind(kind)
    setPendingHiddenLayers(hidden)
    setNamingOpen(true)
  }
  const triggerDownload = (filename: string) => {
    // WAITING DATABASE: downloadable nesting artifacts should be owned by the job/artifact API.
    const link = document.createElement('a')
    if (downloadKind === 'unassigned') link.href = partsApi(`/jobs/${jobId}/download/unassigned?filename=${encodeURIComponent(filename)}`)
    else {
      const hidden = toCanonicalLayerNames(pendingHiddenLayers, exportLayerNames)
      const params = new URLSearchParams({ filename })
      if (hidden.length) params.set('excludeLayers', hidden.join(','))
      const names = serializeLayerRenameMap(exportLayerNames)
      if (names) params.set('layerNames', names)
      link.href = partsApi(`/jobs/${activeJobId}/download?${params}`)
    }
    link.click()
  }

  return <>
    {open && createPortal(
      <div className="nesting-modal" role="dialog" aria-modal="true" aria-labelledby="nesting-modal-title">
        <div className="nesting-modal__backdrop" onClick={onClose} />
        <div className="nesting-modal__panel">
          <header className="nesting-modal__header">
            <div className="nesting-modal__header-main"><h2 id="nesting-modal-title" className="nesting-modal__title">{title}</h2><div className={`nesting-modal__sheet-toggle${showingUnassignedParts ? ' nesting-modal__sheet-toggle--disabled' : ''}`} role="group" aria-label="Sheet view mode">{(['all', 'per'] as const).map((mode) => <button key={mode} type="button" className={`nesting-modal__sheet-toggle-btn${viewMode === mode ? ' nesting-modal__sheet-toggle-btn--active' : ''}`} disabled={showingUnassignedParts} onClick={() => { setViewMode(mode); setSheetIndex(0) }}>{mode === 'all' ? 'All Sheets' : 'Per Sheet'}</button>)}</div></div>
            <button type="button" className="nesting-modal__close" aria-label="Close" onClick={onClose}>×</button>
          </header>
          {(unassignedCount > 0 || hasLeftover) && <div className="nesting-modal__tabs" role="tablist"><button type="button" role="tab" className={`nesting-modal__tab${activeTab === 'assigned' ? ' nesting-modal__tab--active' : ''}`} onClick={() => { setActiveTab('assigned'); setSheetIndex(0) }}>Assigned parts nesting (A)</button><button type="button" role="tab" className={`nesting-modal__tab${activeTab === 'unassigned' ? ' nesting-modal__tab--active' : ''}`} onClick={() => { setActiveTab('unassigned'); setSheetIndex(0) }}>{hasLeftover ? 'Unassigned parts nesting (B)' : 'Unassigned parts (B)'}</button></div>}
          <div className="nesting-modal__viewer">
            <div className="nesting-modal__info-stack">
              {unassignedCount > 0 && !hasLeftover && <div className="nesting-modal__unassigned-panel" role="status"><p className="nesting-modal__unassigned-summary">{effectiveNested} nested, {unassignedCount} not nested</p>{formatUnassignedIdsDisplay(unassignedIds) && <p className="nesting-modal__unassigned-ids">{formatUnassignedIdsDisplay(unassignedIds)}</p>}{unassignedReasons.map((reason, index) => <p key={`${reason}:${index}`} className="nesting-modal__unassigned-reason">{reason}</p>)}<p className="nesting-modal__unassigned-hint">Unassigned parts will now show <span className="legend-part-red">red</span> in app viewer.</p></div>}
              {!showingUnassignedParts && <div className="nesting-modal__metrics-panel" role="status" aria-label="Nesting metrics"><table className="nesting-modal__metrics-table"><tbody>{metrics.map((row) => <tr key={row.key}><th scope="row" className="nesting-modal__metrics-label">{row.label}</th><td className="nesting-modal__metrics-value">{row.display}</td></tr>)}</tbody></table></div>}
            </div>
            {activeDxf ? <DXFViewerComponent key={`${activeDxf}:${serializeLayerRenameMap(exportLayerNames)}`} ref={viewerRef} dxfText={activeDxf} boundaries={activeBoundaries} blockInserts={activeBlocks} viewMode="output" selectionEnabled={false} showMetadataColors={false} showLayerPanel={!showingUnassignedParts} showEditLayers={!showingUnassignedParts} exportLayerNames={exportLayerNames} onEditLayers={() => setEditLayersOpen(true)} /> : <p className="nesting-modal__viewer-empty">{showingUnassignedParts && unassignedLoading ? 'Loading unassigned parts…' : showingUnassignedParts && unassignedError ? unassignedError : perSheet && sheetLoading ? 'Loading sheet…' : perSheet && sheetError ? sheetError : 'Preview unavailable.'}</p>}
            {perSheet && <div className="nesting-modal__sheet-pager" role="navigation" aria-label="Sheet pager"><button type="button" className="nesting-modal__sheet-pager-btn" aria-label="Previous sheet" disabled={activeSheetCount <= 1 || sheetLoading} onClick={() => setSheetIndex((index) => (index - 1 + activeSheetCount) % activeSheetCount)}>‹</button><span className="nesting-modal__sheet-pager-label">Sheet {sheetIndex + 1}/{activeSheetCount}</span><button type="button" className="nesting-modal__sheet-pager-btn" aria-label="Next sheet" disabled={activeSheetCount <= 1 || sheetLoading} onClick={() => setSheetIndex((index) => (index + 1) % activeSheetCount)}>›</button></div>}
          </div>
          {(activeJobId || jobId) && <footer className="nesting-modal__footer">{activeJobId && <button type="button" className="nesting-modal__download" title={DOWNLOAD_HINT} onClick={() => openNaming('nesting')}>{hasLeftover ? activeTab === 'unassigned' ? 'Download ZIP (B)' : 'Download ZIP (A)' : 'Download ZIP'}</button>}{unassignedCount > 0 && hasUnassignedDxf && <button type="button" className="nesting-modal__download nesting-modal__download--unassigned-3d" onClick={() => openNaming('unassigned')}>Download unassigned parts (3d)</button>}{unassignedCount > 0 && hasUnassignedDxf && !hasLeftover && <button type="button" className="nesting-modal__download" title="Reprocess unassigned parts with a different sheet size." onClick={onNestUnassigned}>Nest unassigned parts</button>}</footer>}
        </div>
      </div>,
      document.body,
    )}
    <DownloadFileNamingPanelComponent open={namingOpen} downloadKind={downloadKind} sheetX={downloadKind === 'unassigned' ? sheetX : activeSheetX} sheetY={downloadKind === 'unassigned' ? sheetY : activeSheetY} sheetThickness={downloadKind === 'unassigned' ? sheetThickness : activeThickness} defaultMaterial={activeMaterial} onClose={() => setNamingOpen(false)} onConfirm={({ filename }) => { triggerDownload(filename); setNamingOpen(false) }} />
    <EditLayerNamesPanelComponent open={editLayersOpen} layerNames={exportLayerNames} onClose={() => setEditLayersOpen(false)} onConfirm={(names) => { setExportLayerNames(names); setEditLayersOpen(false) }} />
  </>
}
