import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import DownloadFileNamingPanelComponent from './DownloadFileNamingPanelComponent'
import EditLayerNamesPanelComponent from './EditLayerNamesPanelComponent'
import NestingSheetsViewer, {
  UNASSIGNED_SHEET_INDEX,
  type NestingSheetPayload,
  type NestingSheetsViewerHandle,
} from './NestingSheetsViewer'
import { formatUnassignedIdsDisplay } from '../features/shared/unassignedDisplay.js'
import { defaultExportLayerNames, serializeLayerRenameMap, toCanonicalLayerNames } from '../boundaryDetection.js'
import { partsApi } from '../api.js'
import { loadSimplePartsNestingSheets } from '../lib/loadNestingSheets'
import { nestingLog, nestingMark } from './nestingPerfLog'
import type { BlockInsert, PartBoundary, UnknownRecord } from '../types'
import '../simpleparts-react.css'

interface NestingResultModalProps {
  open?: boolean
  /** modal = portal overlay (legacy); page = fill the Studio window (maximize/hide/close on the Studio chrome) */
  variant?: 'modal' | 'page'
  jobId?: string | null
  partCount?: number
  nestedCount?: number
  unassignedCount?: number
  unassignedIds?: unknown[]
  unassignedReasons?: string[]
  hasUnassignedDxf?: boolean
  /** @deprecated Combined preview DXF is not used for interactive nesting views. */
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
  /** Kept for snapshot compatibility; not surfaced in this nesting window version. */
  onNestUnassigned?: () => void
  /**
   * When set, skip Simple Parts Flask sheet fetches and use these DXFs.
   * Used by Plyworks (ZIP unpack) and any future BFF sheet provider.
   */
  preloadedSheets?: NestingSheetPayload[]
  sheetsLoading?: boolean
  sheetsError?: string
  /** Placeholder for missing numeric/text fields (default em dash). */
  emptyValue?: string
  /** Full nesting package download. Defaults to Simple Parts Flask ZIP. */
  nestZipHref?: (filename: string, opts: { excludeLayers: string[]; layerNames: string }) => string
  /** Single-sheet download. Defaults to Flask; preloaded sheets fall back to a client blob. */
  sheetHref?: (sheetIndex: number, filename: string) => string | null
  unassignedHref?: (filename: string) => string
}

type ViewMode = 'overview' | 'detail'
type DownloadKind = 'nesting' | 'unassigned' | 'sheet'

const METRIC_ROWS = [
  ['sheetAmount', 'Sheet quantity', 'int', ''],
  ['cutLength', 'Cutting length', 'float', 'mm'],
  ['boreCount', 'Number of drill holes', 'int', ''],
  ['grossArea', 'Gross area', 'float', 'm²'],
  ['netArea', 'Net area', 'float', 'm²'],
] as const
const DOWNLOAD_HINT = 'Download builds the nesting ZIP on demand (not while browsing sheets).'

