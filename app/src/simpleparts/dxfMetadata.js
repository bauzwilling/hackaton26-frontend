export const DATAB_PART_KEY = 'DATAB_PART_KEY'

const META_KEYS = new Set(['Nr', 'Mat', 'Anz'])

function readXDataValue(entity, targetKey) {
  const strings = entity?.extendedData?.customStrings
  if (!strings?.length) return ''

  for (let i = 0; i < strings.length - 1; i++) {
    if (strings[i] === targetKey) return String(strings[i + 1]).trim()
  }
  return ''
}

export function readEntityMeta(entity) {
  const strings = entity?.extendedData?.customStrings
  if (!strings?.length) return {}

  const meta = {}
  for (let i = 0; i < strings.length - 1; i++) {
    const key = strings[i]
    if (META_KEYS.has(key)) meta[key] = String(strings[i + 1]).trim()
  }
  return meta
}

/** Preview-only XData reader — includes stable part linkage key from Hops preview geometry. */
export function readPreviewEntityMeta(entity) {
  return {
    ...readEntityMeta(entity),
    partKey: readXDataValue(entity, DATAB_PART_KEY),
  }
}

export function safeFilename(name) {
  const n = String(name ?? '').replace(/\s+/g, '').trim().replace(/[\\/:*?"<>|]/g, '_')
  return n || 'UNNAMED'
}

export function isCompleteMeta(meta) {
  const nr = meta.Nr ?? meta.nr ?? ''
  if (!nr || safeFilename(nr) === 'UNNAMED') return false
  if (!String(meta.Mat ?? meta.mat ?? '').trim()) return false
  if (!String(meta.Anz ?? meta.anz ?? '').trim()) return false
  return true
}

function hasAnyMeta(meta) {
  const nr = meta.Nr ?? meta.nr ?? ''
  const mat = meta.Mat ?? meta.mat ?? ''
  const anz = meta.Anz ?? meta.anz ?? ''
  return (
    (!!nr && safeFilename(nr) !== 'UNNAMED')
    || !!String(mat).trim()
    || !!String(anz).trim()
  )
}

/**
 * True for DXF entities that are real mesh geometry (not 2D fills/curves).
 * DXF SOLID is a 2D filled triangle/quad — excluded. ACIS breps (3DSOLID/BODY)
 * are detected separately via dxfTextHasAcisSolid.
 */
export function is3dPartEntity(entity) {
  if (entity.type === '3DFACE' || entity.type === 'MESH') return true
  if (entity.type !== 'POLYLINE') return false
  return entity.isPolyfaceMesh === true || entity.is3dPolygonMesh === true
}

export function list3dPartEntities(dxf) {
  return (dxf?.entities ?? []).filter(is3dPartEntity)
}

function collectXY(entity) {
  const xs = []
  const ys = []
  const add = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x)
      ys.push(y)
    }
  }

  for (const v of entity.vertices ?? []) {
    add(v.x, v.y)
  }
  for (const key of ['firstCorner', 'secondCorner', 'thirdCorner', 'fourthCorner']) {
    const p = entity[key]
    if (p) add(p.x, p.y)
  }
  if (entity.position) add(entity.position.x, entity.position.y)

  if (!xs.length) return null
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

/** One boundary per 3D part entity — no Outside/Inside/Bohr layer logic. */
export function build3dInterpretBoundaries(dxf) {
  return list3dPartEntities(dxf).map((entity) => {
    const meta = readPreviewEntityMeta(entity)
    const handle = String(entity.handle)
    const layer = entity.layer ?? '0'
    return {
      id: handle,
      memberHandles: [handle],
      members: [{ handle, layer, entityType: entity.type ?? 'POLYLINE' }],
      isComposite: false,
      majorityLayer: layer,
      layerOutliers: [],
      hasLayerOutliers: false,
      pts: [],
      bbox: collectXY(entity),
      nr: meta.Nr ?? '',
      mat: meta.Mat ?? '',
      anz: meta.Anz ?? '',
      partKey: meta.partKey ?? '',
    }
  })
}

/** @returns {'complete' | 'partial' | 'none'} */
export function embeddedMetadataState(parts) {
  if (!parts.length) return 'none'

  let anyMeta = false
  let allComplete = true
  for (const part of parts) {
    const meta = { Nr: part.nr ?? '', Mat: part.mat ?? '', Anz: part.anz ?? '' }
    if (hasAnyMeta(meta)) anyMeta = true
    if (!isCompleteMeta(meta)) allComplete = false
  }

  if (allComplete) return 'complete'
  if (anyMeta) return 'partial'
  return 'none'
}
