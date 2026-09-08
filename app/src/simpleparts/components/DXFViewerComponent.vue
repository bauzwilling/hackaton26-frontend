<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  parseDxf,
  buildPickingIndex,
  buildWorldRect,
  resolveSelectionMode,
} from 'dxf-vuer'
import { buildEntityIndex } from 'dxf-render'
import * as THREE from 'three'
import PartTagBubble from './PartTagBubble.vue'
import BlockMarkerOverlay from './BlockMarkerOverlay.vue'
import PartMetadataPanel from './PartMetadataPanel.vue'
import Dxf2DViewer from './Dxf2DViewer.vue'
import PlanView3DViewer from './PlanView3DViewer.vue'
import { readPartColor, readPartColorHex, colorNameForMaterial } from '../partColors.js'
import {
  boundaryForHandle,
  findClosedChainMembers,
  isLayerOutlier,
  isSchemeOutlierDisplay,
  applyLayerRenameToParsedDxf,
  NESTING_LAYER_COLOR,
  normalizeHandle,
  pointInBoundary,
  schemeOutliersForDisplay,
  topLevelBoundaries,
} from '../boundaryDetection.js'
import { buildOutputDxf, SCAN_DIM_LAYER } from '../boundaryView.js'
import { filterDimensionEntities } from '../dimensionFilter.js'
import { isLineEntity, pickEntryAtWorldPoint } from '../geometryPick.js'
import { is3dDxf } from '../dxfDetection.js'
import {
  applyMetadataByPartKeys,
  boundaryEffectiveMeta,
  partKeyForBoundary,
  legacyBoundaryAliasKeys,
} from '../features/metadata/partRegistry.js'
import 'dxf-vuer/style.css'

const props = defineProps({
  dxfText: String,
  boundaries: { type: Array, default: () => [] },
  blockInserts: { type: Array, default: () => [] },
  markerShape: { type: String, default: 'cross' },
  markerSizeMm: { type: Number, default: null },
  viewMode: { type: String, default: 'input' },
  showOutlierLines: { type: Boolean, default: false },
  showSchemeOutliers: { type: Boolean, default: false },
  schemeOutliers: { type: Array, default: () => [] },
  showMetadataColors: { type: Boolean, default: false },
  showModifiedPartsGreen: { type: Boolean, default: false },
  showCorrectParts: { type: Boolean, default: false },
  showIncorrectParts: { type: Boolean, default: false },
  showPartLabels: { type: Boolean, default: false },
  showDimensions: { type: Boolean, default: true },
  includeOutputText: { type: Boolean, default: false },
  annotationDxf: { type: Object, default: null },
  clickForProperties: { type: Boolean, default: false },
  showPropertiesPanel: { type: Boolean, default: false },
  selectionEnabled: { type: Boolean, default: true },
  showLayerPanel: { type: Boolean, default: true },
  showEditLayers: { type: Boolean, default: false },
  /** Canonical → export display names for nesting LayerPanel / entities. */
  exportLayerNames: { type: Object, default: null },
  modifiedHandles: { type: Array, default: () => [] },
})

const emit = defineEmits(['mark-modified', 'edit-layers'])

const metadataOverrides = defineModel('metadataOverrides', { default: () => ({}) })
const selectedHandles = defineModel('selectedHandles', { default: () => [] })
const META_KEYS = new Set(['Nr', 'Mat', 'Anz'])
const TEXT_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB'])

