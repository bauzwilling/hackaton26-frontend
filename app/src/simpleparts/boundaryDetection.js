import {
  buildHighlightGeometry,
  ACI_PALETTE,
  resolveAci7Hex,
  rgbNumberToHex,
} from 'dxf-render'

const CURVE_TYPES = new Set([
  'LINE', 'LWPOLYLINE', 'POLYLINE', 'POLYLINE3D',
  'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE',
])

export const LAYER_OUTSIDE = 'OUTSIDE'
export const LAYER_INSIDE = 'INSIDE'
export const LAYER_BORES = 'BORES'
export const LAYER_TEXT = 'TEXT'
export const LAYER_PLATE = 'PLATE'
export const ADMITTED_LAYERS = new Set([LAYER_OUTSIDE, LAYER_INSIDE, LAYER_BORES])

/** Canonical nesting layers editable for export rename. */
export const EXPORTABLE_LAYERS = [
  LAYER_OUTSIDE,
  LAYER_INSIDE,
  LAYER_BORES,
  LAYER_TEXT,
  LAYER_PLATE,
]

export function defaultExportLayerNames() {
  return Object.fromEntries(EXPORTABLE_LAYERS.map((name) => [name, name]))
}

/** Build `OUTSIDE:EXT;INSIDE:HOLE` query value; omit identity pairs. */
export function serializeLayerRenameMap(names) {
  const parts = []
  for (const canonical of EXPORTABLE_LAYERS) {
    const exportName = String(names?.[canonical] ?? '').trim()
    if (!exportName || exportName === canonical) continue
    parts.push(`${canonical}:${exportName}`)
  }
  return parts.join(';')
}

/** Canonical → trimmed export name (empty → canonical). */
export function normalizeExportLayerMap(names) {
  const map = defaultExportLayerNames()
  for (const canonical of EXPORTABLE_LAYERS) {
    const value = String(names?.[canonical] ?? '').trim()
    map[canonical] = value || canonical
  }
  return map
}

/** Non-identity pairs only. */
export function activeLayerRenameMap(names) {
  const normalized = normalizeExportLayerMap(names)
  const active = {}
  for (const canonical of EXPORTABLE_LAYERS) {
    if (normalized[canonical] !== canonical) active[canonical] = normalized[canonical]
  }
  return active
}

/** Map displayed/export layer names back to canonical for download excludeLayers. */
export function toCanonicalLayerNames(layerNames, exportNames) {
  const normalized = normalizeExportLayerMap(exportNames)
  const reverse = {}
  for (const canonical of EXPORTABLE_LAYERS) {
    reverse[normalized[canonical]] = canonical
  }
  return (layerNames ?? []).map((name) => reverse[name] ?? name)
}

/**
 * Rename layers in a parsed DXF (tables + entities) for viewer display.
 * Mutates and returns the same object.
 */
export function applyLayerRenameToParsedDxf(dxf, names) {
  const active = activeLayerRenameMap(names)
  const oldNames = Object.keys(active)
  if (!dxf || !oldNames.length) return dxf

  const tableLayers = dxf.tables?.layer?.layers
  if (tableLayers) {
    for (const oldName of oldNames) {
      const newName = active[oldName]
      const entry = tableLayers[oldName]
      if (!entry) continue
      delete tableLayers[oldName]
      tableLayers[newName] = { ...entry, name: newName }
    }
  }

  for (const entity of dxf.entities ?? []) {
    const next = active[entity.layer]
    if (next) entity.layer = next
  }
  for (const block of Object.values(dxf.blocks ?? {})) {
    for (const entity of block.entities ?? []) {
      const next = active[entity.layer]
      if (next) entity.layer = next
    }
  }
  return dxf
}

/** Layer names kept in the DXF but omitted from the viewer LayerPanel. */
export function isHiddenLayerTableName(name) {
  return (name ?? '').trim() === '0'
}

/**
 * Build LayerPanel rows from parsed DXF data, omitting system layer `0`.
 * Colors come from the DXF layer table (ACI / true color), matching dxf-vuer.
 */
