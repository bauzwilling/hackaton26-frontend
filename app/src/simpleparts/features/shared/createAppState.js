import { computed, ref } from 'vue'
import { parseDxf } from 'dxf-vuer'

export const FIELD_LABELS = { nr: 'Name', mat: 'Material', anz: 'Amount' }

export const DEFAULT_SHEET_SIZE = { sheetX: 2500, sheetY: 1250, sheetThickness: 21 }

export const METADATA_MODIFIED_NEST_PROMPT =
  'Part data has been modified. Please run Nesting process again once all necessary modifications have been made.'

/**
 * @param {{ allowedThicknessesMm?: number[] } | null | undefined} material
 * @param {number | null | undefined} thickness
 */
export function materialAllowsThickness(material, thickness) {
  if (material == null || thickness == null) return false
  return material.allowedThicknessesMm?.includes(thickness) ?? false
}

/**
 * @param {{ allowedSizesMm?: Array<{ x: number, y: number }>, allowedThicknessesMm?: number[] } | null | undefined} material
 * @param {{ sheetX: number, sheetY: number, sheetThickness: number } | null | undefined} size
 */
export function sheetFitsMaterial(material, size) {
  if (!material?.allowedSizesMm?.length || !size) return false
  const formatAllowed = material.allowedSizesMm.some(
    (f) => f.x === size.sheetX && f.y === size.sheetY,
  )
  return formatAllowed && materialAllowsThickness(material, size.sheetThickness)
}

/**
 * @param {{ allowedSizesMm: Array<{ x: number, y: number }>, allowedThicknessesMm: number[] }} material
 * @returns {{ sheetX: number, sheetY: number, sheetThickness: number }}
 */
export function sheetDefaultsForMaterial(material) {
  const formats = material.allowedSizesMm
  const preferred = formats.find(
    (f) => f.x === DEFAULT_SHEET_SIZE.sheetX && f.y === DEFAULT_SHEET_SIZE.sheetY,
  )
  const format = preferred ?? formats[0]
  const thicknesses = material.allowedThicknessesMm
  const sheetThickness = thicknesses.includes(DEFAULT_SHEET_SIZE.sheetThickness)
    ? DEFAULT_SHEET_SIZE.sheetThickness
    : thicknesses[0]
  return { sheetX: format.x, sheetY: format.y, sheetThickness }
}

/**
 * @param {unknown} raw
 * @returns {Array<{ x: number, y: number }> | null}
 */
function normalizeAllowedSizesMm(raw) {
  if (!Array.isArray(raw) || !raw.length) return null
  const formats = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const x = Math.round(Number(entry.x))
      const y = Math.round(Number(entry.y))
      if (![x, y].every((n) => Number.isFinite(n) && n > 0)) return null
      return { x, y }
    })
    .filter(Boolean)
  return formats.length ? formats : null
}

/**
 * Normalize API materials payload into UI catalog entries.
 * @param {unknown} payload
 * @returns {Array<{ id: string, label: string, allowedThicknessesMm: number[], allowedSizesMm: Array<{ x: number, y: number }> }>}
 */
export function normalizeMaterialsCatalog(payload) {
  const list = Array.isArray(payload?.materials) ? payload.materials : []
  return list
    .map((raw) => {
      const id = String(raw?.id ?? '').trim()
      const label = String(raw?.name ?? '').trim()
      if (!id || !label) return null
      const allowedThicknessesMm = (Array.isArray(raw?.allowed_thicknesses_mm)
        ? raw.allowed_thicknesses_mm
        : [])
        .map((t) => Math.round(Number(t)))
        .filter((t) => Number.isFinite(t) && t > 0)
      const allowedSizesMm = normalizeAllowedSizesMm(raw?.allowed_sizes_mm)
      if (!allowedSizesMm || !allowedThicknessesMm.length) return null
      return { id, label, allowedThicknessesMm, allowedSizesMm }
    })
    .filter(Boolean)
}

