/**
 * Map GH GeometryMode output (0 = flat pipeline, 1 = solid pipeline) to viewer state.
 * Null until the first Hops response that includes geometryMode.
 *
 * @param {object} [options]
 * @param {0 | 1 | null | undefined} [options.hopsGeometryMode]
 * @returns {'2d' | '3d' | null}
 */
export function resolveGeometryMode({ hopsGeometryMode } = {}) {
  if (hopsGeometryMode === 0) return '2d'
  if (hopsGeometryMode === 1) return '3d'
  return null
}
