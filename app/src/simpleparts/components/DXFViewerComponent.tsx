import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { parseDxf } from 'dxf-render'
import * as THREE from 'three'
import PartMetadataPanel from './PartMetadataPanel'
import Dxf2DViewer from './Dxf2DViewer'
import PlanView3DViewer from './PlanView3DViewer'
import PartTagBubble, { type PartTagLabel } from './PartTagBubble'
import BlockMarkerOverlay, { type BlockMarkerOverlayHandle } from './BlockMarkerOverlay'
import { readPartColor, readPartColorHex, colorNameForMaterial } from '../partColors.js'
import {
  applyLayerRenameToParsedDxf,
  boundaryForHandle,
  isLayerOutlier,
  isSchemeOutlierDisplay,
  normalizeHandle,
  pointInBoundary,
} from '../boundaryDetection.js'
import { buildOutputDxf } from '../boundaryView.js'
import { filterDimensionEntities } from '../dimensionFilter.js'
import { is3dDxf } from '../dxfDetection.js'
import {
  applyMetadataByPartKeys,
  boundaryEffectiveMeta,
  legacyBoundaryAliasKeys,
  partKeyForBoundary,
} from '../features/metadata/partRegistry.js'
import type { BlockInsert, CameraState, MetadataOverrides, PartBoundary, UnknownRecord, ViewerHandle } from '../types'
import '../simpleparts-react.css'

export interface DXFViewerHandle {
  selectPartByHandle(handle: string): boolean
  resize(): void
  getHiddenLayers(): string[]
  getLayerNames(): string[]
  getCamera(): any
  getControls(): any
  getOriginOffset(): { x: number; y: number; z: number }
  captureCameraState(): CameraState | null
  restoreCameraState(state: CameraState | null): void
  setControlsChangeListener(listener: (() => void) | null): void
}

interface DXFViewerProps {
  dxfText?: string
  boundaries?: PartBoundary[]
  blockInserts?: BlockInsert[]
  markerShape?: string
  markerSizeMm?: number | null
  viewMode?: 'input' | 'output'
  showOutlierLines?: boolean
  showSchemeOutliers?: boolean
  schemeOutliers?: UnknownRecord[]
  showMetadataColors?: boolean
  showModifiedPartsGreen?: boolean
  showCorrectParts?: boolean
  showIncorrectParts?: boolean
  showPartLabels?: boolean
  showDimensions?: boolean
  includeOutputText?: boolean
  annotationDxf?: UnknownRecord | null
  clickForProperties?: boolean
  showPropertiesPanel?: boolean
  selectionEnabled?: boolean
  showLayerPanel?: boolean
  showEditLayers?: boolean
  exportLayerNames?: Record<string, string> | null
  modifiedHandles?: string[]
  metadataOverrides?: MetadataOverrides
  selectedHandles?: string[]
  onMetadataOverridesChange?: (overrides: MetadataOverrides) => void
  onSelectedHandlesChange?: (handles: string[]) => void
  onMarkModified?: (id: string) => void
  onEditLayers?: () => void
}

const META_KEYS = new Set(['Nr', 'Mat', 'Anz'])
const TEXT_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB'])
const VARIES = '<varies>'
const DRAG_THRESHOLD_PX = 4
const MIN_RECT_SELECT_PX = 10

interface SelectionRectangle {
  left: number
  top: number
  width: number
  height: number
  mode: 'window' | 'crossing'
}

function readMeta(entity: UnknownRecord) {
  const strings = entity.extendedData?.customStrings as string[] | undefined
  const meta: UnknownRecord = {}
  for (let index = 0; strings && index < strings.length - 1; index++) {
    if (META_KEYS.has(strings[index])) meta[strings[index]] = String(strings[index + 1]).trim()
  }
  return meta
}

function cloneDxf(dxf: UnknownRecord) {
  return {
    ...dxf,
    entities: (dxf.entities ?? []).map((entity: UnknownRecord) => ({ ...entity })),
    blocks: Object.fromEntries(Object.entries(dxf.blocks ?? {}).map(([key, value]: [string, any]) => [
      key,
      { ...value, entities: (value.entities ?? []).map((entity: UnknownRecord) => ({ ...entity })) },
    ])),
  }
}

