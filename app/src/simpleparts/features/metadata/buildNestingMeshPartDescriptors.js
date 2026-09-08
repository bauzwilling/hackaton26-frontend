import { buildMeshPartDescriptors } from './meshMetadataSelection.js'
import { normalizeGhStringList } from './seedPostNestMetadata.js'

/**
 * Nest assignedMeshes3d is a filtered subset of InitialPartKeys (unassigned omitted).
 * Bind descriptors to that assigned order — not initialPartKeys[0..meshCount).
 */
export function buildNestingMeshPartDescriptors({
  assignedMeshCount = 0,
  initialPartKeys = [],
  postInjectionNames = [],
  postInjectionAmount = [],
  unassignedPartKeys = [],
} = {}) {
  const meshCount = Number(assignedMeshCount) || 0
  if (!meshCount) return []

  const allKeys = normalizeGhStringList(initialPartKeys)
  const names = normalizeGhStringList(postInjectionNames)
  const amounts = normalizeGhStringList(postInjectionAmount)
  const unassignedSet = new Set(
    normalizeGhStringList(unassignedPartKeys).filter(Boolean),
  )

  const assignedKeys = []
  const baseMeta = []
  for (let i = 0; i < allKeys.length; i += 1) {
    const partKey = allKeys[i]
    if (unassignedSet.has(partKey)) continue
    assignedKeys.push(partKey)
    const nr = names[i] ?? ''
    const anz = amounts[i] ?? ''
    baseMeta.push({
      ...(nr ? { nr } : {}),
      ...(anz ? { anz } : {}),
    })
  }

  // When unassigned keys are unknown/empty, fall back to leading keys (legacy).
  const partKeys = assignedKeys.length
    ? assignedKeys
    : allKeys

  const meta = assignedKeys.length
    ? baseMeta
    : Array.from({ length: Math.max(meshCount, partKeys.length) }, (_, i) => {
        const nr = names[i] ?? ''
        const anz = amounts[i] ?? ''
        return {
          ...(nr ? { nr } : {}),
          ...(anz ? { anz } : {}),
        }
      })

  return buildMeshPartDescriptors(meshCount, partKeys, meta)
}
