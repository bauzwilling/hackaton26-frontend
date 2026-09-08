import { safeFilename } from '../shared/curveHelpers.js'
import { applyMetadataByPartKeys, buildPartRegistry, resolvePartByNr } from './partRegistry.js'

/**
 * Pre-nest mesh preview descriptors. Uses DATAB_PART_KEY from Hops when available.
 */
export function buildMeshPartDescriptors(meshCount, partKeys = [], baseMeta = []) {
  if (!meshCount) return []
  return Array.from({ length: meshCount }, (_, i) => {
    const partKey = String(partKeys[i] ?? '').trim()
    const base = baseMeta[i] ?? {}
    return {
      id: partKey || `mesh:${i}`,
      partKey,
      nr: String(base.nr ?? '').trim(),
      mat: String(base.mat ?? '').trim(),
      anz: String(base.anz ?? '').trim(),
    }
  })
}

function overrideForDescriptor(descriptor, metadataOverrides) {
  const partKey = String(descriptor?.partKey ?? '').trim()
  const id = String(descriptor?.id ?? '').trim()
  return {
    ...(partKey ? metadataOverrides?.[partKey] : {}),
    ...(id ? metadataOverrides?.[id] : {}),
  }
}

export function descriptorMeta(descriptor, metadataOverrides) {
  const ov = overrideForDescriptor(descriptor, metadataOverrides)
  return {
    Nr: ov.nr ?? descriptor.nr ?? '',
    Mat: ov.mat ?? descriptor.mat ?? '',
    Anz: ov.anz ?? descriptor.anz ?? '',
  }
}

export function isMissingSerial(meta) {
  const nr = meta.Nr ?? ''
  return !nr || safeFilename(nr) === 'UNNAMED'
}

export function panelMetaForDescriptor(descriptor, metadataOverrides) {
  const meta = descriptorMeta(descriptor, metadataOverrides)
  return {
    nr: isMissingSerial(meta) ? '' : meta.Nr,
    mat: meta.Mat,
    anz: meta.Anz,
  }
}

export function canonicalPartKeyForDescriptor(descriptor, fallbackId) {
  return String(descriptor?.partKey ?? '').trim() || String(fallbackId ?? '').trim()
}

export function applyMetadataUpdate({
  selectedIds,
  field,
  value,
  metadataOverrides,
  partDescriptors = [],
} = {}) {
  const byId = new Map(partDescriptors.map((descriptor) => [descriptor.id, descriptor]))
  const canonicalKeys = selectedIds.map((id) => {
    const descriptor = byId.get(id)
    return canonicalPartKeyForDescriptor(descriptor, id)
  })

  const overrides = applyMetadataByPartKeys({
    partKeys: canonicalKeys,
    field,
    value,
    metadataOverrides,
  })
  return { overrides, targets: canonicalKeys }
}

/** @deprecated Prefer resolvePartByNr on a full part registry. */
export function findDescriptorByNr(partDescriptors, partNr, metadataOverrides = {}) {
  const registry = buildPartRegistry({ meshPartDescriptors: partDescriptors })
  const resolved = resolvePartByNr(registry, partNr, metadataOverrides)
  if (!resolved) return null
  const { entry } = resolved
  return {
    id: entry.selectionMeshId ?? entry.id,
    partKey: entry.partKey,
    nr: entry.nr,
    mat: entry.mat,
    anz: entry.anz,
  }
}