export function buildLayerPanelLayers(dxf, hiddenLayers = []) {
  const tableLayers = dxf?.tables?.layer?.layers ?? {}
  const counts = {}
  for (const name of Object.keys(tableLayers)) {
    if (isHiddenLayerTableName(name)) continue
    counts[name] = 0
  }
  for (const entity of dxf?.entities ?? []) {
    const name = entity.layer ?? '0'
    if (isHiddenLayerTableName(name)) continue
    counts[name] = (counts[name] + 1) || 1
  }
  const hidden = hiddenLayers ?? []
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entityCount]) => {
      const table = tableLayers[name]
      return {
        name,
        visible: !hidden.includes(name),
        frozen: Boolean(table?.frozen),
        locked: Boolean(table?.locked),
        color: layerTableColorHex(table),
        entityCount,
      }
    })
}

function layerTableColorHex(layer) {
  if (!layer) return '#888888'
  const idx = Number(layer.colorIndex)
  if (Number.isFinite(idx) && idx >= 1 && idx <= 255) {
    if (idx === 7 || idx === 255) return resolveAci7Hex(false)
    const rgb = ACI_PALETTE[idx]
    if (rgb != null) return `#${Number(rgb).toString(16).padStart(6, '0')}`
  }
  if (layer.color != null && layer.color !== 0) {
    try {
      return rgbNumberToHex(layer.color)
    } catch {
      /* fall through */
    }
  }
  return '#888888'
}

/** Output view colors for nested GH layers. */
export const NESTING_LAYER_COLOR = {
  [LAYER_OUTSIDE]: 'red',
  [LAYER_INSIDE]: 'blue',
  [LAYER_BORES]: 'orange',
  [LAYER_TEXT]: 'green',
}

const SKIP_LAYER_RE = /defpoints|bemassung/i
const DEFAULT_TOLERANCE = 0.01
const MIN_BBOX_DIM = 10
const MAX_BBOX_DIM = 5000
const PREVIEW_TOLERANCE_SCALE = 1e-5

function snapKey(pt, tolerance) {
  return `${Math.round(pt.x / tolerance)},${Math.round(pt.y / tolerance)}`
}

function pointsClose(a, b, tolerance) {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
}

function polylineLength(pts) {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  }
  return total
}

function isAdmittedLayer(layer) {
  return ADMITTED_LAYERS.has(layer ?? '0')
}

function shouldSkipJoinLayer(layer) {
  return SKIP_LAYER_RE.test(layer ?? '')
}

/** Admitted-layer curves plus foreign LINEs that may close open Outside chains. */
function includeInBoundaryJoin(entity) {
  if (!CURVE_TYPES.has(entity.type)) return false
  const layer = entity.layer ?? '0'
  if (shouldSkipJoinLayer(layer)) return false
  if (isAdmittedLayer(layer)) return true
  return entity.type === 'LINE'
}

/** All joinable curves on non-skip layers (HOPS preview / export join). */
function includeInExportJoin(entity) {
  if (!CURVE_TYPES.has(entity.type)) return false
  const layer = entity.layer ?? '0'
  return !shouldSkipJoinLayer(layer)
}

/** Entities on layers other than Outside, Inside, or Bores. */
export function findSchemeOutliers(dxf) {
  const outliers = []
  const seen = new Set()
  for (const entity of dxf?.entities ?? []) {
    const layer = entity.layer ?? '0'
    if (ADMITTED_LAYERS.has(layer)) continue
    const handle = String(entity.handle)
    if (seen.has(handle)) continue
    seen.add(handle)
    outliers.push({
      handle,
      layer,
      entityType: entity.type,
    })
  }
  return outliers
}

export function isNativeClosedBoundary(entity) {
  if (entity.type === 'CIRCLE' || entity.type === 'ELLIPSE') return true
  if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
    return entity.shape === true || entity.isPolyfaceMesh === true
  }
  return false
}