function safeFilename(name) {
  const n = String(name ?? '').replace(/\s+/g, '').trim().replace(/[\\/:*?"<>|]/g, '_')
  return n || 'UNNAMED'
}

function cssVarRgb(name) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return parseInt(hex.replace(/^#/, ''), 16)
}

function readMeta(entity) {
  const strings = entity.extendedData?.customStrings
  if (!strings?.length) return {}

  const meta = {}
  for (let i = 0; i < strings.length - 1; i++) {
    const key = strings[i]
    if (META_KEYS.has(key)) meta[key] = String(strings[i + 1]).trim()
  }
  return meta
}

function isClosedBoundary(entity) {
  if (props.boundaries.length) {
    return boundaryForHandle(entity.handle, props.boundaries) !== null
  }
  if (entity.type === 'CIRCLE' || entity.type === 'ELLIPSE') return true
  if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
    return entity.shape === true || entity.isPolyfaceMesh === true
  }
  return false
}

function isModifiedPartKey(key) {
  const id = String(key ?? '').trim()
  return id && props.modifiedHandles.includes(id)
}

function isModifiedBoundary(boundary) {
  if (!boundary) return false
  return legacyBoundaryAliasKeys(boundary).some((key) => isModifiedPartKey(key))
}

function boundaryMeta(boundary) {
  return boundaryEffectiveMeta(boundary, metadataOverrides.value)
}

function effectiveMeta(entity) {
  const boundary = boundaryForHandle(entity.handle, props.boundaries)
  if (boundary) return boundaryMeta(boundary)
  const fromDxf = readMeta(entity)
  const ov = metadataOverrides.value[String(entity.handle)] ?? {}
  return {
    Nr: ov.nr ?? fromDxf.Nr ?? '',
    Mat: ov.mat ?? fromDxf.Mat ?? '',
    Anz: ov.anz ?? fromDxf.Anz ?? '',
  }
}

function isMissingSerial(meta) {
  const nr = meta.Nr ?? ''
  return !nr || safeFilename(nr) === 'UNNAMED'
}

function isMissingMaterial(meta) {
  return !String(meta.Mat ?? '').trim()
}

function isMissingAnz(meta) {
  return !String(meta.Anz ?? '').trim()
}

function isCompleteMetadata(meta) {
  return !isMissingSerial(meta) && !isMissingMaterial(meta) && !isMissingAnz(meta)
}

function applyEntityColor(entity, rgb) {
  entity.color = rgb
  entity.colorIndex = 7
}

function cloneDxfForColoring(dxf) {
  const blocks = {}
  if (dxf.blocks) {
    for (const [name, block] of Object.entries(dxf.blocks)) {
      blocks[name] = {
        ...block,
        entities: (block.entities ?? []).map((entity) => ({ ...entity })),
      }
    }
  }
  return {
    ...dxf,
    entities: (dxf.entities ?? []).map((entity) => ({ ...entity })),
    blocks,
  }
}

function forEachEntityList(dxf, fn) {
  fn(dxf.entities ?? [])
  if (!dxf.blocks) return
  for (const block of Object.values(dxf.blocks)) {
    fn(block.entities ?? [])
  }
}

function pieceColorName(meta, handle, boundary = null) {
  if (handle && props.boundaries.length && isLayerOutlier(handle, props.boundaries)) {
    return 'orange'
  }

  if (
    props.showModifiedPartsGreen
    && !props.showMetadataColors
    && (isModifiedPartKey(handle) || isModifiedBoundary(boundary))
  ) {
    return 'green'
  }

  if (props.showMetadataColors) {
    if (!String(meta.Mat ?? '').trim()) return 'red'
    return colorNameForMaterial(meta.Mat)
  }

  return 'default'
}

function colorPreviewCurves(dxf) {
  const curveColor = readPartColor('default')
  forEachEntityList(dxf, (entities) => {
    for (const entity of entities) {
      if (TEXT_TYPES.has(entity.type)) continue
      applyEntityColor(entity, curveColor)
    }
  })
}

function colorPieces(dxf) {
  if (props.boundaries.length) {
    for (const boundary of props.boundaries) {
      const meta = boundaryMeta(boundary)
      const colorName = pieceColorName(meta, boundary.id, boundary)
      const color = readPartColor(colorName)

      const boundaryEntity = dxf.entities.find((e) => String(e.handle) === boundary.id)
      if (boundaryEntity) {
        applyEntityColor(boundaryEntity, color)
      }

      for (const handle of boundary.memberHandles) {
        const entity = dxf.entities.find((e) => String(e.handle) === handle)
        if (!entity) continue
        const entityColor = isLayerOutlier(handle, props.boundaries) ? readPartColor('orange') : color
        applyEntityColor(entity, entityColor)
      }
    }
    return
  }

  const curveColor = readPartColor('default')
  const green = readPartColor('green')
  forEachEntityList(dxf, (entities) => {
    for (const entity of entities) {
      if (TEXT_TYPES.has(entity.type)) continue
      const handle = String(entity.handle)
      const isModified = props.showModifiedPartsGreen && props.modifiedHandles.includes(handle)
      applyEntityColor(entity, isModified ? green : curveColor)
    }
  })
}

function boundaryForBlockPoint(x, y, boundaries) {
  let best = null
  let bestArea = Infinity
  for (const b of boundaries) {
    const bbox = b.bbox
    if (bbox && (x < bbox.minX || x > bbox.maxX || y < bbox.minY || y > bbox.maxY)) continue
    if (!pointInBoundary(x, y, b)) continue
    const area = bbox
      ? (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY)
      : Infinity
    if (area < bestArea) {
      best = b
      bestArea = area
    }
  }
  return best
}

const visibleOutputBoundariesList = computed(() => {
  const filtering = props.showCorrectParts || props.showIncorrectParts
  if (!filtering) return props.boundaries
  return props.boundaries.filter((b) => {
    const complete = isCompleteMetadata(boundaryMeta(b))
    return (complete && props.showCorrectParts) || (!complete && props.showIncorrectParts)
  })
})

const blockBoundaryByBlockId = computed(() => {
  const map = new Map()
  if (!props.blockInserts.length || !props.boundaries.length) return map
  for (const block of props.blockInserts) {
    const boundary = boundaryForBlockPoint(block.x, block.y, props.boundaries)
    if (boundary) map.set(block.id, boundary.id)
  }
  return map
})

const visibleBlockInsertsList = computed(() => {
  const filtering = props.showCorrectParts || props.showIncorrectParts
  if (!filtering) return props.blockInserts
  const visibleIds = new Set(visibleOutputBoundariesList.value.map((b) => b.id))
  return props.blockInserts.filter((block) => {
    const boundaryId = blockBoundaryByBlockId.value.get(block.id)
    return boundaryId && visibleIds.has(boundaryId)
  })
})

function colorSchemeOutlierEntities(dxf) {
  const pink = readPartColor('pink')
  const visible = schemeOutliersForDisplay(props.schemeOutliers, props.boundaries)
  const handles = new Set(
    visible.map((o) => normalizeHandle(o.handle)).filter(Boolean),
  )
  for (const entity of dxf.entities) {
    const handle = normalizeHandle(entity.handle)
    if (!handle || !handles.has(handle)) continue
    entity.color = pink
    entity.colorIndex = 7
  }
}

function colorOutputSchemeOutliers(dxf) {
  const pink = readPartColor('pink')
  for (const entity of dxf.entities) {
    const handle = normalizeHandle(entity.handle)
    if (!handle) continue
    if (!isSchemeOutlierDisplay(handle, props.schemeOutliers, props.boundaries)) continue
    entity.color = pink
    entity.colorIndex = 7
  }
}

function colorNestingOutputByLayer(dxf) {
  forEachEntityList(dxf, (entities) => {
    for (const entity of entities) {
      const colorName = NESTING_LAYER_COLOR[entity.layer]
      if (!colorName) continue
      applyEntityColor(entity, readPartColor(colorName))
    }
  })
}

function colorOutputPieces(dxf) {
  const blue = readPartColor('blue')
  const pink = readPartColor('pink')
  const textColor = cssVarRgb('--color-text-summary')
  for (const entity of dxf.entities) {
    if (TEXT_TYPES.has(entity.type)) {
      entity.color = textColor
      entity.colorIndex = 7
      continue
    }
    if (entity.type === 'LINE' && entity.layer === SCAN_DIM_LAYER) {
      entity.color = textColor
      entity.colorIndex = 7
      entity.lineType = 'DASHED'
      continue
    }
    const handle = String(entity.handle)
    const isOutlierLine = entity.type === 'LINE'
      && props.boundaries.length
      && isLayerOutlier(handle, props.boundaries)
    entity.color = isOutlierLine ? pink : blue
    entity.colorIndex = 7
  }
}

function colorOutputProcessingResult(dxf) {
  const green = readPartColor('green')
  const red = readPartColor('red')
  const pink = readPartColor('pink')
  const textColor = cssVarRgb('--color-text-summary')
  const boundaryById = new Map(props.boundaries.map((b) => [b.id, b]))

  for (const entity of dxf.entities) {
    const handle = String(entity.handle)
    if (TEXT_TYPES.has(entity.type)) {
      entity.color = textColor
      entity.colorIndex = 7
      continue
    }
    if (entity.type === 'LINE' && entity.layer === SCAN_DIM_LAYER) {
      entity.color = textColor
      entity.colorIndex = 7
      entity.lineType = 'DASHED'
      continue
    }
    if (entity.type === 'LINE' && isLayerOutlier(handle, props.boundaries)) {
      entity.color = pink
      entity.colorIndex = 7
      continue
    }
    const boundary = boundaryById.get(handle)
    if (boundary) {
      entity.color = isCompleteMetadata(boundaryMeta(boundary)) ? green : red
      entity.colorIndex = 7
    }
  }
}

function orderOutputEntitiesOutliersLast(dxf) {
  const outliers = []
  const rest = []
  for (const entity of dxf.entities) {
    const handle = String(entity.handle)
    if (entity.type === 'LINE' && isLayerOutlier(handle, props.boundaries)) {
      outliers.push(entity)
    } else {
      rest.push(entity)
    }
  }
  dxf.entities = [...rest, ...outliers]
}

function colorTextEntities(entities, color) {
  for (const entity of entities) {
    if (!TEXT_TYPES.has(entity.type)) continue
    applyEntityColor(entity, color)
  }
}

function colorText(dxf) {
  const color = cssVarRgb('--color-text-summary')
  colorTextEntities(dxf.entities, color)
  if (dxf.blocks) {
    for (const block of Object.values(dxf.blocks)) {
      if (!block.entities?.length) continue
      colorTextEntities(block.entities, color)
    }
  }
}

const rawParsed = computed(() => {
  if (!props.dxfText) return null
  try {
    return parseDxf(props.dxfText)
  } catch {
    return null
  }
})

const parsed = computed(() => {
  let raw = rawParsed.value
  if (!raw) return null

  raw = cloneDxfForColoring(raw)

  if (props.annotationDxf?.entities?.length) {
    raw = {
      ...raw,
      entities: [
        ...(raw.entities ?? []),
        ...props.annotationDxf.entities.map((entity) => ({ ...entity })),
      ],
    }
  }

  const finish = (dxf) => {
    if (dxf && props.exportLayerNames) {
      applyLayerRenameToParsedDxf(dxf, props.exportLayerNames)
    }
    return dxf
  }

  const threeD = is3dDxf(raw)

  if (props.viewMode === 'output' && !threeD) {
    const useBoundaryView = props.boundaries.length && (
      props.showOutlierLines
      || props.showSchemeOutliers
      || props.showCorrectParts
      || props.showIncorrectParts
    )
    if (useBoundaryView) {
      const boundariesForView = visibleOutputBoundariesList.value
      const useProcessingColors = props.showCorrectParts || props.showIncorrectParts
      const dxf = buildOutputDxf(raw, boundariesForView, {
        showOutlierLines: props.showOutlierLines,
        showSchemeOutliers: props.showSchemeOutliers,
        schemeOutliers: props.schemeOutliers,
        includeText: props.includeOutputText,
      })
      if (useProcessingColors) {
        colorOutputProcessingResult(dxf)
      } else {
        colorOutputPieces(dxf)
      }
      if (props.showSchemeOutliers) {
        colorOutputSchemeOutliers(dxf)
      }
      if (props.showOutlierLines) {
        orderOutputEntitiesOutliersLast(dxf)
      }
      return finish(dxf)
    }
    colorText(raw)
    colorNestingOutputByLayer(raw)
    return finish(raw)
  }

  colorText(raw)
  const usePreviewCurveColors = props.viewMode === 'input'
    && !props.showMetadataColors
    && !(props.showModifiedPartsGreen && props.modifiedHandles.length > 0)
  if (usePreviewCurveColors) {
    colorPreviewCurves(raw)
  } else {
    colorPieces(raw)
  }
  if (threeD && props.viewMode === 'output' && (props.showCorrectParts || props.showIncorrectParts)) {
    colorOutputProcessingResult(raw)
  }
  if (props.showSchemeOutliers && props.schemeOutliers.length) {
    colorSchemeOutlierEntities(raw)
  }
  if (props.viewMode === 'input' && !props.showDimensions) {
    return finish(filterDimensionEntities(raw))
  }
  return finish(raw)
})

const showLayerPanel = computed(() => props.showLayerPanel)

const propertiesPanelEnabled = computed(
  () => props.showPropertiesPanel || props.clickForProperties,
)

const is3d = computed(() => parsed.value != null && is3dDxf(parsed.value))

const hoverHighlightColor = computed(() => readPartColorHex('orange'))

const viewerBackendRef = ref(null)
const blockMarkerOverlayRef = ref(null)
const cameraTick = ref(0)
let viewer2dCamera = null
let viewer2dCanvas = null
let viewer2dOriginOffset = null
const savedCameraState = ref(null)
let markerRedrawScheduled = false

const LABEL_FONT_PX = 12
const LABEL_PAD_PX = 8
const DOT_PX = 8
const BLOCK_CROSS_WORLD = 40

function labelNeedsPx(text) {
  return text.length * LABEL_FONT_PX * 0.6 + LABEL_PAD_PX * 2
}

const selectedBlockId = ref(null)

const pickingIndex = computed(() => (parsed.value ? buildPickingIndex(parsed.value) : null))
const entityIndex = computed(() => (parsed.value ? buildEntityIndex(parsed.value) : null))

const parts = computed(() => {
  if (!parsed.value) return []

  if (props.boundaries.length) {
    const boundariesForView = props.viewMode === 'output'
      ? visibleOutputBoundariesList.value
      : props.boundaries
    return topLevelBoundaries(boundariesForView, props.boundaries).map((boundary) => {
      const meta = boundaryMeta(boundary)
      const nr = meta.Nr
      const text = !nr || safeFilename(nr) === 'UNNAMED' ? '?' : nr
      const width = boundary.bbox ? boundary.bbox.maxX - boundary.bbox.minX : 0
      return {
        text,
        center: {
          x: boundary.bbox?.centerX ?? 0,
          y: boundary.bbox?.centerY ?? 0,
        },
        bboxWidthX: width,
      }
    })
  }

  if (!pickingIndex.value) return []
  const out = []
  for (const entity of parsed.value.entities) {
    if (!isClosedBoundary(entity)) continue
    const entry = pickingIndex.value.byHandle.get(entity.handle)?.[0]
    if (!entry) continue
    const nr = effectiveMeta(entity).Nr
    const text = !nr || safeFilename(nr) === 'UNNAMED' ? '?' : nr
    const center = entry.bbox.getCenter(new THREE.Vector3())
    out.push({ text, center, bboxWidthX: entry.bbox.max.x - entry.bbox.min.x })
  }
  return out
})

const screenLabels = computed(() => {
  cameraTick.value
  if (!props.showPartLabels || !viewer2dCamera || !viewer2dOriginOffset || !parts.value.length) return []
  const container = viewerBackendRef.value?.getContainerEl?.()
  if (!container) return []
  const rect = container.getBoundingClientRect()
  const pixelsPerWorld = (rect.height / (viewer2dCamera.top - viewer2dCamera.bottom)) * viewer2dCamera.zoom

  return parts.value.map(({ text, center, bboxWidthX }) => {
    const partPx = bboxWidthX * pixelsPerWorld
    const showText = partPx >= labelNeedsPx(text)
    const v = new THREE.Vector3(
      center.x - viewer2dOriginOffset.x,
      center.y - viewer2dOriginOffset.y,
      0,
    )
    v.project(viewer2dCamera)
    return {
      left: (v.x + 1) * 0.5 * rect.width,
      top: (-v.y + 1) * 0.5 * rect.height,
      mode: showText ? 'text' : 'dot',
      text: showText ? text : '',
      fontSize: LABEL_FONT_PX,
      dotSize: DOT_PX,
    }
  })
})

function viewerContainerRect() {
  const container = viewerBackendRef.value?.getContainerEl?.()
  if (!container) return null
  const rect = container.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return rect
}

function projectWorldToScreen(x, y) {
  if (!viewer2dCamera || !viewer2dOriginOffset) return { left: 0, top: 0 }
  const rect = viewerContainerRect()
  if (!rect) return { left: 0, top: 0 }
  const v = new THREE.Vector3(
    x - viewer2dOriginOffset.x,
    y - viewer2dOriginOffset.y,
    0,
  )
  v.project(viewer2dCamera)
  return {
    left: (v.x + 1) * 0.5 * rect.width,
    top: (-v.y + 1) * 0.5 * rect.height,
  }
}

function blockMarkerSizePx() {
  if (!viewer2dCamera) {
    return props.markerShape === 'circle' && props.markerSizeMm
      ? props.markerSizeMm
      : BLOCK_CROSS_WORLD
  }
  const rect = viewerContainerRect()
  if (!rect) {
    return props.markerShape === 'circle' && props.markerSizeMm
      ? props.markerSizeMm
      : BLOCK_CROSS_WORLD
  }
  const pixelsPerWorld =
    (rect.height / (viewer2dCamera.top - viewer2dCamera.bottom)) * viewer2dCamera.zoom
  const worldSize =
    props.markerShape === 'circle' && props.markerSizeMm
      ? props.markerSizeMm
      : BLOCK_CROSS_WORLD
  return worldSize * pixelsPerWorld
}

function blockCrossSizePx() {
  return blockMarkerSizePx()
}

function scheduleMarkerRedraw() {
  if (props.viewMode !== 'output' || !visibleBlockInsertsList.value.length) return
  if (markerRedrawScheduled) return
  markerRedrawScheduled = true
  requestAnimationFrame(() => {
    markerRedrawScheduled = false
    blockMarkerOverlayRef.value?.redraw(
      projectWorldToScreen,
      blockCrossSizePx(),
      selectedBlockId.value ?? '',
      props.markerShape,
    )
  })
}

function blockAtClientPoint(clientX, clientY) {
  if (props.viewMode !== 'output' || !visibleBlockInsertsList.value.length) return null
  const container = viewerBackendRef.value?.getContainerEl?.()
  if (!container) return null
  const rect = container.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const hitRadius = Math.max(blockCrossSizePx() / 2, 6)
  const hitRadiusSq = hitRadius * hitRadius

  let best = null
  let bestDist = Infinity
  for (const block of visibleBlockInsertsList.value) {
    const { left, top } = projectWorldToScreen(block.x, block.y)
    const dx = x - left
    const dy = y - top
    const dist = dx * dx + dy * dy
    if (dist <= hitRadiusSq && dist < bestDist) {
      bestDist = dist
      best = block
    }
  }
  return best
}

function disposeViewerBindings() {
  viewerBackendRef.value?.setControlsChangeListener?.(null)
  viewer2dCamera = null
  viewer2dCanvas = null
  viewer2dOriginOffset = null
}

function captureCameraState() {
  return viewerBackendRef.value?.captureCameraState?.() ?? null
}

function restoreCameraState(state) {
  viewerBackendRef.value?.restoreCameraState?.(state)
  scheduleMarkerRedraw()
  cameraTick.value++
}

const panelWorldPoint = ref(null)
const selectionRect = ref(null)
const hiddenLayers = ref([])
const DRAG_THRESHOLD_PX = 4
const PICK_TOLERANCE = 0.01
const MIN_RECT_SELECT_PX = 10
const CURVE_PICK_TYPES = new Set(['LINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE'])
let lastPointer = { x: 0, y: 0, shiftKey: false }
let leftPointerDown = false
let dxfPickHandled = false
let pointerDragged = false

const VIEWER_UI_SELECTOR = [
  '.part-metadata-panel',
  '.plan-view-3d__layers',
  '.dxf-2d-viewer__layers',
  '.viewer-layer-stack',
  '.dxfk-layer-panel',
  '.dxfk-toolbar',
  '.dxfk-properties-panel',
  '.dxfk-ruler',
  '.dxfk-ruler-corner',
  '.dxfk-coordinates-overlay',
  '.dxfk-file-name-overlay',
].join(', ')

function isViewerUiTarget(target) {
  return target instanceof Element && !!target.closest(VIEWER_UI_SELECTOR)
}

function isLayerVisible(layerName) {
  return !hiddenLayers.value.includes(layerName ?? '0')
}

function groupSelectionByBoundary() {
  return props.viewMode === 'output' && props.boundaries.length > 0
}

function handlesForBoundary(handle) {
  const boundary = boundaryForHandle(handle, props.boundaries)
  if (boundary) return boundary.memberHandles.map(String)
  if (props.viewMode === 'input' && parsed.value) {
    const chainMembers = findClosedChainMembers(parsed.value, handle)
    if (chainMembers?.length) return chainMembers
  }
  return [String(handle)]
}

function isBoundaryCompositeHandle(handle) {
  const h = normalizeHandle(handle)
  if (!h) return false
  if (props.boundaries.some((b) => normalizeHandle(b.id) === h)) return true
  const entity = lookupEntity(h)
  return entity?.type === 'LWPOLYLINE' || entity?.type === 'POLYLINE'
}

function preferLineHandles(handles) {
  if (!handles.some((h) => isLineEntity(lookupEntity(h)))) return handles
  return handles.filter((h) => {
    if (isLineEntity(lookupEntity(h))) return true
    return !isBoundaryCompositeHandle(h)
  })
}

function expandToBoundaryHandles(handles) {
  const out = []
  const seen = new Set()
  for (const h of handles) {
    if (groupSelectionByBoundary() && isLineEntity(lookupEntity(h))) {
      const handle = normalizeHandle(h)
      if (!handle || seen.has(handle)) continue
      seen.add(handle)
      out.push(handle)
      continue
    }
    for (const member of handlesForBoundary(h)) {
      if (seen.has(member)) continue
      seen.add(member)
      out.push(member)
    }
  }
  return out
}

function isSelectableEntity(entity) {
  if (!isLayerVisible(entity.layer)) return false
  if (props.viewMode === 'input') return true
  const handle = normalizeHandle(entity.handle)
  if (!handle) return false
  if (isLayerOutlier(handle, props.boundaries)) return true
  if (isSchemeOutlierDisplay(handle, props.schemeOutliers, props.boundaries)) return true
  if (is3d.value && isShadedFaceEntity(entity)) {
    if (props.viewMode === 'input') return true
    if (!props.boundaries.length) return true
    return boundaryForHandle(handle, props.boundaries) !== null
  }
  return isClosedBoundary(entity)
}

function lookupEntity(handle) {
  const normalized = normalizeHandle(handle)
  if (!entityIndex.value || !normalized) return null
  return entityIndex.value.get(normalized) ?? null
}

function findParsedEntity(handle) {
  const normalized = normalizeHandle(handle)
  if (!parsed.value || !normalized) return null
  return parsed.value.entities.find((e) => normalizeHandle(e.handle) === normalized) ?? null
}

function isPickableEntry(entry) {
  const entity = lookupEntity(entry.handle)
  if (!entity || !isSelectableEntity(entity)) return false
  if (props.viewMode === 'output' && isLineEntity(entity)) return true
  return isLayerVisible(entry.layer)
}

function isKnown3dPartHandle(handle) {
  const h = normalizeHandle(handle)
  if (!h) return false
  if (props.boundaries.length && boundaryForHandle(h, props.boundaries)) return true
  const entity = findParsedEntity(h)
  return entity != null && isShadedFaceEntity(entity)
}

function isSelectableHandle(handle) {
  if (is3d.value) return isKnown3dPartHandle(handle)
  const entity = findParsedEntity(handle)
  return entity ? isSelectableEntity(entity) : false
}

function selectableHandles(handles) {
  return handles.filter(isSelectableHandle)
}

function polyfaceHandlesFromSelection(handles) {
  const out = new Set()
  for (const h of expandToBoundaryHandles(handles)) {
    const entity = findParsedEntity(h)
    if (entity && isShadedFaceEntity(entity)) {
      out.add(normalizeHandle(entity.handle))
      continue
    }
    const boundary = boundaryForHandle(h, props.boundaries)
    if (!boundary) continue
    for (const mh of boundary.memberHandles ?? []) {
      const member = findParsedEntity(mh)
      if (member && isShadedFaceEntity(member)) {
        out.add(normalizeHandle(member.handle))
      }
    }
  }
  return [...out]
}

function highlightSafeHandles(handles) {
  return handles.filter((h) => {
    const entity = findParsedEntity(h)
    if (!entity) return true
    if (entity.type === '3DFACE' || entity.type === 'SOLID') return false
    return !(entity.type === 'POLYLINE' && entity.vertices?.some((v) => v.faceA !== undefined))
  })
}

function applyHighlight() {
  viewerBackendRef.value?.applyHighlight?.(selectedHandles.value)
}

function mergeSelectionHandles(existing, added) {
  const seen = new Set(existing)
  const out = [...existing]
  for (const handle of added) {
    if (seen.has(handle)) continue
    seen.add(handle)
    out.push(handle)
  }
  return out
}

function viewerShellEl() {
  return viewerBackendRef.value?.getContainerEl?.()?.parentElement ?? null
}

function selectionAnchorWorldPoint(handles) {
  if (!handles.length) return null

  if (is3d.value) {
    const centers = []
    for (const h of handles) {
      const center = viewerBackendRef.value?.partWorldCenter?.(h)
      if (center) centers.push(center)
    }
    if (centers.length) {
      return {
        x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
        y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
      }
    }
  }

  if (props.boundaries.length) {
    const centers = []
    const seen = new Set()
    for (const h of handles) {
      const boundary = boundaryForHandle(h, props.boundaries)
      if (!boundary || seen.has(boundary.id)) continue
      seen.add(boundary.id)
      if (boundary.bbox) {
        centers.push({ x: boundary.bbox.centerX, y: boundary.bbox.centerY })
      }
    }
    if (centers.length) {
      return {
        x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
        y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
      }
    }
  }

  if (!pickingIndex.value) return null
  const centers = []
  for (const h of handles) {
    const entry = pickingIndex.value.byHandle.get(h)?.[0]
    if (!entry) continue
    centers.push(entry.bbox.getCenter(new THREE.Vector3()))
  }
  if (!centers.length) return null
  return {
    x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
    y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
  }
}

function setSelection(handles, { panelAt, additive = false, clientX, clientY } = {}) {
  selectedBlockId.value = null
  const expanded = expandToBoundaryHandles(handles)
  const picked = is3d.value
    ? expanded.map(String).filter(isKnown3dPartHandle)
    : selectableHandles(expanded)
  const next = additive ? mergeSelectionHandles(selectedHandles.value, picked) : picked
  selectedHandles.value = next
  if (!next.length) {
    panelWorldPoint.value = null
  } else if (propertiesPanelEnabled.value) {
    panelWorldPoint.value = panelAt ?? selectionAnchorWorldPoint(next)
  }
  applyHighlight()
}

function selectBlock(block) {
  selectedHandles.value = []
  selectedBlockId.value = block.id
  if (propertiesPanelEnabled.value) {
    panelWorldPoint.value = { x: block.x, y: block.y }
  }
  viewerBackendRef.value?.clearHighlight()
  scheduleMarkerRedraw()
}

function pickToleranceWorld() {
  const camera = viewerBackendRef.value?.getCamera?.() ?? viewer2dCamera
  const canvas = viewerBackendRef.value?.getCanvas?.() ?? viewer2dCanvas
  if (!camera || !canvas) return PICK_TOLERANCE
  const rect = canvas.getBoundingClientRect()
  if (!rect.height) return PICK_TOLERANCE
  const worldPerPixel = (camera.top - camera.bottom) / (rect.height * camera.zoom)
  return Math.max(PICK_TOLERANCE, worldPerPixel * 6)
}

function pickIndexHandlesInRect(rect, mode) {
  const handles = []
  const seen = new Set()
  if (!pickingIndex.value) return handles
  for (const entry of pickingIndex.value.entries) {
    const handle = normalizeHandle(entry.handle)
    if (!handle || seen.has(handle)) continue
    const entity = findParsedEntity(handle)
    if (!entity || !isSelectableEntity(entity)) continue
    if (props.viewMode === 'input') {
      if (!CURVE_PICK_TYPES.has(entity.type) && !isShadedFaceEntity(entity)) continue
    } else if (!isClosedBoundary(entity) && !isShadedFaceEntity(entity)) continue
    if (!isLayerVisible(entry.layer)) continue
    if (!plainBboxMatchesRect(entryBboxPlain(entry), rect, mode)) continue
    seen.add(handle)
    handles.push(handle)
  }
  return preferLineHandles(handles)
}

function pickClosedBoundariesInRect(x1, y1, x2, y2) {
  const start = clientToWorld(x1, y1)
  const end = clientToWorld(x2, y2)
  if (!start || !end) {
    return []
  }

  const mode = resolveSelectionMode('auto', { x: x1, y: y1 }, { x: x2, y: y2 })
  const rect = buildWorldRect(start, end)

  let handles = []
  if (props.boundaries.length) {
    for (const boundary of props.boundaries) {
      if (!boundaryMatchesRect(boundary, rect, mode)) continue
      if (!isSelectableHandle(boundary.id)) continue
      handles.push(String(boundary.id))
    }
    if (groupSelectionByBoundary()) {
      for (const boundary of props.boundaries) {
        for (const outlier of boundary.layerOutliers ?? []) {
          const handle = normalizeHandle(outlier.handle)
          if (!handle || handles.includes(handle)) continue
          const entry = pickingIndex.value?.byHandle.get(handle)?.[0]
          if (!entry || !isLayerVisible(entry.layer)) continue
          if (!plainBboxMatchesRect(entryBboxPlain(entry), rect, mode)) continue
          handles.push(handle)
        }
      }
    }
    if (!handles.length) {
      handles = pickIndexHandlesInRect(rect, mode)
    }
  } else if (is3d.value) {
    return (viewerBackendRef.value?.pickInRect?.(rect, mode) ?? []).filter(isSelectableHandle)
  } else if (pickingIndex.value) {
    return pickIndexHandlesInRect(rect, mode)
  } else {
    return []
  }

  const expanded = expandToBoundaryHandles(handles)
  return expanded
}

function entryBboxPlain(entry) {
  const b = entry.bbox
  return {
    minX: b.min.x,
    maxX: b.max.x,
    minY: b.min.y,
    maxY: b.max.y,
    centerX: (b.min.x + b.max.x) / 2,
    centerY: (b.min.y + b.max.y) / 2,
  }
}

function rectContainsPoint(rect, x, y) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY
}

function plainBboxFullyInsideRect(bbox, rect) {
  return bbox.minX >= rect.minX && bbox.maxX <= rect.maxX
    && bbox.minY >= rect.minY && bbox.maxY <= rect.maxY
}

function plainBboxIntersectsRect(bbox, rect) {
  return bbox.maxX >= rect.minX && bbox.minX <= rect.maxX
    && bbox.maxY >= rect.minY && bbox.minY <= rect.maxY
}

function plainBboxMatchesRect(bbox, rect, mode) {
  if (mode === 'window') return plainBboxFullyInsideRect(bbox, rect)
  return plainBboxIntersectsRect(bbox, rect)
}

function boundaryMatchesRect(boundary, rect, mode) {
  const bb = boundary.bbox
  if (!bb) return false
  return plainBboxMatchesRect({
    minX: bb.minX,
    maxX: bb.maxX,
    minY: bb.minY,
    maxY: bb.maxY,
    centerX: bb.centerX ?? (bb.minX + bb.maxX) / 2,
    centerY: bb.centerY ?? (bb.minY + bb.maxY) / 2,
  }, rect, mode)
}

function updateSelectionRect(clientX, clientY) {
  const shell = viewerBackendRef.value?.getContainerEl?.()?.parentElement
  if (!shell) return
  const shellRect = shell.getBoundingClientRect()
  const mode = resolveSelectionMode('auto', lastPointer, { x: clientX, y: clientY })
  const x1 = lastPointer.x - shellRect.left
  const y1 = lastPointer.y - shellRect.top
  const x2 = clientX - shellRect.left
  const y2 = clientY - shellRect.top
  selectionRect.value = {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    mode,
  }
}

function onViewerPointerDown(e) {
  if (e.button !== 0) return
  if (isViewerUiTarget(e.target)) return
  leftPointerDown = true
  lastPointer = { x: e.clientX, y: e.clientY, shiftKey: e.shiftKey }
  dxfPickHandled = false
  pointerDragged = false
  selectionRect.value = null
  if (props.selectionEnabled) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }
}

