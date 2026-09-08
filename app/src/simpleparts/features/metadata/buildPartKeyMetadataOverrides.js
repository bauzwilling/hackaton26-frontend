const META_FIELDS = ['nr', 'mat', 'anz']

function trim(value) {
  return String(value ?? '').trim()
}

function normalizeOverrideEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const out = {}
  for (const field of META_FIELDS) {
    const value = trim(entry[field])
    if (value) out[field] = value
  }
  return Object.keys(out).length ? out : null
}

function mergeOverrideEntry(existing, entry) {
  const normalized = normalizeOverrideEntry(entry)
  if (!normalized) return existing
  return { ...(existing ?? {}), ...normalized }
}

/**
 * Map override aliases (partKey, descriptor.id, mesh:i) to canonical GH part keys.
 */
function buildCanonicalPartKeyMap(meshPartDescriptors = [], partKeys = []) {
  const aliasToCanonical = new Map()
  const count = Math.max(meshPartDescriptors.length, partKeys.length)

  for (let i = 0; i < count; i += 1) {
    const descriptor = meshPartDescriptors[i]
    const ghKey = trim(partKeys[i])
    const descriptorPartKey = trim(descriptor?.partKey)
    const descriptorId = trim(descriptor?.id)
    const meshAlias = `mesh:${i}`

    const canonical =
      ghKey
      || descriptorPartKey
      || descriptorId
      || meshAlias

    for (const alias of [ghKey, descriptorPartKey, descriptorId, meshAlias]) {
      if (alias) aliasToCanonical.set(alias, canonical)
    }
  }

  return aliasToCanonical
}

/**
 * Remap in-app metadataOverrides to a partKey map for Hops nest.
 * Output keys must match GH InitialPartKeys values.
 */
export function buildPartKeyMetadataOverrides({
  metadataOverrides = {},
  meshPartDescriptors = [],
  partKeys = [],
} = {}) {
  const aliasToCanonical = buildCanonicalPartKeyMap(meshPartDescriptors, partKeys)
  const result = {}
  let dropped = 0

  for (const [key, entry] of Object.entries(metadataOverrides)) {
    const alias = trim(key)
    if (!alias) continue
    const canonical = aliasToCanonical.get(alias)
    if (!canonical) {
      dropped += 1
      continue
    }
    const merged = mergeOverrideEntry(result[canonical], entry)
    if (merged) result[canonical] = merged
  }

  if (dropped > 0) {
    console.warn(
      `buildPartKeyMetadataOverrides: dropped ${dropped} override key(s) with no matching part`,
    )
  }

  return result
}