function isEndpointClosedPolyline(entity, tolerance) {
  if (entity.type !== 'LWPOLYLINE' && entity.type !== 'POLYLINE') return false
  const pts = entityChainPts(entity, tolerance)
  if (!pts || pts.length < 3) return false
  return pointsClose(pts[0], pts[pts.length - 1], tolerance)
}

function entityIsClosedForJoin(entity, tolerance) {
  return isNativeClosedBoundary(entity) || isEndpointClosedPolyline(entity, tolerance)
}

function entityChainPts(entity, tolerance) {
  const geom = buildHighlightGeometry(entity, null)
  const polylines = geom?.polylines ?? []
  if (!polylines.length) return null

  const merged = []
  for (const pl of polylines) {
    if (!pl?.length) continue
    if (!merged.length) {
      merged.push(...pl)
      continue
    }
    const last = merged[merged.length - 1]
    const first = pl[0]
    if (pointsClose(last, first, tolerance)) {
      merged.push(...pl.slice(1))
    } else {
      merged.push(...pl)
    }
  }

  if (merged.length < 2) return null
  return merged
}

function collectEdges(entities, tolerance, includeFn = includeInBoundaryJoin) {
  const edges = []
  const nodeMap = new Map()

  const addNode = (key, edgeIdx) => {
    if (!nodeMap.has(key)) nodeMap.set(key, [])
    nodeMap.get(key).push(edgeIdx)
  }

  for (const entity of entities) {
    if (!CURVE_TYPES.has(entity.type)) continue
    const layer = entity.layer ?? '0'
    if (!includeFn(entity)) continue

    const chain = entityChainPts(entity, tolerance)
    if (!chain || chain.length < 2) continue

    let pts = chain
    const nativeClosed = entityIsClosedForJoin(entity, tolerance)
    if (nativeClosed && pointsClose(pts[0], pts[pts.length - 1], tolerance) && pts.length > 1) {
      pts = pts.slice(0, -1)
    }

    const startKey = snapKey(pts[0], tolerance)
    const endKey = snapKey(pts[pts.length - 1], tolerance)
    const idx = edges.length
    edges.push({
      handle: String(entity.handle),
      layer,
      entityType: entity.type,
      pts,
      startKey,
      endKey,
      nativeClosed,
    })
    addNode(startKey, idx)
    addNode(endKey, idx)
  }

  return { edges, nodeMap }
}

function pickNextEdge(nodeMap, nodeKey, used) {
  const list = nodeMap.get(nodeKey) ?? []
  for (const edgeIdx of list) {
    if (!used.has(edgeIdx)) return edgeIdx
  }
  return null
}

function orientEdge(edge, connectKey, tolerance) {
  if (edge.startKey === connectKey) return { pts: edge.pts, tailKey: edge.endKey }
  if (edge.endKey === connectKey) {
    return { pts: [...edge.pts].reverse(), tailKey: edge.startKey }
  }
  const sk = snapKey(edge.pts[0], tolerance)
  const ek = snapKey(edge.pts[edge.pts.length - 1], tolerance)
  if (sk === connectKey) return { pts: edge.pts, tailKey: ek }
  return { pts: [...edge.pts].reverse(), tailKey: sk }
}

function mergeChainPts(chainIndices, edges, tolerance) {
  if (!chainIndices.length) return []

  const first = edges[chainIndices[0]]
  const merged = [...first.pts]
  let tailKey = first.endKey

  for (let i = 1; i < chainIndices.length; i++) {
    const edge = edges[chainIndices[i]]
    const { pts, tailKey: nextKey } = orientEdge(edge, tailKey, tolerance)
    if (pointsClose(merged[merged.length - 1], pts[0], tolerance)) {
      merged.push(...pts.slice(1))
    } else {
      merged.push(...pts)
    }
    tailKey = nextKey
  }

  return merged
}