function isShadedFaceEntity(entity) {
  if (!entity) return false
  if (entity.type === '3DFACE' || entity.type === 'SOLID') return true
  return entity.type === 'POLYLINE' && (
    entity.isPolyfaceMesh === true
    || entity.vertices?.some((v) => v.faceA !== undefined)
  )
}

function boundaryAtWorldPoint(x, y) {
  let best = null
  let bestArea = Infinity
  for (const boundary of props.boundaries) {
    if (!pointInBoundary(x, y, boundary)) continue
    const bb = boundary.bbox
    const area = bb ? (bb.maxX - bb.minX) * (bb.maxY - bb.minY) : Infinity
    if (area < bestArea) {
      best = boundary
      bestArea = area
    }
  }
  return best
}

function resolveHandleFromPickingEvent(event, { clientX, clientY } = {}) {
  if (!event?.handle) return null
  const handle = normalizeHandle(event.handle)
  if (!handle) return null

  if (is3d.value) {
    const boundary = boundaryForHandle(handle, props.boundaries)
    if (boundary) return boundary.id
    const entity = event.entity ?? findParsedEntity(handle)
    if (entity && isShadedFaceEntity(entity)) return handle
    return isKnown3dPartHandle(handle) ? handle : null
  }

  const entity = event.entity ?? lookupEntity(handle) ?? findParsedEntity(handle)
  if (!entity || !isSelectableEntity(entity)) return null

  if (props.boundaries.length) {
    const boundary = boundaryForHandle(handle, props.boundaries)
    if (boundary) return boundary.id

    if (props.viewMode === 'input' && parsed.value) {
      const chainMembers = findClosedChainMembers(parsed.value, handle)
      if (chainMembers?.length) return chainMembers[0]
    }

    if (props.viewMode === 'input') {
      const px = clientX ?? lastPointer?.x
      const py = clientY ?? lastPointer?.y
      if (px != null && py != null) {
        const world = clientToWorld(px, py)
        if (world) {
          const containing = boundaryAtWorldPoint(world.x, world.y)
          if (containing) return containing.id
        }
      }
    }
  }

  if (props.viewMode === 'output' && isLineEntity(entity)) return handle
  if (isShadedFaceEntity(entity)) return handle
  const closed = isClosedBoundary(entity)
  if (closed) return handle

  if (props.viewMode === 'input' && CURVE_PICK_TYPES.has(entity.type)) {
    return handle
  }
  return null
}

