import { isNativeClosedBoundary } from './boundaryDetection.js'
import {
  collectOutlierLines,
  collectSchemeOutlierEntities,
} from './boundaryViewOutliers.js'

const TOLERANCE = 0.01
const CONTINUOUS_LINETYPE = 'Continuous'

export function withContinuousLinestyle(entity) {
  return {
    ...entity,
    lineType: CONTINUOUS_LINETYPE,
    lineTypeScale: 1,
    hasContinuousLinetypePattern: true,
  }
}

function entityByHandle(dxf) {
  return new Map(dxf.entities.map((e) => [String(e.handle), e]))
}

function trimClosingVertex(vertices) {
  if (vertices.length <= 1) return vertices
  const first = vertices[0]
  const last = vertices[vertices.length - 1]
  if (
    Math.abs(first.x - last.x) <= TOLERANCE
    && Math.abs(first.y - last.y) <= TOLERANCE
  ) {
    return vertices.slice(0, -1)
  }
  return vertices
}

function boundaryToEntity(boundary, entityLookup) {
  const { memberHandles, pts, id, majorityLayer } = boundary

  if (memberHandles.length === 1) {
    const original = entityLookup.get(String(memberHandles[0]))
    if (original && isNativeClosedBoundary(original)) {
      return withContinuousLinestyle({ ...original, handle: id })
    }
  }

  const vertices = trimClosingVertex((pts ?? []).map((p) => ({ x: p.x, y: p.y })))
  return withContinuousLinestyle({
    type: 'LWPOLYLINE',
    handle: id,
    layer: majorityLayer ?? '0',
    vertices,
    shape: true,
  })
}

const TEXT_ENTITY_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB'])
const ANNOTATION_ENTITY_TYPES = new Set([
  'TEXT',
  'MTEXT',
  'ATTRIB',
  'DIMENSION',
  'LEADER',
  'MULTILEADER',
])
export const SCAN_DIM_LAYER = 'SCAN Bemassung'

function annotationTextColor() {
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--color-text-summary').trim()
  return parseInt(hex.replace(/^#/, ''), 16)
}

function collectTextEntities(parsedDxf) {
  return (parsedDxf.entities ?? []).filter((e) => TEXT_ENTITY_TYPES.has(e.type))
}

/** DXF subset for annotation overlay on shaded mesh preview. */
export function buildAnnotationOverlayDxf(parsedDxf) {
  if (!parsedDxf) return null
  const color = annotationTextColor()
  const entities = (parsedDxf.entities ?? [])
    .filter((e) => ANNOTATION_ENTITY_TYPES.has(e.type))
    .map((e) => (
      TEXT_ENTITY_TYPES.has(e.type)
        ? { ...e, color, colorIndex: 7 }
        : e
    ))
  if (!entities.length) return null
  return {
    ...parsedDxf,
    entities,
    blocks: parsedDxf.blocks ?? {},
  }
}

function collectScanAnnotationEntities(parsedDxf) {
  return (parsedDxf.entities ?? []).filter(
    (e) =>
      e.layer === SCAN_DIM_LAYER
      && (TEXT_ENTITY_TYPES.has(e.type) || e.type === 'LINE'),
  )
}

export function buildOutputDxf(
  parsedDxf,
  boundaries,
  { showOutlierLines = false, showSchemeOutliers = false, schemeOutliers = [], includeText = false } = {},
) {
  const entityLookup = entityByHandle(parsedDxf)
  const boundaryEntities = boundaries.map((b) => boundaryToEntity(b, entityLookup))

  let entities = showOutlierLines
    ? [...boundaryEntities, ...collectOutlierLines(boundaries, entityLookup)]
    : [...boundaryEntities]

  if (showSchemeOutliers && schemeOutliers.length) {
    entities = [...entities, ...collectSchemeOutlierEntities(schemeOutliers, boundaries, entityLookup)]
  }

  if (includeText) {
    entities = [...entities, ...collectScanAnnotationEntities(parsedDxf)]
  }

  const { blocks: _blocks, ...rest } = parsedDxf
  return { ...rest, entities }
}

export { collectTextEntities }
