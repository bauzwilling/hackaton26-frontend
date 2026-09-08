const DIMENSION_TYPE = 'DIMENSION'

export function isDimensionEntity(entity) {
  return entity?.type === DIMENSION_TYPE
}

export function hasDimensionEntities(dxf) {
  return (dxf?.entities ?? []).some(isDimensionEntity)
}

export function filterDimensionEntities(dxf) {
  if (!dxf) return dxf
  return {
    ...dxf,
    entities: (dxf.entities ?? []).filter((e) => !isDimensionEntity(e)),
  }
}
