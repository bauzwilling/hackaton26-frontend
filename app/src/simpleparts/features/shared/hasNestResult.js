/** True when a primary nest result is available (job stored; DXF may load async). */
export function hasNestResult(preview) {
  return Boolean(preview?.jobId)
}
