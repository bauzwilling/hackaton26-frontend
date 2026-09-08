/** GH PostInjectionNames / PostInjectionAmount — parallel to InitialPartKeys by index. */

export function normalizeGhStringList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((value) => String(value ?? '').trim())
}

function metaFromGhIndex(names, amounts, index) {
  const nr = String(names[index] ?? '').trim()
  const anz = String(amounts[index] ?? '').trim()
  if (!nr && !anz) return null
  const out = {}
  if (nr) out.nr = nr
  if (anz) out.anz = anz
  return out
}

function mergeSeedEntry(existing, seeded) {
  if (!seeded) return existing ?? null
  if (!existing) return { ...seeded }
  return {
    nr: String(existing.nr ?? '').trim() || seeded.nr,
    mat: String(existing.mat ?? '').trim() || seeded.mat,
    anz: String(existing.anz ?? '').trim() || seeded.anz,
  }
}

function applyMetaToKeys(overrides, keys, meta) {
  if (!meta) return overrides
  let next = { ...overrides }
  for (const key of keys) {
    const id = String(key ?? '').trim()
    if (!id) continue
    const merged = mergeSeedEntry(next[id], meta)
    if (merged) next[id] = merged
  }
  return next
}

export function buildDescriptorBaseMetaFromGhLists({
  partKeys = [],
  postInjectionNames = [],
  postInjectionAmount = [],
  meshCount = 0,
} = {}) {
  const names = normalizeGhStringList(postInjectionNames)
  const amounts = normalizeGhStringList(postInjectionAmount)
  const count = Math.max(meshCount, partKeys.length, names.length, amounts.length)
  const baseMeta = []
  for (let i = 0; i < count; i += 1) {
    baseMeta[i] = metaFromGhIndex(names, amounts, i) ?? {}
  }
  return baseMeta
}

/**
 * Seed metadataOverrides and mesh descriptor base meta from GH association lists.
 * meshes[i] ↔ partKeys[i] ↔ postInjectionNames[i] ↔ postInjectionAmount[i].
 *
 * @param {object} opts
 * @param {string[]} [opts.partKeys] — keys used to write overrides (prefer raw GH InitialPartKeys)
 * @param {string[]} [opts.descriptorPartKeys] — per-mesh keys for viewer base meta (may be expanded)
 * @param {boolean} [opts.replaceOverrides=false] — when true, ignore incoming overrides and seed fresh
 */
export function seedPostNestMetadata({
  partKeys = [],
  descriptorPartKeys = null,
  postInjectionNames = [],
  postInjectionAmount = [],
  metadataOverrides = {},
  meshCount = 0,
  replaceOverrides = false,
} = {}) {
  const names = normalizeGhStringList(postInjectionNames)
  const amounts = normalizeGhStringList(postInjectionAmount)
  const associationKeys = partKeys.map((value) => String(value ?? '').trim())
  let overrides = replaceOverrides ? {} : { ...metadataOverrides }

  /** @type {Map<string, { nr?: string, mat?: string, anz?: string }>} */
  const metaByPartKey = new Map()
  const associationCount = Math.max(associationKeys.length, names.length, amounts.length)
  for (let i = 0; i < associationCount; i += 1) {
    const meta = metaFromGhIndex(names, amounts, i)
    if (!meta) continue
    const partKey = associationKeys[i] || `mesh:${i}`
    if (metaByPartKey.has(partKey)) continue
    metaByPartKey.set(partKey, meta)
    overrides = applyMetaToKeys(overrides, [partKey], meta)
  }

  const descriptorKeys = Array.isArray(descriptorPartKeys) && descriptorPartKeys.length
    ? descriptorPartKeys.map((value) => String(value ?? '').trim())
    : associationKeys
  const descriptorCount = Math.max(meshCount, descriptorKeys.length)
  const meshDescriptorBaseMeta = []
  for (let i = 0; i < descriptorCount; i += 1) {
    const partKey = descriptorKeys[i] || `mesh:${i}`
    meshDescriptorBaseMeta[i] =
      metaByPartKey.get(partKey)
      ?? metaFromGhIndex(names, amounts, i)
      ?? {}
  }
  if (meshCount > 0) {
    while (meshDescriptorBaseMeta.length < meshCount) meshDescriptorBaseMeta.push({})
    meshDescriptorBaseMeta.length = meshCount
  }

  return { metadataOverrides: overrides, meshDescriptorBaseMeta }
}