function applySelectionFromHandle(handle, { shiftKey, clientX, clientY } = {}) {
  if (!handle) return
  dxfPickHandled = true

  const panelAt = propertiesPanelEnabled.value && clientX != null && clientY != null
    ? clientToWorld(clientX, clientY)
    : undefined

  if (shiftKey) {
    const expanded = expandToBoundaryHandles([handle])
    const current = selectedHandles.value
    const removing = expanded.every((h) => current.includes(h))
    const next = removing
      ? current.filter((h) => !expanded.includes(h))
      : mergeSelectionHandles(current, expanded)
    setSelection(next, { panelAt, clientX, clientY })
    return
  }

  setSelection(expandToBoundaryHandles([handle]), { panelAt, clientX, clientY })
}

function onDxfEntityClick(event) {
  if (!props.selectionEnabled) return
  if (pointerDragged) return
  const handle = resolveHandleFromPickingEvent(event, {
    clientX: lastPointer.x,
    clientY: lastPointer.y,
  })
  if (!handle) {
    dxfPickHandled = false
    return
  }
  dxfPickHandled = true
  applySelectionFromHandle(handle, {
    shiftKey: lastPointer.shiftKey,
    clientX: lastPointer.x,
    clientY: lastPointer.y,
  })
}

function pick3dAtClient(clientX, clientY) {
  return viewerBackendRef.value?.pickAtClient?.(clientX, clientY) ?? null
}

