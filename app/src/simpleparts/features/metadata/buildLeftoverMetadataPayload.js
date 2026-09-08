import { resolveUnassignedPartKeys } from '../shared/unassignedDisplay.js'

const META_FIELDS = ['nr', 'mat', 'anz']

function trim(value) {
  return String(value ?? '').trim()
}

function normalizeMatchKey(value) {
  return trim(value).toLowerCase()
}

function entryFromFields({ nr, mat, anz }) {
  const out = {}
  if (nr) out.nr = nr
  if (mat) out.mat = mat
  if (anz) out.anz = anz
  return Object.keys(out).length ? out : null
}

function overrideForAliases(metadataOverrides, aliases) {
  for (const alias of aliases) {
    const key = trim(alias)
    if (!key) continue
    const entry = metadataOverrides?.[key]
    if (entry && typeof entry === 'object') return entry
  }
  return null
}

/**
 * Prefer stored unassignedPartKeys; else map unassignedIds → InitialPartKeys.
 */
export function resolveLeftoverPartKeysFromPreview(preview = {}, { fallbackPartKeys = [] } = {}) {
  if (preview?.unassignedPartKeys?.length) {
    return preview.unassignedPartKeys.map(trim).filter(Boolean)
  }
  const nestPartKeys = preview?.initialPartKeys?.length
    ? preview.initialPartKeys
    : fallbackPartKeys
  return resolveUnassignedPartKeys(preview?.unassignedIds ?? [], nestPartKeys, {
    names: preview?.postInjectionNames ?? [],
  })
}

function resolveTargetKeys({
  partKeys,
  names,
  unassignedPartKeys,
  unassignedIds,
}) {
  let targetKeys = (Array.isArray(unassignedPartKeys) ? unassignedPartKeys : [])
    .map(trim)
    .filter(Boolean)
  if (!targetKeys.length) {
    targetKeys = resolveUnassignedPartKeys(unassignedIds, partKeys, { names })
  }
  return targetKeys
}

/**
 * Read-only projection of effective {nr,mat,anz} for unassigned parts.
 * Returns override map (partKey + nr aliases) and ordered rows for index force.
 */
export function buildLeftoverMetadataBundle({
  initialPartKeys = [],
  postInjectionNames = [],
  postInjectionAmount = [],
  unassignedPartKeys = [],
  unassignedIds = [],
  metadataOverrides = {},
} = {}) {
  const partKeys = (Array.isArray(initialPartKeys) ? initialPartKeys : []).map(trim)
  const names = (Array.isArray(postInjectionNames) ? postInjectionNames : []).map(trim)
  const amounts = (Array.isArray(postInjectionAmount) ? postInjectionAmount : []).map(trim)

  const targetKeys = resolveTargetKeys({
    partKeys,
    names,
    unassignedPartKeys,
    unassignedIds,
  })
  if (!targetKeys.length) {
    return { overrides: {}, ordered: [] }
  }

  const targetSet = new Set(targetKeys.map(normalizeMatchKey))
  const byPartKey = new Map()
  const overrides = {}

  for (let i = 0; i < partKeys.length; i += 1) {
    const partKey = partKeys[i]
    if (!partKey || !targetSet.has(normalizeMatchKey(partKey))) continue

    const name = names[i] ?? ''
    const amount = amounts[i] ?? ''
    const override = overrideForAliases(metadataOverrides, [partKey, name, `mesh:${i}`])

    const nr = trim(override?.nr) || name
    const anz = trim(override?.anz) || amount
    const mat = trim(override?.mat)

    const entry = entryFromFields({ nr, mat, anz })
    if (!entry) continue

    byPartKey.set(normalizeMatchKey(partKey), { partKey, ...entry })
    overrides[partKey] = { ...entry }
    if (nr && normalizeMatchKey(nr) !== normalizeMatchKey(partKey)) {
      overrides[nr] = { ...entry }
    }
  }

  const ordered = []
  for (const key of targetKeys) {
    const row = byPartKey.get(normalizeMatchKey(key))
    if (!row) continue
    const cleaned = { partKey: row.partKey }
    for (const field of META_FIELDS) {
      if (row[field]) cleaned[field] = row[field]
    }
    ordered.push(cleaned)
  }

  return { overrides, ordered }
}

/** Override map only (partKey + nr aliases) for MetadataOverrides form field. */
export function buildLeftoverMetadataPayload(args) {
  return buildLeftoverMetadataBundle(args).overrides
}