type SheetEntry = { index: number; dxfText: string; label?: string }

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export default function NestingResultModalComponent({
  open = false,
  variant = 'modal',
  jobId = null,
  partCount = 0,
  nestedCount = 0,
  unassignedCount = 0,
  unassignedIds = [],
  unassignedReasons = [],
  hasUnassignedDxf = false,
  sheetCount = 1,
  sheetX = null,
  sheetY = null,
  sheetThickness = null,
  defaultMaterial = '',
  nestingMetrics = null,
  onClose,
  preloadedSheets,
  sheetsLoading = false,
  sheetsError = '',
  emptyValue = '—',
  nestZipHref,
  sheetHref,
  unassignedHref,
}: NestingResultModalProps) {
  const sheetsViewerRef = useRef<NestingSheetsViewerHandle>(null)
  const loadedJobsRef = useRef(new Set<string>())
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [sheetIndex, setSheetIndex] = useState(0)
  const [sheetCache, setSheetCache] = useState<Map<string, SheetEntry[]>>(() => new Map())
  const [loadingJobs, setLoadingJobs] = useState<Set<string>>(() => new Set())
  const [sheetErrors, setSheetErrors] = useState<Map<string, string>>(() => new Map())
  const [unassignedText, setUnassignedText] = useState('')
  const [unassignedLoading, setUnassignedLoading] = useState(false)
  const [unassignedError, setUnassignedError] = useState('')
  const [namingOpen, setNamingOpen] = useState(false)
  const [downloadKind, setDownloadKind] = useState<DownloadKind>('nesting')
  const [downloadSheetIndex, setDownloadSheetIndex] = useState(0)
  const [exportLayerNames, setExportLayerNames] = useState(() => defaultExportLayerNames())
  const [pendingHiddenLayers, setPendingHiddenLayers] = useState<string[]>([])
  const [editLayersOpen, setEditLayersOpen] = useState(false)
  const [orderState, setOrderState] = useState<'idle' | 'placing' | 'placed'>('idle')
  const orderTimerRef = useRef<number | null>(null)

  const usePreloaded = preloadedSheets != null
  const isPage = variant === 'page'
  const assignedSheets = usePreloaded
    ? (preloadedSheets ?? []).filter((sheet) => sheet.kind !== 'unassigned').map((sheet) => ({
      index: sheet.index,
      dxfText: sheet.dxfText,
      label: sheet.label,
    }))
    : (jobId ? sheetCache.get(jobId) ?? [] : [])
  const assignedLoading = usePreloaded ? sheetsLoading : Boolean(jobId && loadingJobs.has(jobId))
  const assignedError = usePreloaded ? sheetsError : (jobId ? sheetErrors.get(jobId) ?? '' : '')
  const effectiveNested = nestedCount || Math.max(0, partCount - unassignedCount)
  const showUnassigned = unassignedCount > 0 && hasUnassignedDxf
  const viewingUnassigned = viewMode === 'detail' && sheetIndex === UNASSIGNED_SHEET_INDEX
  const activeSheet = assignedSheets.find((sheet) => sheet.index === sheetIndex)
  const materialFromLabel = activeSheet?.label?.match(/^(Kiefer|Film)/i)?.[1]
  const activeMaterial = materialFromLabel || defaultMaterial || emptyValue

  const viewerSheets = useMemo(() => {
    if (usePreloaded) {
      const list = [...(preloadedSheets ?? [])]
      if (showUnassigned && unassignedText && !list.some((sheet) => sheet.kind === 'unassigned')) {
        list.push({
          index: UNASSIGNED_SHEET_INDEX,
          dxfText: unassignedText,
          kind: 'unassigned',
        })
      }
      return list
    }
    const assigned = jobId ? sheetCache.get(jobId) ?? [] : []
    const list: NestingSheetPayload[] = assigned.map((sheet) => ({
      index: sheet.index,
      dxfText: sheet.dxfText,
      kind: 'sheet' as const,
      label: sheet.label,
    }))
    if (showUnassigned && unassignedText) {
      list.push({
        index: UNASSIGNED_SHEET_INDEX,
        dxfText: unassignedText,
        kind: 'unassigned',
      })
    }
    return list
  }, [jobId, sheetCache, showUnassigned, unassignedText, usePreloaded, preloadedSheets])

  useEffect(() => {
    if (!open) {
      loadedJobsRef.current.clear()
      setViewMode('overview')
      setSheetIndex(0)
      setSheetCache(new Map())
      setLoadingJobs(new Set())
      setSheetErrors(new Map())
      setUnassignedText('')
      setUnassignedLoading(false)
      setUnassignedError('')
      setNamingOpen(false)
      setEditLayersOpen(false)
      setOrderState('idle')
      if (orderTimerRef.current != null) {
        window.clearTimeout(orderTimerRef.current)
        orderTimerRef.current = null
      }
      return
    }
    setExportLayerNames(defaultExportLayerNames())
  }, [open])

  useEffect(() => {
    setOrderState('idle')
    if (orderTimerRef.current != null) {
      window.clearTimeout(orderTimerRef.current)
      orderTimerRef.current = null
    }
  }, [jobId])

  useEffect(() => () => {
    if (orderTimerRef.current != null) window.clearTimeout(orderTimerRef.current)
  }, [])

  useEffect(() => {
    if (!open || !jobId || usePreloaded) return
    const controller = new AbortController()

    void (async () => {
      if (loadedJobsRef.current.has(jobId)) return
      setLoadingJobs((current) => new Set(current).add(jobId))
      const done = nestingMark('fetch-sheets')
      try {
        // WAITING BFF: milling-package members via GET /api/artifacts/{artifactId}/download.
        // Main Simple Parts Flask has no /download/sheets or /download/sheet/:index — sheets
        // live in GET /api/jobs/:id/download (ZIP of nesting_001.dxf …). Stand-in only.
        const zipUrl = partsApi(`/jobs/${encodeURIComponent(jobId)}/download?filename=nesting.zip`)
        const collected = await loadSimplePartsNestingSheets(zipUrl, controller.signal)
        if (controller.signal.aborted) return
        setSheetCache((current) => {
          const next = new Map(current)
          next.set(jobId, collected.map((sheet) => ({
            index: sheet.index,
            dxfText: sheet.dxfText,
            label: sheet.label,
          })))
          return next
        })
        await yieldToBrowser()
        loadedJobsRef.current.add(jobId)
        done({ jobId, sheets: collected.length })
        nestingLog('fetch-sheets-done', { jobId, sheets: collected.length })
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        const message = error instanceof Error ? error.message : 'Failed to load sheets'
        setSheetErrors((current) => new Map(current).set(jobId, message))
        nestingLog('fetch-sheets-failed', { jobId, error: message })
      } finally {
        setLoadingJobs((current) => {
          const next = new Set(current)
          next.delete(jobId)
          return next
        })
      }
    })()

    return () => controller.abort()
  }, [jobId, open, usePreloaded])

  useEffect(() => {
    if (!open || !showUnassigned || !jobId || unassignedText || usePreloaded) return
    const controller = new AbortController()
    setUnassignedLoading(true)
    setUnassignedError('')
    const done = nestingMark('fetch-unassigned')
    // WAITING BFF: unassigned curves belong on the milling-package / run artifact download API
    // (GET /api/artifacts/{artifactId}/download). Flask /jobs/:id/download/unassigned is stand-in only.
    void fetch(partsApi(`/jobs/${encodeURIComponent(jobId)}/download/unassigned?filename=unassigned.dxf`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to load unassigned parts')
        const text = await response.text()
        setUnassignedText(text)
        done({ chars: text.length })
      })
      .catch((error: Error) => {
        if (error.name === 'AbortError') return
        setUnassignedError(error.message || 'Failed to load unassigned parts')
        nestingLog('fetch-unassigned-failed', { error: error.message })
      })
      .finally(() => setUnassignedLoading(false))
    return () => controller.abort()
  }, [jobId, open, showUnassigned, unassignedText, usePreloaded])

  useEffect(() => {
    requestAnimationFrame(() => sheetsViewerRef.current?.resize())
  }, [viewMode, assignedSheets.length, unassignedText, showUnassigned])

  const title = unassignedCount > 0
    ? `Nesting complete — ${effectiveNested} nested, ${unassignedCount} not nested`
    : partCount > 0
      ? `Nesting complete — ${partCount} part${partCount === 1 ? '' : 's'}`
      : `Nesting complete — ${Math.max(sheetCount, assignedSheets.length)} sheet${Math.max(sheetCount, assignedSheets.length) === 1 ? '' : 's'}`

  const metrics = useMemo(() => METRIC_ROWS.map(([key, label, kind, unit]) => {
    const number = Number(nestingMetrics?.[key])
    const display = nestingMetrics?.[key] == null || Number.isNaN(number)
      ? emptyValue
      : `${kind === 'int' ? Math.round(number).toLocaleString('de-DE') : number.toLocaleString('de-DE', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`
    return { key, label, display }
  }), [nestingMetrics, emptyValue])

  const openDetail = (index: number) => {
    nestingLog('enter-detail', { index })
    setSheetIndex(index)
    setViewMode('detail')
  }
  const backToOverview = () => {
    nestingLog('back-overview')
    setViewMode('overview')
  }

  const openNaming = (kind: DownloadKind, sheetIdx = 0) => {
    if (kind === 'nesting') {
      const hidden = viewMode === 'detail' ? sheetsViewerRef.current?.getHiddenLayers() ?? [] : []
      const all = viewMode === 'detail' ? sheetsViewerRef.current?.getLayerNames() ?? [] : []
      if (all.length && all.every((name) => hidden.includes(name))) {
        window.alert('No layers are visible. Show at least one layer to download.')
        return
      }
      setPendingHiddenLayers(hidden)
    }
    setDownloadKind(kind)
    setDownloadSheetIndex(sheetIdx)
    setNamingOpen(true)
  }

  const placeOrder = () => {
    if (orderState !== 'idle' || !jobId) return
    // WAITING BFF: Place Order will submit a manufacturing order via Platform BFF.
    setOrderState('placing')
    if (orderTimerRef.current != null) window.clearTimeout(orderTimerRef.current)
    orderTimerRef.current = window.setTimeout(() => {
      orderTimerRef.current = null
      setOrderState('placed')
    }, 1000)
  }

  const triggerDownload = (filename: string) => {
    // WAITING DATABASE: downloadable nesting artifacts should be owned by the job/artifact API.
    nestingLog('download-zip-click', { filename, kind: downloadKind, sheetIndex: downloadSheetIndex })
    const link = document.createElement('a')
    if (downloadKind === 'unassigned') {
      link.href = unassignedHref
        ? unassignedHref(filename)
        : partsApi(`/jobs/${jobId}/download/unassigned?filename=${encodeURIComponent(filename)}`)
    } else if (downloadKind === 'sheet') {
      const custom = sheetHref?.(downloadSheetIndex, filename)
      if (custom) {
        link.href = custom
      } else {
        // Main Flask has no per-sheet route; download the already-unpacked DXF.
        // WAITING BFF: single-sheet handout from milling-package artifact download.
        const sheet = assignedSheets.find((entry) => entry.index === downloadSheetIndex)
        if (!sheet?.dxfText) return
        const blob = new Blob([sheet.dxfText], { type: 'application/dxf' })
        link.href = URL.createObjectURL(blob)
        link.download = filename
        link.click()
        setTimeout(() => URL.revokeObjectURL(link.href), 2000)
        return
      }
    } else {
      const hidden = toCanonicalLayerNames(pendingHiddenLayers, exportLayerNames)
      const names = serializeLayerRenameMap(exportLayerNames)
      if (nestZipHref) {
        link.href = nestZipHref(filename, { excludeLayers: hidden, layerNames: names })
      } else {
        const params = new URLSearchParams({ filename })
        if (hidden.length) params.set('excludeLayers', hidden.join(','))
        if (names) params.set('layerNames', names)
        link.href = partsApi(`/jobs/${jobId}/download?${params}`)
      }
    }
    link.click()
  }

  const idsDisplay = formatUnassignedIdsDisplay(unassignedIds)
  const sheetTitle = activeSheet?.label ?? `Sheet ${sheetIndex + 1}`

  const railTop = (
    <section className="nesting-result__rail-section nesting-result__rail-top" aria-label="Context details">
      {viewMode === 'overview' ? (
        showUnassigned ? (
          <>
            <header className="nesting-result__rail-head">
              <h2 className="nesting-result__rail-title">Unassigned</h2>
              <p className="nesting-result__rail-sub">{unassignedCount} not nested</p>
            </header>
            <div className="nesting-result__rail-body">
              <p className="nesting-result__rail-copy">{effectiveNested} nested, {unassignedCount} not nested</p>
              {idsDisplay && <p className="nesting-result__rail-ids">{idsDisplay}</p>}
              {unassignedReasons.map((reason, index) => (
                <p key={`${reason}:${index}`} className="nesting-result__rail-reason">{reason}</p>
              ))}
              {unassignedError && <p className="nesting-result__rail-error">{unassignedError}</p>}
              <p className="nesting-result__rail-hint">
                Unassigned parts show <span className="legend-part-red">red</span> in the app viewer.
              </p>
            </div>
            <div className="nesting-result__rail-actions">
              <button
                type="button"
                className="nesting-result__rail-btn nesting-result__rail-btn--unassigned"
                disabled={!jobId || !hasUnassignedDxf}
                onClick={() => openNaming('unassigned')}
              >
                Download unassigned
              </button>
            </div>
          </>
        ) : (
          <>
            <header className="nesting-result__rail-head">
              <h2 className="nesting-result__rail-title">Overview</h2>
              <p className="nesting-result__rail-sub">All parts nested</p>
            </header>
            <div className="nesting-result__rail-body">
              <p className="nesting-result__rail-copy">Double-click a sheet viewport to inspect it.</p>
            </div>
          </>
        )
      ) : viewingUnassigned ? (
        <>
          <header className="nesting-result__rail-head">
            <h2 className="nesting-result__rail-title">Unassigned</h2>
            <p className="nesting-result__rail-sub">{unassignedCount} part{unassignedCount === 1 ? '' : 's'}</p>
          </header>
          <div className="nesting-result__rail-body">
            {idsDisplay && <p className="nesting-result__rail-ids">{idsDisplay}</p>}
            {unassignedReasons.map((reason, index) => (
              <p key={`${reason}:${index}`} className="nesting-result__rail-reason">{reason}</p>
            ))}
          </div>
          <div className="nesting-result__rail-actions">
            <button
              type="button"
              className="nesting-result__rail-btn nesting-result__rail-btn--unassigned"
              disabled={!jobId || !hasUnassignedDxf}
              onClick={() => openNaming('unassigned')}
            >
              Download unassigned
            </button>
          </div>
        </>
      ) : (
        <>
          <header className="nesting-result__rail-head">
            <h2 className="nesting-result__rail-title">{sheetTitle}</h2>
            <p className="nesting-result__rail-sub">
              of {Math.max(sheetCount, assignedSheets.length, 1)}
            </p>
          </header>
          <div className="nesting-result__rail-body">
            <dl className="nesting-result__rail-meta">
              <div>
                <dt>Size</dt>
                <dd>{sheetX != null && sheetY != null ? `${Math.round(sheetX)} × ${Math.round(sheetY)} mm` : emptyValue}</dd>
              </div>
              <div>
                <dt>Thickness</dt>
                <dd>{sheetThickness != null ? `${Math.round(sheetThickness)} mm` : emptyValue}</dd>
              </div>
              <div>
                <dt>Material</dt>
                <dd>{activeMaterial}</dd>
              </div>
            </dl>
          </div>
          <div className="nesting-result__rail-actions">
            <button
              type="button"
              className="nesting-result__rail-btn"
              disabled={!jobId}
              onClick={() => openNaming('sheet', sheetIndex)}
            >
              Download sheet
            </button>
          </div>
        </>
      )}
    </section>
  )

  const railBottom = (
    <section className="nesting-result__rail-section nesting-result__rail-bottom" aria-label="Nesting summary">
      <header className="nesting-result__rail-head">
        <h2 className="nesting-result__rail-title">Summary</h2>
        <p className="nesting-result__rail-sub">{title}</p>
      </header>
      <div className="nesting-result__rail-body">
        <table className="nesting-result__metrics-table">
          <tbody>
            {metrics.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="nesting-result__rail-actions">
        <button
          type="button"
          className="nesting-result__rail-btn nesting-result__rail-btn--primary"
          title={DOWNLOAD_HINT}
          disabled={!jobId}
          onClick={() => openNaming('nesting')}
        >
          Download ZIP
        </button>
        <button
          type="button"
          className={`nesting-result__rail-btn nesting-result__rail-btn--order${orderState === 'placed' ? ' is-placed' : ''}`}
          disabled={!jobId || orderState !== 'idle'}
          aria-busy={orderState === 'placing'}
          onClick={placeOrder}
        >
          {orderState === 'placing' ? (
            <>
              <span className="nesting-result__order-spinner" aria-hidden />
              Placing order…
            </>
          ) : orderState === 'placed' ? (
            <>
              <span className="nesting-result__order-check" aria-hidden>✓</span>
              Order Placed
            </>
          ) : (
            'Place Order'
          )}
        </button>
      </div>
    </section>
  )

  const stage = (
    <div className="nesting-result__stage">
      <div className="nesting-result__main">
        {viewMode === 'detail' && (
          <button type="button" className="nesting-result__back" onClick={backToOverview}>
            ← All sheets
          </button>
        )}
        {assignedError && <p className="nesting-result__viewer-empty">{assignedError}</p>}
        {jobId && !assignedError && (
          <NestingSheetsViewer
            ref={sheetsViewerRef}
            sheets={viewerSheets}
            mode={viewMode}
            activeIndex={sheetIndex}
            sheetCount={sheetCount}
            loading={assignedLoading}
            unassignedLoading={unassignedLoading}
            showUnassigned={showUnassigned}
            clampZoomToFit
            onSheetActivate={openDetail}
          />
        )}
        {!jobId && <p className="nesting-result__viewer-empty">No nesting job available.</p>}
      </div>
      <aside className="nesting-result__rail">
        {railTop}
        {railBottom}
      </aside>
    </div>
  )

  const pagePanel = (
    <div className="simpleparts-app nesting-result nesting-result--page" role="region" aria-labelledby="nesting-modal-title">
      <main className="simpleparts-main">
        <div className="simpleparts-view nesting-result__view">
          <p id="nesting-modal-title" className="sr-only">{title}</p>
          {stage}
        </div>
      </main>
    </div>
  )

  const modalPanel = (
    <div className="nesting-modal__panel nesting-result">
      <header className="nesting-modal__header">
        <h2 id="nesting-modal-title" className="nesting-modal__title">{title}</h2>
        <button type="button" className="nesting-modal__close" aria-label="Close" onClick={onClose}>×</button>
      </header>
      {stage}
    </div>
  )

  return <>
    {open && isPage && pagePanel}
    {open && !isPage && createPortal(
      <div className="nesting-modal" role="dialog" aria-modal="true" aria-labelledby="nesting-modal-title">
        <div className="nesting-modal__backdrop" onClick={onClose} />
        {modalPanel}
      </div>,
      document.body,
    )}
    <DownloadFileNamingPanelComponent
      open={namingOpen}
      downloadKind={downloadKind === 'sheet' ? 'sheet' : downloadKind}
      sheetX={sheetX}
      sheetY={sheetY}
      sheetThickness={sheetThickness}
      defaultMaterial={defaultMaterial}
      onClose={() => setNamingOpen(false)}
      onConfirm={({ filename }) => {
        triggerDownload(filename)
        setNamingOpen(false)
      }}
    />
    <EditLayerNamesPanelComponent
      open={editLayersOpen}
      layerNames={exportLayerNames}
      onClose={() => setEditLayersOpen(false)}
      onConfirm={(names) => {
        setExportLayerNames(names)
        setEditLayersOpen(false)
      }}
    />
  </>
}