const DXFViewerComponent = forwardRef<DXFViewerHandle, DXFViewerProps>(function DXFViewerComponent({
  dxfText = '',
  boundaries = [],
  blockInserts = [],
  markerShape = 'cross',
  markerSizeMm = null,
  viewMode = 'input',
  showOutlierLines = false,
  showSchemeOutliers = false,
  schemeOutliers = [],
  showMetadataColors = false,
  showModifiedPartsGreen = false,
  showCorrectParts = false,
  showIncorrectParts = false,
  showPartLabels = false,
  showDimensions = true,
  includeOutputText = false,
  annotationDxf = null,
  clickForProperties = false,
  showPropertiesPanel = false,
  selectionEnabled = true,
  showLayerPanel = true,
  showEditLayers = false,
  exportLayerNames = null,
  modifiedHandles = [],
  metadataOverrides = {},
  selectedHandles = [],
  onMetadataOverridesChange,
  onSelectedHandlesChange,
  onMarkModified,
  onEditLayers,
}, ref) {
  const backendRef = useRef<ViewerHandle>(null)
  const blockMarkerRef = useRef<BlockMarkerOverlayHandle>(null)
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([])
  const [panelPoint, setPanelPoint] = useState<{ x: number; y: number } | null>(null)
  const [cameraTick, setCameraTick] = useState(0)
  const [savedCamera, setSavedCamera] = useState<CameraState | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectionRect, setSelectionRect] = useState<SelectionRectangle | null>(null)
  const pointerStart = useRef({ x: 0, y: 0 })
  const leftPointerDown = useRef(false)
  const pointerDragged = useRef(false)

  const boundaryMeta = (boundary: PartBoundary) => boundaryEffectiveMeta(boundary, metadataOverrides)
  const visibleBoundaries = useMemo(() => {
    if (!showCorrectParts && !showIncorrectParts) return boundaries
    return boundaries.filter((boundary) => {
      const meta = boundaryEffectiveMeta(boundary, metadataOverrides)
      const complete = Boolean(String(meta.Nr ?? '').trim() && String(meta.Mat ?? '').trim() && String(meta.Anz ?? '').trim())
      return (complete && showCorrectParts) || (!complete && showIncorrectParts)
    })
  }, [boundaries, metadataOverrides, showCorrectParts, showIncorrectParts])
  const visibleBlockInserts = useMemo(() => {
    if (!showCorrectParts && !showIncorrectParts) return blockInserts
    const visibleIds = new Set(visibleBoundaries.map((boundary) => boundary.id))
    return blockInserts.filter((block) => {
      let best: PartBoundary | null = null
      let bestArea = Infinity
      for (const boundary of boundaries) {
        if (!pointInBoundary(block.x, block.y, boundary)) continue
        const box = boundary.bbox
        const area = box ? (box.maxX - box.minX) * (box.maxY - box.minY) : Infinity
        if (area < bestArea) {
          best = boundary
          bestArea = area
        }
      }
      return best != null && visibleIds.has(best.id)
    })
  }, [blockInserts, boundaries, showCorrectParts, showIncorrectParts, visibleBoundaries])

  const parsed = useMemo(() => {
    if (!dxfText) return null
    try {
      let dxf = cloneDxf(parseDxf(dxfText))
      if (annotationDxf?.entities?.length) dxf.entities.push(...annotationDxf.entities.map((entity: UnknownRecord) => ({ ...entity })))
      const threeD = is3dDxf(dxf)
      if (viewMode === 'output' && !threeD && boundaries.length && (showOutlierLines || showSchemeOutliers || showCorrectParts || showIncorrectParts)) {
        dxf = buildOutputDxf(dxf, visibleBoundaries, { showOutlierLines, showSchemeOutliers, schemeOutliers: schemeOutliers as never[], includeText: includeOutputText })
      }
      for (const entity of dxf.entities ?? []) {
        if (TEXT_TYPES.has(entity.type)) continue
        const handle = String(entity.handle ?? '')
        const boundary = boundaryForHandle(handle, boundaries)
        const meta = boundary ? boundaryEffectiveMeta(boundary, metadataOverrides) : { ...readMeta(entity), ...(metadataOverrides[handle] ?? {}) }
        let colorName = 'default'
        if (showMetadataColors) colorName = String(meta.Mat ?? '').trim() ? colorNameForMaterial(meta.Mat) : 'red'
        else if (showModifiedPartsGreen && (modifiedHandles.includes(handle) || (boundary && legacyBoundaryAliasKeys(boundary).some((key: string) => modifiedHandles.includes(key))))) colorName = 'green'
        if (isLayerOutlier(handle, boundaries)) colorName = 'orange'
        if (showSchemeOutliers && isSchemeOutlierDisplay(handle, schemeOutliers, boundaries)) colorName = 'pink'
        entity.color = readPartColor(colorName)
        entity.colorIndex = 7
      }
      if (viewMode === 'input' && !showDimensions) dxf = filterDimensionEntities(dxf)
      if (exportLayerNames) applyLayerRenameToParsedDxf(dxf, exportLayerNames)
      return dxf
    } catch {
      return null
    }
  }, [annotationDxf, boundaries, dxfText, exportLayerNames, includeOutputText, metadataOverrides, modifiedHandles, schemeOutliers, showCorrectParts, showDimensions, showIncorrectParts, showMetadataColors, showModifiedPartsGreen, showOutlierLines, showSchemeOutliers, viewMode, visibleBoundaries])

  const is3d = parsed ? is3dDxf(parsed) : false
  const entityByHandle = useMemo(() => new Map((parsed?.entities ?? []).map((entity: UnknownRecord) => [normalizeHandle(entity.handle), entity])), [parsed])
  const setSelection = (handles: string[], point?: { x: number; y: number } | null, additive = false) => {
    const next = additive
      ? [...new Set([...selectedHandles, ...handles])]
      : handles
    setSelectedBlockId(null)
    onSelectedHandlesChange?.(next)
    setPanelPoint(point ?? null)
    backendRef.current?.applyHighlight(next)
  }
  const worldFromClient = (clientX: number, clientY: number) => {
    const camera = backendRef.current?.getCamera()
    const canvas = backendRef.current?.getCanvas()
    const origin = backendRef.current?.getOriginOffset()
    if (!camera || !canvas || !origin) return null
    const rect = canvas.getBoundingClientRect()
    const point = new THREE.Vector3(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0).unproject(camera)
    return { x: point.x + origin.x, y: point.y + origin.y }
  }
  const blockAtClientPoint = (clientX: number, clientY: number) => {
    if (viewMode !== 'output' || !visibleBlockInserts.length) return null
    const element = backendRef.current?.getContainerEl()
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const markerWorldSize = markerShape === 'circle' && markerSizeMm ? markerSizeMm : 40
    const hitRadius = Math.max(markerWorldSize * pixelsPerWorld() / 2, 6)
    let nearest: BlockInsert | null = null
    let nearestDistance = Infinity
    for (const block of visibleBlockInserts) {
      const point = projectWorld(block.x, block.y)
      const distance = (x - point.left) ** 2 + (y - point.top) ** 2
      if (distance <= hitRadius ** 2 && distance < nearestDistance) {
        nearest = block
        nearestDistance = distance
      }
    }
    return nearest
  }
  const selectBlock = (block: BlockInsert) => {
    onSelectedHandlesChange?.([])
    backendRef.current?.clearHighlight()
    setSelectedBlockId(block.id)
    setPanelPoint((clickForProperties || showPropertiesPanel) ? { x: block.x, y: block.y } : null)
  }
  const rectangleMode = (startX: number, endX: number): SelectionRectangle['mode'] => endX >= startX ? 'window' : 'crossing'
  const bboxMatches = (box: PartBoundary['bbox'], rect: { minX: number; minY: number; maxX: number; maxY: number }, mode: SelectionRectangle['mode']) => {
    if (!box) return false
    if (mode === 'window') {
      return box.minX >= rect.minX && box.maxX <= rect.maxX
        && box.minY >= rect.minY && box.maxY <= rect.maxY
    }
    return box.maxX >= rect.minX && box.minX <= rect.maxX
      && box.maxY >= rect.minY && box.minY <= rect.maxY
  }
  const handlesInClientRect = (startX: number, startY: number, endX: number, endY: number) => {
    const start = worldFromClient(startX, startY)
    const end = worldFromClient(endX, endY)
    if (!start || !end) return []
    const mode = rectangleMode(startX, endX)
    const rect = {
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    }
    const selectableBoundaries = viewMode === 'output' ? visibleBoundaries : boundaries
    if (selectableBoundaries.length) {
      const members = selectableBoundaries
        .filter((boundary) => bboxMatches(boundary.bbox, rect, mode))
        .flatMap((boundary) => boundary.memberHandles.map(String))
      if (members.length) return [...new Set(members)]
    }
    return backendRef.current?.pickInRect?.(rect, mode) ?? []
  }
  const isViewerUiTarget = (target: EventTarget | null) => target instanceof Element
    && Boolean(target.closest('.part-metadata-panel, .viewer-layer-stack'))
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isViewerUiTarget(event.target)) return
    leftPointerDown.current = true
    pointerDragged.current = false
    pointerStart.current = { x: event.clientX, y: event.clientY }
    setSelectionRect(null)
    if (selectionEnabled) event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectionEnabled || !leftPointerDown.current || !(event.buttons & 1)) return
    const distance = Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y)
    if (distance <= DRAG_THRESHOLD_PX) return
    pointerDragged.current = true
    const shellRect = event.currentTarget.getBoundingClientRect()
    setSelectionRect({
      left: Math.min(pointerStart.current.x, event.clientX) - shellRect.left,
      top: Math.min(pointerStart.current.y, event.clientY) - shellRect.top,
      width: Math.abs(event.clientX - pointerStart.current.x),
      height: Math.abs(event.clientY - pointerStart.current.y),
      mode: rectangleMode(pointerStart.current.x, event.clientX),
    })
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !leftPointerDown.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    leftPointerDown.current = false
    setSelectionRect(null)
    if (!selectionEnabled || isViewerUiTarget(event.target)) return
    const width = Math.abs(event.clientX - pointerStart.current.x)
    const height = Math.abs(event.clientY - pointerStart.current.y)
    if (pointerDragged.current && Math.max(width, height) >= MIN_RECT_SELECT_PX) {
      const handles = handlesInClientRect(pointerStart.current.x, pointerStart.current.y, event.clientX, event.clientY)
      const midpoint = worldFromClient((pointerStart.current.x + event.clientX) / 2, (pointerStart.current.y + event.clientY) / 2)
      setSelection(handles, midpoint, event.shiftKey || event.ctrlKey || event.metaKey)
      return
    }
    const block = blockAtClientPoint(event.clientX, event.clientY)
    if (block) {
      selectBlock(block)
      return
    }
    const pick = backendRef.current?.pickAtClient?.(event.clientX, event.clientY)
    if (pick?.handle && selectHandle(String(pick.handle), worldFromClient(event.clientX, event.clientY), event.shiftKey || event.ctrlKey || event.metaKey)) return
    const world = worldFromClient(event.clientX, event.clientY)
    const selectableBoundaries = viewMode === 'output' ? visibleBoundaries : boundaries
    const containing = world && selectableBoundaries
      .filter((boundary) => pointInBoundary(world.x, world.y, boundary))
      .sort((left, right) => {
        const leftArea = left.bbox ? (left.bbox.maxX - left.bbox.minX) * (left.bbox.maxY - left.bbox.minY) : Infinity
        const rightArea = right.bbox ? (right.bbox.maxX - right.bbox.minX) * (right.bbox.maxY - right.bbox.minY) : Infinity
        return leftArea - rightArea
      })[0]
    if (containing && world) selectHandle(containing.id, world, event.shiftKey || event.ctrlKey || event.metaKey)
    else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) setSelection([])
  }
  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    leftPointerDown.current = false
    setSelectionRect(null)
  }
  const selectHandle = (rawHandle: string, point?: { x: number; y: number } | null, additive = false) => {
    let handle = normalizeHandle(rawHandle)
    if (!handle) return false
    const boundary = boundaryForHandle(handle, boundaries)
    if (boundary) handle = boundary.id
    const handles: string[] = boundary ? (boundary.memberHandles as unknown[]).map(String) : [handle]
    if (additive && handles.every((member) => selectedHandles.includes(member))) {
      const removing = new Set(handles)
      setSelection(selectedHandles.filter((member) => !removing.has(member)), point)
    } else {
      setSelection(handles, point ?? (boundary?.bbox ? { x: boundary.bbox.centerX, y: boundary.bbox.centerY } : null), additive)
    }
    return true
  }

  useImperativeHandle(ref, () => ({
    selectPartByHandle: selectHandle,
    resize: () => backendRef.current?.resize(),
    getHiddenLayers: () => [...hiddenLayers],
    getLayerNames: () => [...new Set<string>((parsed?.entities ?? []).map((entity: UnknownRecord) => String(entity.layer ?? '0')))].sort(),
    getCamera: () => backendRef.current?.getCamera(),
    getControls: () => backendRef.current?.getControls(),
    getOriginOffset: () => backendRef.current?.getOriginOffset() ?? { x: 0, y: 0, z: 0 },
    captureCameraState: () => backendRef.current?.captureCameraState() ?? null,
    restoreCameraState: (state) => backendRef.current?.restoreCameraState(state),
    setControlsChangeListener: (listener) => backendRef.current?.setControlsChangeListener(listener),
  }), [hiddenLayers, parsed])

  useEffect(() => {
    setHiddenLayers([])
    setSelection([])
    setSelectedBlockId(null)
    setSavedCamera(null)
  }, [dxfText])
  useEffect(() => {
    if (!selectionEnabled || (!clickForProperties && !showPropertiesPanel)) setPanelPoint(null)
  }, [clickForProperties, selectionEnabled, showPropertiesPanel])
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => event.key === 'Escape' && setSelection([])
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })

  const selectionMeta = useMemo(() => {
    if (selectedBlockId) {
      const block = blockInserts.find((item) => item.id === selectedBlockId)
      return { nr: block?.name ?? '', mat: '', anz: '' }
    }
    if (!selectedHandles.length) return { nr: '', mat: '', anz: '' }
    const values = selectedHandles.map((handle) => {
      const boundary = boundaryForHandle(handle, boundaries)
      const meta = boundary ? boundaryMeta(boundary) : { ...readMeta(entityByHandle.get(normalizeHandle(handle)) ?? {}), ...(metadataOverrides[handle] ?? {}) }
      return { nr: String(meta.Nr ?? ''), mat: String(meta.Mat ?? ''), anz: String(meta.Anz ?? '') }
    })
    const aggregate = (key: 'nr' | 'mat' | 'anz') => values.every((value) => value[key] === values[0][key]) ? values[0][key] : VARIES
    return { nr: aggregate('nr'), mat: aggregate('mat'), anz: aggregate('anz') }
  }, [blockInserts, boundaries, entityByHandle, metadataOverrides, selectedBlockId, selectedHandles])
  const panelStyle = useMemo(() => {
    void cameraTick
    if (!panelPoint) return undefined
    const camera = backendRef.current?.getCamera()
    const origin = backendRef.current?.getOriginOffset()
    const element = backendRef.current?.getContainerEl()
    if (!camera || !origin || !element) return undefined
    const projected = new THREE.Vector3(panelPoint.x - origin.x, panelPoint.y - origin.y, 0).project(camera)
    const rect = element.getBoundingClientRect()
    return { left: (projected.x + 1) * rect.width / 2, top: (-projected.y + 1) * rect.height / 2 }
  }, [cameraTick, panelPoint])
  const updateMetadata = (field: 'nr' | 'anz', value: string) => {
    const keys = new Set(selectedHandles.map((handle) => {
      const boundary = boundaryForHandle(handle, boundaries)
      return boundary ? partKeyForBoundary(boundary) : handle
    }))
    const next = applyMetadataByPartKeys({ partKeys: [...keys], field, value, metadataOverrides })
    onMetadataOverridesChange?.(next)
    keys.forEach((key) => onMarkModified?.(key))
    setSavedCamera(backendRef.current?.captureCameraState() ?? null)
  }
  const projectWorld = (x: number, y: number) => {
    const camera = backendRef.current?.getCamera()
    const origin = backendRef.current?.getOriginOffset()
    const element = backendRef.current?.getContainerEl()
    if (!camera || !origin || !element) return { left: 0, top: 0 }
    const point = new THREE.Vector3(x - origin.x, y - origin.y, 0).project(camera)
    const rect = element.getBoundingClientRect()
    return { left: (point.x + 1) * rect.width / 2, top: (-point.y + 1) * rect.height / 2 }
  }
  const pixelsPerWorld = () => {
    const camera = backendRef.current?.getCamera()
    const element = backendRef.current?.getContainerEl()
    return camera && element ? element.clientHeight / (camera.top - camera.bottom) * camera.zoom : 1
  }
  const labels = useMemo(() => {
    void cameraTick
    if (!showPartLabels) return []
    return visibleBoundaries.flatMap((boundary) => {
      if (!boundary.bbox) return []
      const text = String(boundaryMeta(boundary).Nr ?? '').trim() || '?'
      const screen = projectWorld(boundary.bbox.centerX, boundary.bbox.centerY)
      const partWidth = (boundary.bbox.maxX - boundary.bbox.minX) * pixelsPerWorld()
      const mode = partWidth >= text.length * 7.2 + 16 ? 'text' : 'dot'
      return [{ ...screen, mode, text, fontSize: 12, dotSize: 8 } as PartTagLabel]
    })
  }, [cameraTick, metadataOverrides, showPartLabels, visibleBoundaries])
  useEffect(() => {
    if (viewMode !== 'output' || !visibleBlockInserts.length) return
    const size = (markerShape === 'circle' && markerSizeMm ? markerSizeMm : 40) * pixelsPerWorld()
    blockMarkerRef.current?.redraw(projectWorld, size, selectedBlockId ?? '', markerShape)
  }, [cameraTick, markerShape, markerSizeMm, selectedBlockId, viewMode, visibleBlockInserts])
  useEffect(() => {
    if (selectedBlockId && !visibleBlockInserts.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(null)
      setPanelPoint(null)
    }
  }, [selectedBlockId, visibleBlockInserts])

  if (!parsed) return null
  const common = {
    ref: backendRef,
    dxf: parsed,
    cameraStateToRestore: savedCamera,
    hiddenLayers,
    showLayerPanel,
    showEditLayers,
    highlightColor: Number.parseInt(readPartColorHex('orange').replace('#', ''), 16),
    selectedHandles,
    onHiddenLayersChange: setHiddenLayers,
    onEditLayers,
    onReady: () => {
      backendRef.current?.applyHighlight(selectedHandles)
      backendRef.current?.setControlsChangeListener(() => setCameraTick((tick) => tick + 1))
      setCameraTick((tick) => tick + 1)
    },
  }
  return (
    <div
      className="viewer-shell"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => { if (!leftPointerDown.current) setSelectionRect(null) }}
    >
      {is3d ? (
        <PlanView3DViewer {...common} shadedHandlesFromSelection={(handles) => handles} />
      ) : (
        <Dxf2DViewer
          {...common}
          pickingEnabled={selectionEnabled}
          highlightSafeHandles={(handles) => handles}
        />
      )}
      {showPartLabels && <PartTagBubble labels={labels} />}
      {viewMode === 'output' && visibleBlockInserts.length > 0 && <BlockMarkerOverlay ref={blockMarkerRef} markers={visibleBlockInserts} selectedId={selectedBlockId ?? ''} markerShape={markerShape} />}
      {selectionRect && (
        <div
          className={`selection-rect selection-rect--${selectionRect.mode}`}
          style={{ left: selectionRect.left, top: selectionRect.top, width: selectionRect.width, height: selectionRect.height }}
        />
      )}
      {(clickForProperties || showPropertiesPanel) && (selectedHandles.length > 0 || selectedBlockId) && panelStyle && <PartMetadataPanel {...selectionMeta} style={panelStyle} onUpdate={updateMetadata} />}
    </div>
  )
})

export default DXFViewerComponent