function buildChains(edges, nodeMap, tolerance) {
  const used = new Set()
  const closed = []

  for (let startIdx = 0; startIdx < edges.length; startIdx++) {
    if (used.has(startIdx)) continue

    const chain = walkChainIndices(startIdx, edges, nodeMap)
    for (const idx of chain) used.add(idx)
    if (!chainIsClosed(chain, edges, tolerance)) continue

    let pts = mergeChainPts(chain, edges, tolerance)
    if (!pointsClose(pts[0], pts[pts.length - 1], tolerance)) {
      pts = [...pts, pts[0]]
    }

    const members = []
    const seen = new Set()
    for (const idx of chain) {
      const edge = edges[idx]
      if (seen.has(edge.handle)) continue
      seen.add(edge.handle)
      members.push({
        handle: edge.handle,
        layer: edge.layer,
        entityType: edge.entityType,
      })
    }

    closed.push({ pts, members })
  }

  return closed
}

function walkChainIndices(startIdx, edges, nodeMap) {
  const used = new Set([startIdx])
  const chain = [startIdx]

  while (true) {
    const tailKey = edges[chain[chain.length - 1]].endKey
    const nxt = pickNextEdge(nodeMap, tailKey, used)
    if (nxt === null) break
    chain.push(nxt)
    used.add(nxt)
  }

  while (true) {
    const headKey = edges[chain[0]].startKey
    const prev = pickNextEdge(nodeMap, headKey, used)
    if (prev === null) break
    chain.unshift(prev)
    used.add(prev)
  }

  return chain
}

function chainIsClosed(chain, edges, tolerance) {
  if (chain.length < 1) return false
  const pts = mergeChainPts(chain, edges, tolerance)
  if (pts.length < 3) return false

  const headEdge = edges[chain[0]]
  const tailEdge = edges[chain[chain.length - 1]]
  const chainStart = headEdge.pts[0]
  const chainEnd = tailEdge.pts[tailEdge.pts.length - 1]

  if (pointsClose(pts[0], pts[pts.length - 1], tolerance)) return true
  if (pointsClose(chainStart, chainEnd, tolerance)) return true
  if (chain.length === 1 && headEdge.nativeClosed) return true
  return false
}

function chainMemberHandles(chain, edges) {
  const members = []
  const seen = new Set()
  for (const idx of chain) {
    const edge = edges[idx]
    if (seen.has(edge.handle)) continue
    seen.add(edge.handle)
    members.push(String(edge.handle))
  }
  return members
}

/** Closed chain member handles for DWG preview pick fallback. */
export function findClosedChainMembers(dxf, handle) {
  const entities = dxf?.entities ?? []
  const joinTolerance = resolveJoinTolerance(entities, undefined, includeInExportJoin, { previewMode: true })
  const { edges, nodeMap } = collectEdges(entities, joinTolerance, includeInExportJoin)
  const target = normalizeHandle(handle)
  const startIdx = edges.findIndex((e) => normalizeHandle(e.handle) === target)
  if (startIdx < 0) return null

  const chain = walkChainIndices(startIdx, edges, nodeMap)
  if (!chainIsClosed(chain, edges, joinTolerance)) return null
  const members = chainMemberHandles(chain, edges)
  return members.length > 1 ? members : null
}

function majorityLayer(members, edgesByHandle) {
  if (!members.length) return null

  const layers = new Map()
  for (const member of members) {
    const layer = member.layer
    const entry = layers.get(layer) ?? { count: 0, length: 0 }
    entry.count += 1
    for (const edge of edgesByHandle.get(member.handle) ?? []) {
      entry.length += polylineLength(edge.pts)
    }
    layers.set(layer, entry)
  }

  return [...layers.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count
    if (b[1].length !== a[1].length) return b[1].length - a[1].length
    return a[0].localeCompare(b[0])
  })[0][0]
}

function flagForeignLineOutliers(members, majority) {
  if (!majority) return []
  return members
    .filter((m) => m.entityType === 'LINE' && m.layer !== majority)
    .map((m) => ({ handle: m.handle, layer: m.layer, entityType: 'LINE' }))
}

function layerVoteKey([layer, stats]) {
  return [-stats.count, -stats.length, layer]
}

