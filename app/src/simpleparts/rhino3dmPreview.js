import rhino3dm from 'rhino3dm/rhino3dm.module.min.js'
import wasmUrl from 'rhino3dm/rhino3dm.wasm?url'
import { DATAB_PART_KEY } from './dxfMetadata.js'

let rhinoPromise = null

function getRhino() {
  if (!rhinoPromise) {
    rhinoPromise = rhino3dm({ locateFile: () => wasmUrl })
  }
  return rhinoPromise
}

function readPartKeyFromObject(obj) {
  if (!obj?.getUserString) return ''
  try {
    const value = obj.getUserString(DATAB_PART_KEY)
    return value ? String(value).trim() : ''
  } catch {
    return ''
  }
}

function partKeyFromRawJson(json) {
  if (!json || typeof json !== 'object') return ''
  for (const field of ['partKey', 'part_key', DATAB_PART_KEY]) {
    const value = json[field]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  const nested = json.userData?.[DATAB_PART_KEY] ?? json.metadata?.[DATAB_PART_KEY]
  if (nested != null && String(nested).trim()) return String(nested).trim()
  return ''
}

function resolveGhPartKey(initialPartKeys, index) {
  if (!Array.isArray(initialPartKeys)) return ''
  return String(initialPartKeys[index] ?? '').trim()
}

function collectMeshJson(rhino, geometry, out) {
  collectPreviewMeshEntries(rhino, geometry, '', out, { geometryOnly: true })
}

function collectPreviewMeshEntries(rhino, geometry, inheritedPartKey, out, { geometryOnly = false } = {}) {
  const partKey = readPartKeyFromObject(geometry) || inheritedPartKey || ''
  const type = geometry.objectType

  const push = (meshJson) => {
    if (geometryOnly) {
      out.push(meshJson)
      return
    }
    out.push({ geometry: meshJson, partKey })
  }

  if (type === rhino.ObjectType.Mesh) {
    push(geometry.toThreejsJSON())
    return
  }

  if (type === rhino.ObjectType.Extrusion) {
    const mesh = geometry.getMesh(rhino.MeshType.Any)
    if (mesh) {
      push(mesh.toThreejsJSON())
      mesh.delete()
    }
    return
  }

  if (type === rhino.ObjectType.Brep) {
    const faces = geometry.faces()
    for (let i = 0; i < faces.count; i++) {
      const face = faces.get(i)
      const mesh = face?.getMesh(rhino.MeshType.Any)
      if (mesh) {
        push(mesh.toThreejsJSON())
        mesh.delete()
      }
      face?.delete()
    }
    faces.delete()
  }
}

function isRhino3dmMeshJson(json) {
  return json && typeof json === 'object' && 'archive3dm' in json && 'data' in json
}

function isThreeBufferGeometryJson(json) {
  return json && typeof json === 'object' && json.type === 'BufferGeometry'
}

const TEXT_HEIGHT = 50

function textToDxfEntity({ text, position, height = TEXT_HEIGHT, color = 0 }) {
  return {
    type: 'TEXT',
    text: String(text),
    startPoint: position,
    position,
    height,
    rotation: 0,
    color,
    colorIndex: 7,
  }
}

function annotationTextColor() {
  if (typeof document === 'undefined') return 0
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-text-summary')
    .trim()
  if (!hex) return 0
  return parseInt(hex.replace(/^#/, ''), 16)
}

function normalizePosition(point) {
  if (Array.isArray(point) && point.length >= 2) {
    return { x: point[0] ?? 0, y: point[1] ?? 0, z: point[2] ?? 0 }
  }
  if (point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number') {
    return { x: point.x, y: point.y, z: point.z ?? 0 }
  }
  return null
}

function pairInputTextLabels(texts, points) {
  const entities = []
  const color = annotationTextColor()
  const count = Math.min(texts.length, points.length)
  for (let i = 0; i < count; i++) {
    const text = String(texts[i] ?? '').trim()
    if (!text) continue
    const position = normalizePosition(points[i])
    if (!position) continue
    entities.push(textToDxfEntity({ text, position, color }))
  }
  return entities
}

/**
 * Pair correlated InputText strings + InputTextPt absolute positions from HOPS
 * into a minimal DXF object for Three.js text overlay.
 */
export function normalizeInputText(inputText, inputTextPt) {
  const texts = Array.isArray(inputText) ? inputText : []
  const points = Array.isArray(inputTextPt) ? inputTextPt : []
  if (!texts.length || !points.length) return null

  const entities = pairInputTextLabels(texts, points)
  if (!entities.length) return null
  return { entities, blocks: {} }
}

/**
 * Convert Hops preview meshes3d payloads to Three.js geometry plus part keys.
 * Prefers parallel InitialPartKeys from GH; falls back to rhino3dm user strings.
 */
export async function normalizePreviewMeshes3d(meshes3d, initialPartKeys = []) {
  if (!Array.isArray(meshes3d) || !meshes3d.length) {
    return { meshes: [], partKeys: [] }
  }

  const ghPartKeys = Array.isArray(initialPartKeys) ? initialPartKeys : []
  if (ghPartKeys.length && meshes3d.length !== ghPartKeys.length) {
    console.warn(
      `Hops preview mesh/key count mismatch: ${meshes3d.length} meshes vs ${ghPartKeys.length} keys`,
    )
  }

  if (meshes3d.every(isThreeBufferGeometryJson)) {
    return {
      meshes: meshes3d,
      partKeys: meshes3d.map(
        (json, i) => resolveGhPartKey(initialPartKeys, i) || partKeyFromRawJson(json),
      ),
    }
  }

  const rhino = await getRhino()
  const entries = []
  for (let i = 0; i < meshes3d.length; i++) {
    const json = meshes3d[i]
    const ghKey = resolveGhPartKey(initialPartKeys, i)
    if (isThreeBufferGeometryJson(json)) {
      entries.push({ geometry: json, partKey: ghKey || partKeyFromRawJson(json) })
      continue
    }
    if (!isRhino3dmMeshJson(json)) continue
    try {
      const obj = rhino.CommonObject.decode(json)
      if (!obj) continue
      const rootKey = ghKey || readPartKeyFromObject(obj) || partKeyFromRawJson(json)
      collectPreviewMeshEntries(rhino, obj, rootKey, entries)
      obj?.delete?.()
    } catch {
      // Skip geometry we cannot decode.
    }
  }

  return {
    meshes: entries.map((entry) => entry.geometry),
    partKeys: entries.map((entry) => entry.partKey),
  }
}

/**
 * Convert API meshes3d payloads to Three.js BufferGeometry JSON.
 * Accepts pre-serialized BufferGeometry objects or native rhino3dm mesh JSON
 * returned by Rhino.Compute as separate data-tree leaves.
 */
export async function normalizeMeshes3d(meshes3d) {
  const { meshes } = await normalizePreviewMeshes3d(meshes3d)
  return meshes
}

/**
 * Parse a .3dm ArrayBuffer and return an array of Three.js BufferGeometry JSON
 * objects for every cached render mesh found. Returns [] when the file has no
 * meshes to preview.
 */
export async function extractMeshesFrom3dm(arrayBuffer) {
  const rhino = await getRhino()
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(arrayBuffer))
  if (!doc) return []

  const meshes = []
  try {
    const objects = doc.objects()
    for (let i = 0; i < objects.count; i++) {
      const obj = objects.get(i)
      const geo = obj?.geometry()
      if (!geo) {
        obj?.delete?.()
        continue
      }
      try {
        collectMeshJson(rhino, geo, meshes)
      } catch {
        // Skip geometry we can't use.
      }
      geo.delete?.()
      obj?.delete?.()
    }
  } finally {
    doc.delete?.()
  }
  return meshes
}