function pick2dAtClient(clientX, clientY) {
  const world = clientToWorld(clientX, clientY)
  if (!world || !pickingIndex.value || !entityIndex.value) return null
  return pickEntryAtWorldPoint(
    pickingIndex.value,
    entityIndex.value,
    world,
    pickToleranceWorld(),
    { acceptEntry: isPickableEntry },
  )
}

function onViewerPointerMove(e) {
  if (!leftPointerDown || !(e.buttons & 1)) return
  if (!props.selectionEnabled) return
  if (Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y) > DRAG_THRESHOLD_PX) {
    pointerDragged = true
    updateSelectionRect(e.clientX, e.clientY)
  }
}

function onViewerPointerLeave() {
  if (leftPointerDown) return
  selectionRect.value = null
}

function finishLeftPointer(e) {
  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  leftPointerDown = false
  selectionRect.value = null
  if (isViewerUiTarget(e.target)) return
  if (!props.selectionEnabled) return

  const dragDistance = Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y)
  const rectW = Math.abs(e.clientX - lastPointer.x)
  const rectH = Math.abs(e.clientY - lastPointer.y)
  if (dragDistance > DRAG_THRESHOLD_PX && Math.max(rectW, rectH) >= MIN_RECT_SELECT_PX) {
    dxfPickHandled = true
    const rectPicked = pickClosedBoundariesInRect(lastPointer.x, lastPointer.y, e.clientX, e.clientY)
    const panelAt = propertiesPanelEnabled.value
      ? clientToWorld((lastPointer.x + e.clientX) / 2, (lastPointer.y + e.clientY) / 2)
      : undefined
    setSelection(rectPicked, {
      additive: e.shiftKey,
      panelAt,
      clientX: (lastPointer.x + e.clientX) / 2,
      clientY: (lastPointer.y + e.clientY) / 2,
    })
    return
  }

  const block = blockAtClientPoint(e.clientX, e.clientY)
  if (block) {
    selectBlock(block)
    return
  }

  if (!is3d.value) {
    if (!dxfPickHandled && props.selectionEnabled) {
      const world = clientToWorld(e.clientX, e.clientY)
      const entry = pick2dAtClient(e.clientX, e.clientY)
      if (entry) {
        const resolved = resolveHandleFromPickingEvent({
          handle: entry.handle,
          entity: findParsedEntity(entry.handle),
        }, { clientX: e.clientX, clientY: e.clientY })
        if (resolved) {
          applySelectionFromHandle(resolved, {
            shiftKey: e.shiftKey,
            clientX: e.clientX,
            clientY: e.clientY,
          })
          return
        }
      }
      if (world && props.boundaries.length) {
        const containing = boundaryAtWorldPoint(world.x, world.y)
        if (containing) {
          applySelectionFromHandle(containing.id, {
            shiftKey: e.shiftKey,
            clientX: e.clientX,
            clientY: e.clientY,
          })
          return
        }
      }
    }
    if (!dxfPickHandled && !e.shiftKey) setSelection([])
    return
  }

  const pick = pick3dAtClient(e.clientX, e.clientY)
  const resolved = pick?.handle
    ? resolveHandleFromPickingEvent({
      handle: pick.handle,
      entity: findParsedEntity(pick.handle),
    }, { clientX: e.clientX, clientY: e.clientY })
    : null
  if (!resolved) {
    if (!e.shiftKey) setSelection([])
    return
  }

  applySelectionFromHandle(resolved, {
    shiftKey: e.shiftKey,
    clientX: e.clientX,
    clientY: e.clientY,
  })
}

