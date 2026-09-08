const UNASSIGNED_REASON_FIT_IN_SHEET =
  'failed nesting, most likely parts that could not be fit in a sheet'

export function stripWrappingQuotes(value) {
  let trimmed = String(value ?? '').trim()
  while (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    trimmed = trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export function formatUnassignedReason(reason) {
  let trimmed = stripWrappingQuotes(reason)
  const normalized = trimmed.toLowerCase()
  if (
    normalized === UNASSIGNED_REASON_FIT_IN_SHEET ||
    (normalized.includes('could not be fit') && normalized.includes('sheet'))
  ) {
    return 'These parts could not be fit into sheet'
  }
  return trimmed
}

/** Quantity-only GH tokens like "(x)" / "(x2)" with no part name. */
function isQuantityOnlyUnassignedId(value) {
  return /^\(x\d*\)$/i.test(String(value ?? '').trim())
}

export function normalizeUnassignedIds(ids) {
  if (!Array.isArray(ids)) return []
  return ids
    .map((value) => stripWrappingQuotes(value))
    .filter((value) => value && !isQuantityOnlyUnassignedId(value))
}

export function normalizeUnassignedReasons(reasons) {
  if (!Array.isArray(reasons)) return []
  const formatted = reasons
    .map((value) => formatUnassignedReason(value))
    .filter(Boolean)
  return [...new Set(formatted)]
}

export function formatUnassignedIdsDisplay(ids) {
  return normalizeUnassignedIds(ids).join(', ')
}

/** Parse GH/injection amount (Anz); default 1 when missing or invalid. */
export function parsePartAmount(value) {
  const text = String(value ?? '').trim()
  if (!text) return 1
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function normalizeMatchKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function trim(value) {
  return String(value ?? '').trim()
}

/**
 * Amount for part index, preferring metadata override then GH PostInjectionAmount.
 */
export function effectiveAmountForPart(
  index,
  partKeys,
  names,
  amounts,
  metadataOverrides = {},
) {
  const partKey = trim(partKeys[index])
  const name = trim(names[index])
  for (const alias of partRowAliases(partKey, name, index)) {
    const overrideAmount = metadataOverrides[alias]?.anz
    if (overrideAmount !== undefined) return parsePartAmount(overrideAmount)
  }
  return parsePartAmount(amounts[index])
}

function partRowAliases(partKey, name, index) {
  return [partKey, name, `mesh:${index}`].map(trim).filter(Boolean)
}

/** Strip trailing quantity marker like "(x5)" from GH unassigned display IDs. */
function stripQuantitySuffix(value) {
  return trim(value).replace(/\s*\(x\d+\)\s*$/i, '')
}

/** Parse trailing "(xN)" quantity from GH unassigned display IDs. */
function parseQuantitySuffix(value) {
  const match = trim(value).match(/\(x(\d+)\)\s*$/i)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Match set includes raw and quantity-stripped unassigned IDs (case-insensitive). */
function buildUnassignedIdMatchSet(unassignedIds) {
  const idSet = new Set()
  for (const id of unassignedIds) {
    const trimmed = trim(id)
    if (!trimmed) continue
    idSet.add(normalizeMatchKey(trimmed))
    const stripped = stripQuantitySuffix(trimmed)
    if (stripped) idSet.add(normalizeMatchKey(stripped))
  }
  return idSet
}

function rowMatchesUnassignedIdSet(aliases, unassignedIdSet) {
  return aliases.some((alias) => unassignedIdSet.has(normalizeMatchKey(alias)))
}

function amountForUnassignedId(rawId, amountByAlias) {
  const candidates = [rawId, stripQuantitySuffix(rawId)]
    .map((value) => normalizeMatchKey(value))
    .filter(Boolean)
  for (const key of candidates) {
    if (amountByAlias.has(key)) return amountByAlias.get(key)
  }
  return parseQuantitySuffix(rawId) ?? 1
}

/**
 * Map GH unassigned IDs to PartKeys for viewer coloring.
 * GH may return PartKeys or part names (optionally with "(xN)" quantity).
 * When names are provided (aligned with partKeys), match those too.
 * Output is always PartKey strings.
 */
export function resolveUnassignedPartKeys(unassignedIds, partKeys = [], { names = [] } = {}) {
  const normalizedIds = normalizeUnassignedIds(unassignedIds)
  const keys = (Array.isArray(partKeys) ? partKeys : []).map(trim).filter(Boolean)
  if (!normalizedIds.length || !keys.length) return []

  const idSet = buildUnassignedIdMatchSet(normalizedIds)

  const nameList = Array.isArray(names) ? names : []
  const matched = []
  const seen = new Set()
  for (let i = 0; i < keys.length; i += 1) {
    const partKey = trim(keys[i])
    if (!partKey) continue
    const key = normalizeMatchKey(partKey)
    if (seen.has(key)) continue

    const name = trim(nameList[i] ?? '')
    const aliases = [partKey, name].filter(Boolean)
    if (!aliases.some((alias) => idSet.has(normalizeMatchKey(alias)))) continue

    seen.add(key)
    matched.push(partKey)
  }
  return matched
}

/**
 * Map Grasshopper unassigned IDs to mesh descriptor PartKeys for viewer coloring.
 * Prefer PartKey; fall back to descriptor.id only when PartKey is missing.
 * Uses descriptor.nr as name alias when present.
 */
export function resolveUnassignedPartIds(unassignedIds, partDescriptors = []) {
  const descriptors = Array.isArray(partDescriptors) ? partDescriptors : []
  const partKeys = descriptors
    .map((descriptor) => trim(descriptor?.partKey) || trim(descriptor?.id))
    .filter(Boolean)
  const names = descriptors.map((descriptor) => trim(descriptor?.nr))
  return resolveUnassignedPartKeys(unassignedIds, partKeys, { names })
}

/**
 * Nest summary counts weighted by part quantity (Anz), not unique part types.
 * initialPartKeys[i] ↔ postInjectionNames[i] ↔ postInjectionAmount[i].
 */
export function resolveNestingCounts(
  data,
  {
    normalizePartKeys = (keys) => keys,
    normalizeNames = (names) => names,
    normalizeAmounts = (amounts) => amounts,
    metadataOverrides = {},
  } = {},
) {
  const unassignedIds = normalizeUnassignedIds(data?.unassignedIds)
  const partKeys = normalizePartKeys(data?.initialPartKeys ?? [])
  const names = normalizeNames(data?.postInjectionNames ?? [])
  const amounts = normalizeAmounts(data?.postInjectionAmount ?? [])

  if (partKeys.length) {
    let totalUnits = 0
    let unassignedUnits = 0
    const unassignedIdSet = buildUnassignedIdMatchSet(unassignedIds)

    for (let i = 0; i < partKeys.length; i += 1) {
      const partKey = trim(partKeys[i])
      const name = trim(names[i])
      const amount = effectiveAmountForPart(i, partKeys, names, amounts, metadataOverrides)
      const aliases = partRowAliases(partKey, name, i)

      totalUnits += amount
      if (unassignedIds.length && rowMatchesUnassignedIdSet(aliases, unassignedIdSet)) {
        unassignedUnits += amount
      }
    }

    if (unassignedUnits === 0 && unassignedIds.length) {
      const amountByAlias = new Map()
      for (let i = 0; i < partKeys.length; i += 1) {
        const amount = effectiveAmountForPart(i, partKeys, names, amounts, metadataOverrides)
        for (const alias of partRowAliases(trim(partKeys[i]), trim(names[i]), i)) {
          amountByAlias.set(normalizeMatchKey(alias), amount)
        }
      }
      const seen = new Set()
      for (const rawId of unassignedIds) {
        const key = normalizeMatchKey(rawId)
        if (!key || seen.has(key)) continue
        seen.add(key)
        unassignedUnits += amountForUnassignedId(rawId, amountByAlias)
      }
    }

    let unassignedCount = unassignedUnits
    if (unassignedCount === 0 && unassignedIds.length === 0) {
      const unassignedFromMeshes = Array.isArray(data?.unassignedMeshes3d)
        ? data.unassignedMeshes3d.length
        : 0
      unassignedCount = unassignedFromMeshes
    }

    const nestedCount = Math.max(0, totalUnits - unassignedCount)
    return {
      nestedCount,
      unassignedCount,
      unassignedIds,
      totalParts: totalUnits,
    }
  }

  const unassignedFromMeshes = Array.isArray(data?.unassignedMeshes3d)
    ? data.unassignedMeshes3d.length
    : 0
  const unassignedCount = unassignedIds.length || unassignedFromMeshes
  const nestedFromMeshes = Array.isArray(data?.assignedMeshes3d)
    ? data.assignedMeshes3d.length
    : 0
  return {
    nestedCount: nestedFromMeshes,
    unassignedCount,
    unassignedIds,
    totalParts: nestedFromMeshes + unassignedCount,
  }
}