function inferClosingLayer(preliminaryOutliers, edgesByHandle) {
  if (!preliminaryOutliers.length) return null

  const layers = new Map()
  for (const outlier of preliminaryOutliers) {
    const layer = outlier.layer
    const entry = layers.get(layer) ?? { count: 0, length: 0 }
    entry.count += 1
    for (const edge of edgesByHandle.get(outlier.handle) ?? []) {
      entry.length += polylineLength(edge.pts)
    }
    layers.set(layer, entry)
  }

  return [...layers.entries()].sort((a, b) => {
    const ka = layerVoteKey(a)
    const kb = layerVoteKey(b)
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1
    }
    return 0
  })[0][0]
}

function classifyClosingLines(members, closingLayer, edgesByHandle) {
  const layerOutliers = members
    .filter((m) => m.entityType === 'LINE' && m.layer === closingLayer)
    .map((m) => ({ handle: m.handle, layer: m.layer, entityType: 'LINE' }))
  const nonClosing = members.filter(
    (m) => !(m.entityType === 'LINE' && m.layer === closingLayer),
  )
  const majority = majorityLayer(nonClosing, edgesByHandle)
    ?? majorityLayer(members, edgesByHandle)
  return { majority, layerOutliers }
}

function dedupeBoundaries(boundaries) {
  if (boundaries.length <= 1) return boundaries
  const drop = new Set()
  const sets = boundaries.map((b) => new Set(b.memberHandles))

  for (let i = 0; i < sets.length; i++) {
    if (drop.has(i)) continue
    for (let j = 0; j < sets.length; j++) {
      if (i === j || drop.has(j)) continue
      const sub = [...sets[i]].every((h) => sets[j].has(h))
      const strict = sets[i].size < sets[j].size
      if (sub && strict) {
        drop.add(i)
        break
      }
    }
  }

  return boundaries.filter((_, idx) => !drop.has(idx))
}

function boundaryId(memberHandles) {
  return [...memberHandles].sort()[0]
}

function bboxFromPts(pts) {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

function drawingExtents(entities, tolerance, includeFn) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const entity of entities) {
    if (!CURVE_TYPES.has(entity.type)) continue
    if (!includeFn(entity)) continue
    const pts = entityChainPts(entity, tolerance)
    if (!pts) continue
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }

  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function drawingDiagonal(extents) {
  if (!extents) return null
  return Math.hypot(extents.maxX - extents.minX, extents.maxY - extents.minY)
}

function resolveJoinTolerance(entities, tolerance, includeFn, { previewMode = false } = {}) {
  if (tolerance != null) return tolerance
  const diag = drawingDiagonal(drawingExtents(entities, DEFAULT_TOLERANCE, includeFn))
  if (!diag) return DEFAULT_TOLERANCE
  const scaled = Math.max(DEFAULT_TOLERANCE, diag * PREVIEW_TOLERANCE_SCALE)
  return previewMode ? scaled : DEFAULT_TOLERANCE
}

function bboxInDetectableRange(pts, { previewMode = false, drawingDiag = null } = {}) {
  if (pts.length < 2) return false
  const bbox = bboxFromPts(pts)
  const width = bbox.maxX - bbox.minX
  const height = bbox.maxY - bbox.minY

  if (previewMode) {
    const maxDim = drawingDiag != null ? Math.max(drawingDiag * 2, MAX_BBOX_DIM) : MAX_BBOX_DIM
    if (width > maxDim || height > maxDim) return false
    return width > 0 || height > 0
  }

  if (width < MIN_BBOX_DIM || height < MIN_BBOX_DIM) return false
  if (width > MAX_BBOX_DIM || height > MAX_BBOX_DIM) return false
  return true
}

function mergeMetaFromEntities(memberHandles, entityByHandle, readMeta) {
  let nr = ''
  let mat = ''
  let anz = ''
  let partKey = ''
  for (const handle of memberHandles) {
    const entity = entityByHandle.get(handle)
    if (!entity) continue
    const meta = readMeta(entity)
    if (!nr && meta.Nr) nr = meta.Nr
    if (!mat && meta.Mat) mat = meta.Mat
    if (!anz && meta.Anz) anz = meta.Anz
    if (!partKey && meta.partKey) partKey = meta.partKey
  }
  return { nr, mat, anz, partKey }
}