function onViewerPointerUp(e) {
  if (e.button !== 0) return
  finishLeftPointer(e)
}

function onViewerPointerCancel(e) {
  if (!leftPointerDown) return
  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  leftPointerDown = false
  selectionRect.value = null
}

function clientToWorld(clientX, clientY) {
  const canvas = viewerBackendRef.value?.getCanvas?.() ?? viewer2dCanvas
  const camera = viewerBackendRef.value?.getCamera?.() ?? viewer2dCamera
  const origin = viewerBackendRef.value?.getOriginOffset?.() ?? viewer2dOriginOffset
  if (!canvas || !camera || !origin) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
  const v = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera)
  return { x: v.x + origin.x, y: v.y + origin.y }
}

const panelScreenPos = computed(() => {
  cameraTick.value
  if (!panelWorldPoint.value) return null
  const backend = viewerBackendRef.value
  const camera = backend?.getCamera?.() ?? viewer2dCamera
  const origin = backend?.getOriginOffset?.() ?? viewer2dOriginOffset
  if (!camera || !origin) return null
  const shell = viewerShellEl()
  if (!shell) return null
  const rect = shell.getBoundingClientRect()
  const v = new THREE.Vector3(
    panelWorldPoint.value.x - origin.x,
    panelWorldPoint.value.y - origin.y,
    0,
  )
  v.project(camera)
  return {
    left: (v.x + 1) * 0.5 * rect.width,
    top: (-v.y + 1) * 0.5 * rect.height,
  }
})

