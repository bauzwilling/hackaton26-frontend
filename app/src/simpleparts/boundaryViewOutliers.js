import { schemeOutliersForDisplay } from './boundaryDetection.js'
import { withContinuousLinestyle } from './boundaryViewCore.js'

export function collectOutlierLines(boundaries, entityLookup) {
  const seen = new Set()
  const entities = []

  for (const boundary of boundaries) {
    for (const outlier of boundary.layerOutliers ?? []) {
      const handle = String(outlier.handle)
      if (seen.has(handle)) continue
      seen.add(handle)

      const entity = entityLookup.get(handle)
      if (entity?.type === 'LINE') {
        entities.push(withContinuousLinestyle({ ...entity }))
      }
    }
  }

  return entities
}

export function collectSchemeOutlierEntities(schemeOutliers, boundaries, entityLookup) {
  const seen = new Set()
  const entities = []

  for (const outlier of schemeOutliersForDisplay(schemeOutliers, boundaries)) {
    const handle = String(outlier.handle)
    if (seen.has(handle)) continue
    seen.add(handle)

    const entity = entityLookup.get(handle)
    if (entity) {
      entities.push(withContinuousLinestyle({ ...entity }))
    }
  }

  return entities
}