export function findBoundaries(dxf, tolerance = DEFAULT_TOLERANCE, readMeta = () => ({})) {
  return findBoundariesWithJoin(dxf, tolerance, readMeta, includeInBoundaryJoin)
}

/** Closed boundaries using export join — all curves on non-skip layers (HOPS preview DXF). */
export function findPreviewBoundaries(dxf, tolerance, readMeta = () => ({})) {
  return findBoundariesWithJoin(dxf, tolerance, readMeta, includeInExportJoin, { previewMode: true })
}

function findBoundariesWithJoin(dxf, tolerance, readMeta, includeFn, { previewMode = false } = {}) {
  const entities = dxf?.entities ?? []
  const joinTolerance = resolveJoinTolerance(entities, tolerance, includeFn, { previewMode })
  const drawingDiag = previewMode
    ? drawingDiagonal(drawingExtents(entities, joinTolerance, includeFn))
    : null
  const entityByHandle = new Map(entities.map((e) => [String(e.handle), e]))
  const { edges, nodeMap } = collectEdges(entities, joinTolerance, includeFn)
  const chains = buildChains(edges, nodeMap, joinTolerance)

  const edgesByHandle = new Map()
  for (const edge of edges) {
    if (!edgesByHandle.has(edge.handle)) edgesByHandle.set(edge.handle, [])
    edgesByHandle.get(edge.handle).push(edge)
  }

  const bboxOpts = { previewMode, drawingDiag }
  const pending = chains
    .filter((chain) => bboxInDetectableRange(chain.pts, bboxOpts))
    .map((chain) => {
      const memberHandles = chain.members.map((m) => m.handle)
      const preliminaryMajority = majorityLayer(chain.members, edgesByHandle)
      const preliminaryOutliers = flagForeignLineOutliers(chain.members, preliminaryMajority)
      const meta = mergeMetaFromEntities(memberHandles, entityByHandle, readMeta)
      const bbox = bboxFromPts(chain.pts)

      return {
        id: boundaryId(memberHandles),
        memberHandles,
        members: chain.members,
        isComposite: memberHandles.length > 1,
        preliminaryMajority,
        preliminaryOutliers,
        pts: chain.pts,
        bbox,
        ...meta,
      }
    })

  const allPreliminaryOutliers = pending.flatMap((item) => item.preliminaryOutliers)
  const closingLayer = inferClosingLayer(allPreliminaryOutliers, edgesByHandle)

  const raw = pending.map((item) => {
    const { majority, layerOutliers } = closingLayer
      ? classifyClosingLines(item.members, closingLayer, edgesByHandle)
      : {
          majority: item.preliminaryMajority,
          layerOutliers: item.preliminaryOutliers,
        }

    return {
      id: item.id,
      memberHandles: item.memberHandles,
      members: item.members,
      isComposite: item.isComposite,
      majorityLayer: majority,
      layerOutliers,
      hasLayerOutliers: layerOutliers.length > 0,
      pts: item.pts,
      bbox: item.bbox,
      nr: item.nr,
      mat: item.mat,
      anz: item.anz,
      partKey: item.partKey ?? '',
    }
  })

  return dedupeBoundaries(raw)
}

/** Resolve GH parallel-list index for a boundary (partKey match, else fallback index). */
export function ghListIndexForBoundary(boundary, initialPartKeys, fallbackIndex) {
  const keys = Array.isArray(initialPartKeys)
    ? initialPartKeys.map((k) => String(k ?? '').trim()).filter(Boolean)
    : []
  const fromXData = String(boundary?.partKey ?? '').trim()
  if (fromXData) {
    const matched = keys.indexOf(fromXData)
    if (matched >= 0) return matched
  }
  return fallbackIndex
}