const showMetadataPanel = computed(
  () => propertiesPanelEnabled.value
    && (selectedHandles.value.length > 0 || selectedBlockId.value)
    && panelScreenPos.value != null,
)

const metadataPanelStyle = computed(() => {
  const pos = panelScreenPos.value
  if (!pos) return undefined
  return { left: `${pos.left}px`, top: `${pos.top}px` }
})

const VARIES = '<varies>'

const selectionPanelMeta = computed(() => {
  if (selectedBlockId.value) {
    const block = props.blockInserts.find((b) => b.id === selectedBlockId.value)
    if (block) {
      return {
        nr: block.name ?? '',
        mat: '',
        anz: '',
      }
    }
  }

  const handles = selectedHandles.value
  if (!handles.length) return { nr: '', mat: '', anz: '' }

  const metas = handles.map((h) => {
    const entity = findParsedEntity(h)
    if (entity && isLineEntity(entity)) {
      const meta = effectiveMeta(entity)
      return {
        nr: isMissingSerial(meta) ? '' : String(meta.Nr ?? '').trim(),
        mat: String(meta.Mat ?? '').trim(),
        anz: String(meta.Anz ?? '').trim(),
      }
    }
    const boundary = boundaryForHandle(h, props.boundaries)
    if (boundary) {
      const meta = boundaryMeta(boundary)
      return {
        nr: isMissingSerial(meta) ? '' : String(meta.Nr ?? '').trim(),
        mat: String(meta.Mat ?? '').trim(),
        anz: String(meta.Anz ?? '').trim(),
      }
    }
    if (!entity) return { nr: '', mat: '', anz: '' }
    const meta = effectiveMeta(entity)
    return {
      nr: isMissingSerial(meta) ? '' : String(meta.Nr ?? '').trim(),
      mat: String(meta.Mat ?? '').trim(),
      anz: String(meta.Anz ?? '').trim(),
    }
  })

  const agg = (key) => {
    const vals = metas.map((m) => m[key])
    return vals.every((v) => v === vals[0]) ? vals[0] : VARIES
  }

  return {
    nr: agg('nr'),
    mat: agg('mat'),
    anz: agg('anz'),
  }
})

function clearPanel() {
  setSelection([])
}

function selectPartByHandle(handle) {
  if (!props.selectionEnabled) return false
  const h = String(handle)
  const members = expandToBoundaryHandles([h])

  if (is3d.value) {
    const resolved = resolveHandleFromPickingEvent({ handle: h, entity: findParsedEntity(h) })
    if (!resolved) return false
    const center = viewerBackendRef.value?.partWorldCenter?.(resolved)
    setSelection([resolved], {
      panelAt: center ? { x: center.centerX, y: center.centerY } : undefined,
    })
    viewerBackendRef.value?.zoomToEntity?.([resolved])
    return true
  }

  const entry = pickingIndex.value?.byHandle.get(members[0])?.[0]
  if (!entry && !props.boundaries.length) return false

  let center
  const boundary = boundaryForHandle(h, props.boundaries)
  if (boundary?.bbox) {
    center = { x: boundary.bbox.centerX, y: boundary.bbox.centerY }
  } else if (entry) {
    const c = entry.bbox.getCenter(new THREE.Vector3())
    center = { x: c.x, y: c.y }
  } else {
    return false
  }

  setSelection(members, { panelAt: center })
  viewerBackendRef.value?.zoomToEntity(members)
  return true
}

function resize() {
  viewerBackendRef.value?.resize?.()
}

function getHiddenLayers() {
  return [...hiddenLayers.value]
}

function getLayerNames() {
  const dxf = parsed.value
  if (!dxf?.entities?.length) return []
  const names = new Set()
  for (const entity of dxf.entities) {
    names.add(entity.layer ?? '0')
  }
  return [...names].sort()
}

defineExpose({
  selectPartByHandle,
  resize,
  getHiddenLayers,
  getLayerNames,
  getCamera: () => viewerBackendRef.value?.getCamera?.() ?? null,
  getControls: () => viewerBackendRef.value?.getControls?.() ?? null,
  getOriginOffset: () => viewerBackendRef.value?.getOriginOffset?.() ?? { x: 0, y: 0, z: 0 },
  captureCameraState: () => viewerBackendRef.value?.captureCameraState?.() ?? null,
  restoreCameraState: (state) => viewerBackendRef.value?.restoreCameraState?.(state),
  setControlsChangeListener: (fn) => viewerBackendRef.value?.setControlsChangeListener?.(fn),
})