export function createAppState() {
  const selectedFile = ref(null)
  /** Job id from preview solve; nest can reuse saved input without re-upload. */
  const inputJobId = ref(null)
  const dxfText = ref(null)
  const messages = ref([])
  const busy = ref(false)
  const busyMessage = ref('')
  const viewerBusy = ref(false)
  const viewerBusyMessage = ref('')
  const readyForNesting = ref(false)
  const awaitingConfirm = ref(false)
  const step = ref('idle')
  const materialText = ref('')
  const metadataOverrides = ref({})
  const boundaries = ref([])
  const blockInserts = ref([])
  const schemeOutliers = ref([])
  const showMetadataColors = ref(false)
  const showModifiedPartsGreen = ref(false)
  const showPartLabels = ref(false)
  const clickForProperties = ref(false)
  const viewMode = ref('input')
  const showOutlierLines = ref(false)
  const showSchemeOutliers = ref(false)
  const showCorrectParts = ref(false)
  const showIncorrectParts = ref(false)
  const showDimensions = ref(true)
  const modifiedHandles = ref([])
  const hasShownGreenHint = ref(false)
  const dxfInterpreted = ref(false)
  const sourceType = ref('dxf')
  /** @type {import('vue').Ref<'2d' | '3d' | null>} */
  const geometryMode = ref(null)
  const scanPageImages = ref([])
  const scanParts = ref([])
  const scanPartsByPage = ref([])
  const drillDiameterMm = ref(null)
  const meshViewerRef = ref(null)
  const summonedPreview = ref(null)
  /** Successful leftover nest (unassigned DXF re-nested); null until all leftovers fit. */
  const leftoverNestPreview = ref(null)
  const showNestingModal = ref(false)
  const meshPreview = ref(null)
  /** GH InitialPartKeys — canonical part keys for both 2D and 3D preview. */
  const previewPartKeys = ref([])
  const meshPreviewPostInjectionNames = ref([])
  const meshPreviewPostInjectionAmount = ref([])
  const previewNotice = ref(null)
  /** Incremented when a file error should expand the input requirements bubble. */
  const inputRequirementsOpenTick = ref(0)
  const annotationOverlayDxf = ref(null)
  const inspectTextPosition = ref('inside')
  const activeTextPositionSelectId = ref(null)
  const activeSheetSizeSelectId = ref(null)
  const activeSheetSizeConfirmId = ref(null)
  const pendingSheetSize = ref(null)
  const activeMaterialSelectId = ref(null)
  const activeMaterialConfirmId = ref(null)
  /** Active leftover same-vs-different material confirm bubble. */
  const activeLeftoverMaterialReuseId = ref(null)
  /** @type {import('vue').Ref<Array<{ id: string, label: string, allowedThicknessesMm: number[], allowedSizesMm: Array<{ x: number, y: number }> }>>} */
  const materials = ref([])
  /** @type {import('vue').Ref<{ id: string, label: string, allowedThicknessesMm: number[], allowedSizesMm: Array<{ x: number, y: number }> } | null>} */
  const pendingSheetMaterial = ref(null)
  /** @type {import('vue').Ref<{ sheetX: number, sheetY: number, sheetThickness: number } | null>} */
  const pendingLeftoverSheetSize = ref(null)
  /** @type {import('vue').Ref<{ id: string, label: string, allowedThicknessesMm: number[], allowedSizesMm: Array<{ x: number, y: number }> } | null>} */
  const pendingLeftoverSheetMaterial = ref(null)
  /** Groups chat bubbles for the initial nesting flow. */
  const initialNestProcessId = ref(null)
  /** Monotonic attempt number for Initial nesting panels (1, 2, 3…). */
  const initialNestAttempt = ref(0)
  /** Groups chat bubbles for the unassigned-parts renest flow. */
  const leftoverNestProcessId = ref(null)
  /** Groups the combined nesting-complete result after leftover success. */
  const fullSetNestProcessId = ref(null)
  const sheetSizeModifiedSinceNest = ref(false)
  const metadataModifiedSinceNest = ref(false)
  /** @type {import('vue').Ref<null | 'initial' | 'leftover'>} Interrupted nest reveal; Continue reattaches. */
  const nestRevealPaused = ref(null)
  /** @type {import('vue').Ref<null | 'initial' | 'leftover'>} Live nest thinking turn (Stop afforded). */
  const nestRevealLive = ref(null)
  const postNestMetadataEditing = ref(false)
  const nestingViewerKey = ref(0)
  const inputPreviewMeshes = ref(null)
  const inputPreviewPartKeys = ref(null)
  const inputPreviewPostInjectionNames = ref(null)
  const inputPreviewPostInjectionAmount = ref(null)
  const inputPreviewAnnotationDxf = ref(null)
  /** @type {import('vue').Ref<Array<{ nr?: string, mat?: string, anz?: string }> | null>} */
  const meshDescriptorBaseMeta = ref(null)
  /** Last GH GeometryMode output (0 = flat pipeline, 1 = solid pipeline). */
  const lastHopsGeometryMode = ref(null)
  const activeExportAssociatedMessageId = ref(null)
  const embeddedMetaState = ref('none')

  let summonPreviewTask = null
  let previewGeneration = 0
  /** @type {AbortController | null} */
  let previewAbortController = null

  function cancelSummonPreview() {
    previewGeneration += 1
    previewAbortController?.abort()
    previewAbortController = null
    summonPreviewTask = null
  }

  function beginSummonPreview() {
    previewGeneration += 1
    previewAbortController?.abort()
    previewAbortController = new AbortController()
    return {
      generation: previewGeneration,
      signal: previewAbortController.signal,
    }
  }

  function isCurrentPreviewGeneration(generation) {
    return generation === previewGeneration
  }

  const parsedDxf = computed(() => {
    if (!dxfText.value) return null
    try {
      return parseDxf(dxfText.value)
    } catch {
      return null
    }
  })

  const requiresHopsProcessing = computed(
    () =>
      sourceType.value === 'dwg'
      || sourceType.value === '3dm'
      || sourceType.value === 'dxf',
  )

  const hasBoxes = computed(() => !!selectedFile.value)

  return {
    selectedFile,
    inputJobId,
    dxfText,
    messages,
    busy,
    busyMessage,
    viewerBusy,
    viewerBusyMessage,
    readyForNesting,
    awaitingConfirm,
    step,
    materialText,
    metadataOverrides,
    boundaries,
    blockInserts,
    schemeOutliers,
    showMetadataColors,
    showModifiedPartsGreen,
    showPartLabels,
    clickForProperties,
    viewMode,
    showOutlierLines,
    showSchemeOutliers,
    showCorrectParts,
    showIncorrectParts,
    showDimensions,
    modifiedHandles,
    hasShownGreenHint,
    dxfInterpreted,
    sourceType,
    geometryMode,
    scanPageImages,
    scanParts,
    scanPartsByPage,
    drillDiameterMm,
    meshViewerRef,
    summonedPreview,
    leftoverNestPreview,
    showNestingModal,
    meshPreview,
    previewPartKeys,
    meshPreviewPostInjectionNames,
    meshPreviewPostInjectionAmount,
    previewNotice,
    inputRequirementsOpenTick,
    annotationOverlayDxf,
    inspectTextPosition,
    activeTextPositionSelectId,
    activeSheetSizeSelectId,
    activeSheetSizeConfirmId,
    pendingSheetSize,
    activeMaterialSelectId,
    activeMaterialConfirmId,
    activeLeftoverMaterialReuseId,
    materials,
    pendingSheetMaterial,
    pendingLeftoverSheetSize,
    pendingLeftoverSheetMaterial,
    initialNestProcessId,
    initialNestAttempt,
    leftoverNestProcessId,
    fullSetNestProcessId,
    sheetSizeModifiedSinceNest,
    metadataModifiedSinceNest,
    nestRevealPaused,
    nestRevealLive,
    postNestMetadataEditing,
    nestingViewerKey,
    inputPreviewMeshes,
    inputPreviewPartKeys,
    inputPreviewPostInjectionNames,
    inputPreviewPostInjectionAmount,
    inputPreviewAnnotationDxf,
    meshDescriptorBaseMeta,
    lastHopsGeometryMode,
    activeExportAssociatedMessageId,
    embeddedMetaState,
    parsedDxf,
    requiresHopsProcessing,
    hasBoxes,
    getSummonPreviewTask: () => summonPreviewTask,
    setSummonPreviewTask: (task) => {
      summonPreviewTask = task
    },
    cancelSummonPreview,
    beginSummonPreview,
    isCurrentPreviewGeneration,
  }
}
