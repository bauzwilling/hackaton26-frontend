const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g

const REQUIRED_FIELD_LABELS = {
  owner: 'Owner',
  projectId: 'Project Id',
  element: 'Element',
  material: 'Material',
}

export function sanitizeFilenameSegment(value) {
  return String(value ?? '')
    .trim()
    .replace(UNSAFE_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
}

export function formatSheetDimensions(sheetX, sheetY) {
  const x = Math.round(Number(sheetX))
  const y = Math.round(Number(sheetY))
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return ''
  return `${x}x${y}`
}

export function formatSheetThickness(sheetThickness) {
  const thickness = Math.round(Number(sheetThickness))
  if (!Number.isFinite(thickness) || thickness <= 0) return ''
  return String(thickness)
}

export function buildDownloadFilename(
  { owner, projectId, element, material, dimensions, thickness, comments },
  kind,
) {
  const parts = [owner, projectId, element, material, dimensions, thickness]
    .map(sanitizeFilenameSegment)
    .filter(Boolean)
  const commentsPart = sanitizeFilenameSegment(comments)
  if (commentsPart) parts.push(commentsPart)
  const kindSuffix = kind === 'unassigned' ? 'unassigned' : 'nesting'
  const extension = kind === 'unassigned' ? 'dxf' : 'zip'
  return `${parts.join('-')}-${kindSuffix}.${extension}`
}

export function getMissingRequiredDownloadFields({ owner, projectId, element, material }) {
  return Object.entries({ owner, projectId, element, material })
    .filter(([, value]) => !sanitizeFilenameSegment(value).length)
    .map(([key]) => REQUIRED_FIELD_LABELS[key])
}

export function hasSheetSizeForDownload(sheetX, sheetY, sheetThickness) {
  return Boolean(
    formatSheetDimensions(sheetX, sheetY) && formatSheetThickness(sheetThickness),
  )
}