function onMetadataUpdate(field, value) {
  const handles = selectedHandles.value
  if (!handles.length) return
  if (viewerBackendRef.value?.getCamera()) {
    savedCameraState.value = captureCameraState()
  }

  const partKeys = new Set()
  for (const h of handles) {
    const boundary = boundaryForHandle(h, props.boundaries)
    if (boundary) {
      partKeys.add(partKeyForBoundary(boundary))
      continue
    }
    const entity = findParsedEntity(h)
    if (entity) partKeys.add(String(h))
  }

  if (!partKeys.size) return

  metadataOverrides.value = applyMetadataByPartKeys({
    partKeys: [...partKeys],
    field,
    value,
    metadataOverrides: metadataOverrides.value,
  })
  for (const key of partKeys) emit('mark-modified', key)
}

function onViewerReady() {
  const backend = viewerBackendRef.value
  if (!backend) return

  disposeViewerBindings()
  viewer2dCamera = backend.getCamera()
  viewer2dCanvas = backend.getCanvas()
  viewer2dOriginOffset = backend.getOriginOffset()
  backend.setControlsChangeListener(() => {
    scheduleMarkerRedraw()
    cameraTick.value++
  })

  savedCameraState.value = null
  applyHighlight()
  scheduleMarkerRedraw()
  cameraTick.value++
}

watch(() => props.clickForProperties, (on) => {
  if (!on) clearPanel()
})

watch(() => props.showPropertiesPanel, (on) => {
  if (!on && !props.clickForProperties) {
    panelWorldPoint.value = null
    return
  }
  if (selectedHandles.value.length && !panelWorldPoint.value) {
    panelWorldPoint.value = selectionAnchorWorldPoint(selectedHandles.value)
  }
})

watch(() => props.dxfText, () => {
  savedCameraState.value = null
  hiddenLayers.value = []
  selectedBlockId.value = null
  clearPanel()
})

watch(
  () => [props.viewMode, visibleBlockInsertsList.value, props.showCorrectParts, props.showIncorrectParts, props.markerShape, props.markerSizeMm],
  () => scheduleMarkerRedraw(),
)

watch(selectedBlockId, () => scheduleMarkerRedraw())

watch(
  () => [props.blockInserts, props.showCorrectParts, props.showIncorrectParts, props.boundaries],
  () => {
    if (!selectedBlockId.value) return
    const visible = visibleBlockInsertsList.value
    if (!visible.some((b) => b.id === selectedBlockId.value)) {
      selectedBlockId.value = null
      panelWorldPoint.value = null
    }
  },
)

watch(
  () => props.selectionEnabled,
  (enabled) => {
    if (!enabled) clearPanel()
  },
)

watch(
  () => [
    props.viewMode,
    props.showOutlierLines,
    props.showSchemeOutliers,
    props.schemeOutliers,
    props.showDimensions,
    props.boundaries,
    props.showCorrectParts,
    props.showIncorrectParts,
    props.showModifiedPartsGreen,
    props.modifiedHandles,
    props.viewMode === 'input'
      || (props.viewMode === 'output' && (props.showCorrectParts || props.showIncorrectParts))
      ? metadataOverrides.value
      : null,
  ],
  (_value, oldValue) => {
    if (oldValue === undefined) return
    if (viewerBackendRef.value?.getCamera()) {
      savedCameraState.value = captureCameraState()
    }
  },
)

watch(hiddenLayers, () => {
  const pruned = is3d.value
    ? selectedHandles.value.filter(isKnown3dPartHandle)
    : selectableHandles(selectedHandles.value)
  if (pruned.length !== selectedHandles.value.length) {
    setSelection(pruned)
  }
}, { deep: true })

function onKeydown(e) {
  if (e.key === 'Escape' && (selectedHandles.value.length || selectedBlockId.value)) clearPanel()
}

onMounted(() => window.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  viewerBackendRef.value?.clearHighlight()
  disposeViewerBindings()
})
</script>

<template>
  <div
    v-if="parsed"
    class="viewer-shell"
    @contextmenu.prevent
    @pointerdown="onViewerPointerDown"
    @pointermove="onViewerPointerMove"
    @pointerup="onViewerPointerUp"
    @pointercancel="onViewerPointerCancel"
    @pointerleave="onViewerPointerLeave"
  >
    <PlanView3DViewer
      v-if="is3d"
      ref="viewerBackendRef"
      :dxf="parsed"
      :camera-state-to-restore="savedCameraState"
      :hidden-layers="hiddenLayers"
      :show-layer-panel="showLayerPanel"
      :show-edit-layers="showEditLayers"
      :highlight-color="hoverHighlightColor"
      :selected-handles="selectedHandles"
      :shaded-handles-from-selection="polyfaceHandlesFromSelection"
      @update:hidden-layers="hiddenLayers = $event"
      @edit-layers="emit('edit-layers')"
      @ready="onViewerReady"
    />
    <Dxf2DViewer
      v-else
      ref="viewerBackendRef"
      :dxf="parsed"
      :camera-state-to-restore="savedCameraState"
      :hidden-layers="hiddenLayers"
      :show-layer-panel="showLayerPanel"
      :show-edit-layers="showEditLayers"
      :highlight-color="hoverHighlightColor"
      :selected-handles="selectedHandles"
      :highlight-safe-handles="highlightSafeHandles"
      :picking-enabled="selectionEnabled"
      @entity-click="onDxfEntityClick"
      @update:hidden-layers="hiddenLayers = $event"
      @edit-layers="emit('edit-layers')"
      @ready="onViewerReady"
    />
    <PartTagBubble v-if="showPartLabels" :labels="screenLabels" />
    <BlockMarkerOverlay
      v-if="viewMode === 'output' && visibleBlockInsertsList.length"
      ref="blockMarkerOverlayRef"
      :markers="visibleBlockInsertsList"
      :selected-id="selectedBlockId ?? ''"
      :marker-shape="markerShape"
    />
    <div
      v-if="selectionRect"
      class="selection-rect"
      :class="`selection-rect--${selectionRect.mode}`"
      :style="{
        left: selectionRect.left + 'px',
        top: selectionRect.top + 'px',
        width: selectionRect.width + 'px',
        height: selectionRect.height + 'px',
      }"
    />
    <PartMetadataPanel
      v-if="showMetadataPanel"
      :nr="selectionPanelMeta.nr"
      :mat="selectionPanelMeta.mat"
      :anz="selectionPanelMeta.anz"
      :style="metadataPanelStyle"
      @update="onMetadataUpdate"
    />
  </div>
</template>

<style scoped>
.viewer-shell {
  position: relative;
  width: 100%;
  height: 100%;
}

.selection-rect {
  position: absolute;
  pointer-events: none;
  border: 1px solid #4a90d9;
  background: rgba(74, 144, 217, 0.12);
  z-index: 2;
}

.selection-rect--crossing {
  border-style: dashed;
  border-color: #3d9e5a;
  background: rgba(61, 158, 90, 0.12);
}
</style>