/** Apply GH InitialPartKeys to preview boundaries (partKey-first, index fallback). */
export function applyInitialPartKeys(boundaries, initialPartKeys) {
  if (!Array.isArray(boundaries) || !Array.isArray(initialPartKeys) || !initialPartKeys.length) {
    return boundaries
  }
  const keys = initialPartKeys.map((k) => String(k ?? '').trim())
  return boundaries.map((boundary, i) => {
    const fromXData = String(boundary.partKey ?? '').trim()
    if (fromXData && keys.includes(fromXData)) {
      return { ...boundary, partKey: fromXData }
    }
    const ghKey = String(keys[i] ?? '').trim()
    if (!ghKey) return boundary
    return { ...boundary, partKey: ghKey }
  })
}

/** Apply GH PostInjectionNames / PostInjectionAmount (partKey-first, index fallback). */
export function applyInitialPartMetadata(
  boundaries,
  postInjectionNames,
  postInjectionAmount,
  initialPartKeys = [],
) {
  if (!Array.isArray(boundaries) || !boundaries.length) return boundaries
  const names = Array.isArray(postInjectionNames) ? postInjectionNames : []
  const amounts = Array.isArray(postInjectionAmount) ? postInjectionAmount : []
  return boundaries.map((boundary, i) => {
    const idx = ghListIndexForBoundary(boundary, initialPartKeys, i)
    const nr = String(names[idx] ?? '').trim()
    const anz = String(amounts[idx] ?? '').trim()
    if (!nr && !anz) return boundary
    return {
      ...boundary,
      ...(nr ? { nr } : {}),
      ...(anz ? { anz } : {}),
    }
  })
}

export function normalizeHandle(handle) {
  if (handle == null || handle === '') return null
  if (typeof handle === 'string') {
    const trimmed = handle.trim()
    return /^[0-9a-fA-F]+$/.test(trimmed) ? trimmed.toUpperCase() : trimmed
  }
  return handle.toString(16).toUpperCase()
}

export function boundaryForHandle(handle, boundaries) {
  const h = normalizeHandle(handle)
  if (!h) return null
  return boundaries.find(
    (b) => normalizeHandle(b.id) === h
      || b.memberHandles.some((member) => normalizeHandle(member) === h),
  ) ?? null
}

export function isLayerOutlier(handle, boundaries) {
  const h = normalizeHandle(handle)
  if (!h) return false
  return boundaries.some((b) =>
    (b.layerOutliers ?? []).some((o) => normalizeHandle(o.handle) === h),
  )
}

function closingLineHandles(boundaries) {
  const handles = new Set()
  for (const b of boundaries) {
    for (const o of b.layerOutliers ?? []) {
      const h = normalizeHandle(o.handle)
      if (h) handles.add(h)
    }
  }
  return handles
}

/** Non-scheme-layer entities not already shown as closing lines. */
export function schemeOutliersForDisplay(schemeOutliers, boundaries) {
  const closing = closingLineHandles(boundaries)
  return (schemeOutliers ?? []).filter((o) => {
    const h = normalizeHandle(o.handle)
    return h && !closing.has(h)
  })
}

export function isSchemeOutlierDisplay(handle, schemeOutliers, boundaries) {
  const h = normalizeHandle(handle)
  if (!h) return false
  return schemeOutliersForDisplay(schemeOutliers, boundaries).some(
    (o) => normalizeHandle(o.handle) === h,
  )
}

export function pointInBoundary(x, y, boundary, tolerance = DEFAULT_TOLERANCE) {
  const pts = boundary.pts
  if (!pts || pts.length < 3) return false

  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function isNestedBoundary(boundary, boundaries) {
  const cx = boundary.bbox?.centerX
  const cy = boundary.bbox?.centerY
  if (cx == null || cy == null) return false
  return boundaries.some(
    (other) => other.id !== boundary.id && pointInBoundary(cx, cy, other),
  )
}

export function topLevelBoundaries(boundaries, allBoundaries = boundaries) {
  return boundaries.filter((b) => !isNestedBoundary(b, allBoundaries))
}
