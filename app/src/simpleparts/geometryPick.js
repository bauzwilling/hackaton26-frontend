import { buildHighlightGeometry } from 'dxf-render'
import { normalizeHandle, isNativeClosedBoundary } from './boundaryDetection.js'

const LINE_TOLERANCE_MULTIPLIER = 2

function pointInPolygon2D(px, py, polygon) {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function entityContainsPoint(entity, x, y, worldMatrix) {
  if (!isNativeClosedBoundary(entity)) return false
  const geom = buildHighlightGeometry(entity, worldMatrix ?? null)
  if (!geom.polylines.length) return false
  for (const pl of geom.polylines) {
    if (pl.length < 3) continue
    if (pointInPolygon2D(x, y, pl)) return true
  }
  return false
}

function pickContainingEntry(pickingIndex, entityIndex, worldPos, { acceptEntry }) {
  const { x, y } = worldPos
  let best = null
  let bestArea = Infinity
  for (const entry of pickingIndex.entries) {
    if (!acceptEntry(entry)) continue
    const handle = normalizeHandle(entry.handle)
    const entity = handle ? entityIndex.get(handle) : null
    if (!entity || isLineEntity(entity)) continue
    if (!entityContainsPoint(entity, x, y, entry.worldMatrix ?? null)) continue
    const area = entryBBoxArea(entry)
    if (area < bestArea) {
      bestArea = area
      best = entry
    }
  }
  return best
}

function pointToSegmentDistanceSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    const ex = px - x1
    const ey = py - y1
    return ex * ex + ey * ey
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const nx = x1 + t * dx - px
  const ny = y1 + t * dy - py
  return nx * nx + ny * ny
}

function minDistanceToPolylines(px, py, polylines) {
  let bestSq = Infinity
  for (const pl of polylines) {
    for (let i = 0; i < pl.length - 1; i++) {
      const a = pl[i]
      const b = pl[i + 1]
      const d = pointToSegmentDistanceSq(px, py, a.x, a.y, b.x, b.y)
      if (d < bestSq) bestSq = d
    }
  }
  return Math.sqrt(bestSq)
}

function distanceToBBoxEdges(px, py, bbox) {
  const minX = bbox.min.x
  const maxX = bbox.max.x
  const minY = bbox.min.y
  const maxY = bbox.max.y
  const dx = Math.max(minX - px, 0, px - maxX)
  const dy = Math.max(minY - py, 0, py - maxY)
  if (dx === 0 && dy === 0) {
    return Math.min(px - minX, maxX - px, py - minY, maxY - py)
  }
  return Math.hypot(dx, dy)
}

function entryBBoxArea(entry) {
  const b = entry.bbox
  return (b.max.x - b.min.x) * (b.max.y - b.min.y)
}

export function isLineEntity(entity) {
  return entity?.type === 'LINE'
}

export function distanceEntityAtPoint(entity, x, y, worldMatrix, bbox = null) {
  const geom = buildHighlightGeometry(entity, worldMatrix ?? null)
  if (geom.fallbackToBBox || !geom.polylines.length) {
    return bbox ? distanceToBBoxEdges(x, y, bbox) : Infinity
  }
  return minDistanceToPolylines(x, y, geom.polylines)
}

export function pickEntryAtWorldPoint(pickingIndex, entityIndex, worldPos, tolerance, { acceptEntry, preferEntry }) {
  if (!pickingIndex || !entityIndex) return null

  const { x, y } = worldPos
  const containing = pickContainingEntry(pickingIndex, entityIndex, worldPos, { acceptEntry })
  if (containing) {
    return containing
  }

  const lineTolerance = tolerance * LINE_TOLERANCE_MULTIPLIER
  const candidates = []

  for (const entry of pickingIndex.entries) {
    if (!acceptEntry(entry)) continue

    const bbox = entry.bbox
    const handle = normalizeHandle(entry.handle)
    const entity = handle ? entityIndex.get(handle) : null
    if (!entity) continue

    const isLine = isLineEntity(entity)
    const maxDist = isLine ? lineTolerance : tolerance
    const bboxPad = maxDist
    if (
      x < bbox.min.x - bboxPad
      || x > bbox.max.x + bboxPad
      || y < bbox.min.y - bboxPad
      || y > bbox.max.y + bboxPad
    ) continue

    const dist = distanceEntityAtPoint(entity, x, y, entry.worldMatrix ?? null, entry.bbox)
    if (dist > maxDist) continue

    candidates.push({ entry, entity, dist, area: entryBBoxArea(entry), isLine })
  }

  if (!candidates.length) return null

  const lineCandidates = candidates.filter((c) => c.isLine)
  let pool = lineCandidates.length ? lineCandidates : candidates

  if (preferEntry) {
    const preferred = pool.filter((c) => preferEntry(c.entry, c.entity))
    if (preferred.length) pool = preferred
  }

  let best = pool[0]
  for (let i = 1; i < pool.length; i++) {
    const c = pool[i]
    if (c.dist < best.dist || (c.dist === best.dist && c.area < best.area)) {
      best = c
    }
  }

  return best.entry
}
