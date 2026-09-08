import { safeFilename } from '../shared/curveHelpers.js'

const META_FIELDS = ['nr', 'mat', 'anz']

function trim(value) {
  return String(value ?? '').trim()
}

function uniqueKeys(keys) {
  return [...new Set(keys.map(trim).filter(Boolean))]
}

function mergeMeta(base, override) {
  const out = { ...base }
  for (const field of META_FIELDS) {
    const value = trim(override?.[field])
    if (value) out[field] = value
  }
  return out
}

/**
 * Build a unified part registry from mesh descriptors and DXF boundaries.
 * Canonical override key is partKey when GH provides one; otherwise boundary.id.
 */
export function buildPartRegistry({
  meshPartDescriptors = [],
  boundaries = [],
} = {}) {
  const byKey = new Map()

  function upsert(rawKey, patch) {
    const key = trim(rawKey)
    if (!key) return
    const existing = byKey.get(key) ?? {
      partKey: key,
      id: key,
      nr: '',
      mat: '',
      anz: '',
      aliasKeys: [],
      meshIndex: null,
      selectionMeshId: null,
      boundaryId: null,
      memberHandles: [],
    }
    const next = {
      ...existing,
      ...patch,
      aliasKeys: uniqueKeys([...existing.aliasKeys, ...(patch.aliasKeys ?? []), key]),
    }
    byKey.set(key, next)
    return next
  }

  meshPartDescriptors.forEach((descriptor, meshIndex) => {
    const partKey = trim(descriptor.partKey) || trim(descriptor.id) || `mesh:${meshIndex}`
    upsert(partKey, {
      partKey,
      id: trim(descriptor.id) || partKey,
      nr: trim(descriptor.nr),
      mat: trim(descriptor.mat),
      anz: trim(descriptor.anz),
      meshIndex,
      selectionMeshId: trim(descriptor.id) || partKey,
      aliasKeys: uniqueKeys([partKey, descriptor.id, descriptor.partKey]),
    })
  })

  for (const boundary of boundaries) {
    const boundaryId = trim(boundary?.id)
    if (!boundaryId) continue
    const partKey = trim(boundary?.partKey) || boundaryId
    const memberHandles = Array.isArray(boundary?.memberHandles)
      ? boundary.memberHandles.map(trim).filter(Boolean)
      : []
    upsert(partKey, {
      partKey,
      id: partKey,
      nr: trim(boundary?.nr) || byKey.get(partKey)?.nr || '',
      mat: trim(boundary?.mat) || byKey.get(partKey)?.mat || '',
      anz: trim(boundary?.anz) || byKey.get(partKey)?.anz || '',
      boundaryId,
      memberHandles,
      aliasKeys: uniqueKeys([partKey, boundaryId, boundary?.partKey, ...memberHandles]),
    })
  }

  return [...byKey.values()]
}

export function partKeyForBoundary(boundary) {
  const partKey = trim(boundary?.partKey)
  const boundaryId = trim(boundary?.id)
  return partKey || boundaryId
}

export function legacyBoundaryAliasKeys(boundary) {
  return uniqueKeys([
    partKeyForBoundary(boundary),
    boundary?.partKey,
    boundary?.id,
    ...(boundary?.memberHandles ?? []),
  ])
}

export function boundaryEffectiveMeta(boundary, metadataOverrides = {}) {
  let meta = {
    nr: trim(boundary?.nr),
    mat: trim(boundary?.mat),
    anz: trim(boundary?.anz),
  }
  for (const key of legacyBoundaryAliasKeys(boundary)) {
    meta = mergeMeta(meta, metadataOverrides[key])
  }
  return {
    Nr: meta.nr,
    Mat: meta.mat,
    Anz: meta.anz,
  }
}

export function effectivePartMeta(entry, metadataOverrides = {}) {
  let meta = {
    nr: trim(entry?.nr),
    mat: trim(entry?.mat),
    anz: trim(entry?.anz),
  }
  for (const key of uniqueKeys([...(entry?.aliasKeys ?? []), entry?.partKey, entry?.id])) {
    meta = mergeMeta(meta, metadataOverrides[key])
  }
  return meta
}

/**
 * Resolve a part by display name (nr), partKey, or legacy id.
 */
export function resolvePartByNr(registry, partNr, metadataOverrides = {}) {
  const nrKey = safeFilename(partNr)
  const idMatch = trim(partNr)
  if (!idMatch) return null

  for (const entry of registry) {
    const meta = effectivePartMeta(entry, metadataOverrides)
    if (safeFilename(meta.nr) === nrKey) return { entry, meta }
    if (entry.partKey === idMatch || entry.id === idMatch) return { entry, meta }
  }
  return null
}

export function listKnownPartNrs(registry, metadataOverrides = {}) {
  return registry
    .map((entry) => effectivePartMeta(entry, metadataOverrides).nr)
    .filter(Boolean)
}

export function partsSnapshotFromRegistry(registry, metadataOverrides = {}) {
  return registry.map((entry) => {
    const meta = effectivePartMeta(entry, metadataOverrides)
    return { nr: meta.nr, mat: meta.mat, anz: meta.anz, partKey: entry.partKey }
  })
}

export function applyMetadataByPartKey(partKey, field, value, metadataOverrides = {}) {
  const key = trim(partKey)
  if (!key || !META_FIELDS.includes(field)) return metadataOverrides
  return {
    ...metadataOverrides,
    [key]: { ...metadataOverrides[key], [field]: value },
  }
}

export function applyMetadataByPartKeys({ partKeys, field, value, metadataOverrides = {} }) {
  let overrides = { ...metadataOverrides }
  for (const partKey of partKeys) {
    overrides = applyMetadataByPartKey(partKey, field, value, overrides)
  }
  return overrides
}
