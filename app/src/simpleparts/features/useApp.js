import { computed, watch } from 'vue'
import { createAppState, METADATA_MODIFIED_NEST_PROMPT, normalizeMaterialsCatalog, sheetDefaultsForMaterial, sheetFitsMaterial } from './shared/createAppState.js'
import { createMessaging, safeFilename } from './shared/curveHelpers.js'
import { useChat } from './chat/useChat.js'
import { useMetadataPanel } from './metadata/useMetadataPanel.js'
import {
  buildMeshPartDescriptors,
} from './metadata/meshMetadataSelection.js'
import {
  applyMetadataByPartKeys,
  buildPartRegistry,
  effectivePartMeta,
  resolvePartByNr,
  listKnownPartNrs,
} from './metadata/partRegistry.js'
import { buildPartKeyMetadataOverrides } from './metadata/buildPartKeyMetadataOverrides.js'
import { buildLeftoverMetadataBundle, resolveLeftoverPartKeysFromPreview } from './metadata/buildLeftoverMetadataPayload.js'
import { seedPostNestMetadata, normalizeGhStringList, buildDescriptorBaseMetaFromGhLists } from './metadata/seedPostNestMetadata.js'
import { buildNestingMeshPartDescriptors } from './metadata/buildNestingMeshPartDescriptors.js'
import { reconcilePostInjectionWithInputText } from './metadata/reconcilePostInjectionWithInputText.js'
import {
  normalizeInputText,
  normalizeMeshes3d,
  normalizePreviewMeshes3d,
} from '../rhino3dmPreview.js'

import {
  formatUnassignedIdsDisplay,
  normalizeUnassignedReasons,
  resolveNestingCounts,
  resolveUnassignedPartIds,
  resolveUnassignedPartKeys,
} from './shared/unassignedDisplay.js'
import { hasNestResult } from './shared/hasNestResult.js'
import { resolveGeometryMode } from './viewer/resolveGeometryMode.js'
import { useViewerRouting } from './viewer/useViewerRouting.js'
import { buildPool } from './thinking/thinkingMessages.js'
import { createThinkingRotator } from './thinking/createThinkingRotator.js'
import { createThinkingChat } from './thinking/createThinkingChat.js'
import {
  buildLeftoverNestFingerprint,
  buildNestFingerprint,
  createSpeculativeNest,
} from './nesting/createSpeculativeNest.js'

const MIN_REVEAL_THINK_MS = 1500

const NEST_CONTINUE_PROMPT = 'Nesting paused — continue when you’re ready.'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildNestingResultMessage(nestedCount, unassignedCount) {
  if (unassignedCount === 0) {
    return `Nesting complete — ${nestedCount} part${nestedCount === 1 ? '' : 's'}.`
  }
  return `Nesting complete — ${nestedCount} nested, ${unassignedCount} not nested.`
}

function buildLeftoverCompleteMessage(nestedCount, previouslyUnassignedCount) {
  const previouslyLabel = previouslyUnassignedCount === 1 ? 'part' : 'parts'
  return `Nesting complete — ${nestedCount} nested + ${previouslyUnassignedCount} previously unassigned ${previouslyLabel} nested`
}

async function fetchJobDxfText(jobId) {
  if (!jobId) return ''
  // WAITING BFF: GET /api/jobs/:id/download/preview — Simple Parts Flask stand-in
  const res = await fetch(`/api/jobs/${jobId}/download/preview`)
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.error || 'Failed to load nesting DXF')
  }
  return await res.text()
}

function resetFileState(state) {
  state.selectedFile.value = null
  state.inputJobId.value = null
  state.dxfText.value = null
  state.messages.value = []
  state.busy.value = false
  state.busyMessage.value = ''
  state.viewerBusy.value = false
  state.viewerBusyMessage.value = ''
  state.readyForNesting.value = false
  state.awaitingConfirm.value = false
  state.step.value = 'idle'
  state.metadataOverrides.value = {}
  state.modifiedHandles.value = []
  state.boundaries.value = []
  state.blockInserts.value = []
  state.schemeOutliers.value = []
  state.dxfInterpreted.value = false
  state.sourceType.value = 'dxf'
  state.geometryMode.value = null
  state.summonedPreview.value = null
  state.leftoverNestPreview.value = null
  state.pendingLeftoverSheetSize.value = null
  state.pendingLeftoverSheetMaterial.value = null
  state.initialNestProcessId.value = null
  state.initialNestAttempt.value = 0
  state.leftoverNestProcessId.value = null
  state.fullSetNestProcessId.value = null
  state.showNestingModal.value = false
  state.cancelSummonPreview()
  state.viewMode.value = 'input'
  state.meshPreview.value = null
  state.previewPartKeys.value = []
  state.meshPreviewPostInjectionNames.value = []
  state.meshPreviewPostInjectionAmount.value = []
  state.previewNotice.value = null
  state.annotationOverlayDxf.value = null
  state.activeSheetSizeSelectId.value = null
  state.activeSheetSizeConfirmId.value = null
  state.pendingSheetSize.value = null
  state.activeMaterialSelectId.value = null
  state.activeMaterialConfirmId.value = null
  state.activeLeftoverMaterialReuseId.value = null
  state.pendingSheetMaterial.value = null
  state.sheetSizeModifiedSinceNest.value = false
  state.metadataModifiedSinceNest.value = false
  state.nestRevealPaused.value = null
  state.nestRevealLive.value = null
  state.postNestMetadataEditing.value = false
  // Keep nestingViewerKey monotonic across file attaches (remount guarantee).
  state.inputPreviewMeshes.value = null
  state.inputPreviewPartKeys.value = null
  state.inputPreviewPostInjectionNames.value = null
  state.inputPreviewPostInjectionAmount.value = null
  state.inputPreviewAnnotationDxf.value = null
  state.lastHopsGeometryMode.value = null
  state.meshDescriptorBaseMeta.value = null
}

export function useApp() {
  const state = createAppState()
  const { pushMessage, FIELD_LABELS } = createMessaging(state)
  const thinkingChat = createThinkingChat(state, pushMessage)
  const speculativeNest = createSpeculativeNest()
  const speculativeLeftoverNest = createSpeculativeNest()

  /** @type {{ kind: 'initial' | 'leftover', interrupt: (opts?: { keepContinue?: boolean }) => void } | null} */
  let activeRevealSession = null

  /**
   * Drop interrupted Continue affordance and end any live reveal UI.
   * @param {'initial' | 'leftover' | null} [kind] — null clears both kinds
   */
  function clearNestRevealInterrupted(kind = null) {
    if (activeRevealSession && (kind == null || activeRevealSession.kind === kind)) {
      activeRevealSession.interrupt({ keepContinue: false })
    }
    if (kind == null || state.nestRevealPaused.value === kind) {
      state.nestRevealPaused.value = null
    }
  }

  function cancelInitialNest() {
    clearNestRevealInterrupted('initial')
    speculativeNest.cancel()
  }

  function cancelLeftoverNest() {
    clearNestRevealInterrupted('leftover')
    speculativeLeftoverNest.cancel()
    state.busy.value = false
    state.busyMessage.value = ''
  }

  async function loadMaterialsCatalog() {
    try {
      // WAITING BFF: GET /api/materials — Simple Parts Flask stand-in; the UI should call the Platform BFF
      const res = await fetch('/api/materials')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      state.materials.value = normalizeMaterialsCatalog(data)
    } catch (err) {
      console.error('Failed to load materials catalog', err)
      state.materials.value = []
    }
  }

  loadMaterialsCatalog()

  const REQUIREMENTS_HINT = 'Please check the input file requirements above.'

  function pushFileError(content) {
    pushMessage('assistant', 'error', `${content}\n\n${REQUIREMENTS_HINT}`)
    state.inputRequirementsOpenTick.value += 1
  }

  /**
   * Hard errors (blocks) block continuing; soft flags are non-blocking chat warnings.
   * @returns {boolean} false when a hard error blocks continuing
   */
  function checkHardTypeError(data) {
    if (!data?.errorHard) return true

    pushFileError(
      'Blocks were found in this file. Explode the blocks and revise the file, then re-upload.',
    )
    state.selectedFile.value = null
    state.readyForNesting.value = false
    return false
  }

  function formatErrorTypesList(data) {
    const types = Array.isArray(data?.errorTypesList)
      ? data.errorTypesList.map((t) => String(t ?? '').trim()).filter(Boolean)
      : []
    return types.length ? types.join(', ') : 'unaccepted elements'
  }

  /** Soft integrity warnings belong to preview only — do not re-emit after nesting. */
  function emitSoftIntegrityWarnings(data) {
    if (data?.errorTypesBoolean && !data?.errorHard) {
      pushMessage(
        'assistant',
        'warning',
        `The file contains elements that will be disregarded: ${formatErrorTypesList(data)}. Consider cleaning the file according to the input template.`,
      )
    }
    if (data?.openCrvsFlag) {
      pushMessage(
        'assistant',
        'warning',
        'Open curves have been found and will be ignored when computing.',
      )
    }
    if (data?.largeCrvsFlag) {
      pushMessage(
        'assistant',
        'warning',
        'Extremely large boundaries have been found (>5 m² area) and will be ignored.',
      )
    }
    if (data?.nameVsElementQuantityFlag === false) {
      pushMessage(
        'assistant',
        'warning',
        'Texts and element counts do not match: name association will be incorrect. Please revise element information manually by clicking on elements in the viewer.',
      )
    }
  }

  function markProcessSuperseded(processId) {
    if (!processId) return
    for (const msg of state.messages.value) {
      if (msg.meta?.processId !== processId) continue
      msg.meta = { ...msg.meta, superseded: true }
    }
  }

  function ensureInitialNestProcessId({ renew = false } = {}) {
    if (renew && state.initialNestProcessId.value) {
      markProcessSuperseded(state.initialNestProcessId.value)
    }
    if (renew || !state.initialNestProcessId.value) {
      state.initialNestAttempt.value += 1
      state.initialNestProcessId.value = crypto.randomUUID()
    }
    return state.initialNestProcessId.value
  }

  function ensureLeftoverNestProcessId({ renew = false } = {}) {
    if (renew || !state.leftoverNestProcessId.value) {
      state.leftoverNestProcessId.value = crypto.randomUUID()
    }
    return state.leftoverNestProcessId.value
  }

  function ensureFullSetNestProcessId({ renew = false } = {}) {
    if (renew || !state.fullSetNestProcessId.value) {
      state.fullSetNestProcessId.value = crypto.randomUUID()
    }
    return state.fullSetNestProcessId.value
  }

  function nestProcessMeta(processKind, extra = {}) {
    const processId =
      processKind === 'leftover'
        ? ensureLeftoverNestProcessId()
        : processKind === 'fullset'
          ? ensureFullSetNestProcessId()
          : ensureInitialNestProcessId()
    return {
      processKind,
      processId,
      ...(processKind === 'initial'
        ? { processAttempt: state.initialNestAttempt.value }
        : {}),
      ...(processKind === 'leftover' ? { leftover: true } : {}),
      ...extra,
    }
  }

  function pushNestFitError(content, processKind = 'initial') {
    pushMessage(
      'assistant',
      'error',
      content,
      nestProcessMeta(processKind, { nestFitError: true }),
    )
  }

  function clearNestFitErrors({ processKind } = {}) {
    state.messages.value = state.messages.value.filter((m) => {
      if (m.kind !== 'error' || !m.meta?.nestFitError) return true
      if (processKind && m.meta?.processKind !== processKind) return true
      return false
    })
  }

  /** Drop unresolved leftover prompts/confirms so retries don't stack. */
  function clearStaleLeftoverPrompts() {
    state.messages.value = state.messages.value.filter((m) => {
      if (m.meta?.processKind === 'fullset') return true
      if (m.meta?.processKind !== 'leftover' && !m.meta?.leftover) return true
      return false
    })
    state.activeSheetSizeSelectId.value = null
    state.activeSheetSizeConfirmId.value = null
    state.activeMaterialSelectId.value = null
    state.activeMaterialConfirmId.value = null
    state.activeLeftoverMaterialReuseId.value = null
  }

  const { viewerClickForProperties, markModified: markModifiedBase, markModifiedPart } = useMetadataPanel(state)
  const {
    activeViewer,
    showNestingMeshView,
    showMeshPreview,
    showPreviewNotice,
  } = useViewerRouting(state)

  function syncGeometryMode(overrides = {}) {
    state.geometryMode.value = resolveGeometryMode({
      hopsGeometryMode: overrides.hopsGeometryMode ?? state.lastHopsGeometryMode.value,
    })
  }

  function applyGeometryModeFromResponse(data) {
    const mode = data?.geometryMode
    if (mode === 0 || mode === 1) {
      state.lastHopsGeometryMode.value = mode
      syncGeometryMode({ hopsGeometryMode: mode })
      return
    }
    syncGeometryMode()
  }

  const outputViewEnabled = computed(
    () => state.dxfInterpreted.value && (state.summonedPreview.value?.boundaries?.length ?? 0) > 0,
  )

  const meshPartDescriptors = computed(() =>
    buildMeshPartDescriptors(
      state.meshPreview.value?.length ?? 0,
      state.previewPartKeys.value,
      state.meshDescriptorBaseMeta.value ?? [],
    ),
  )

  const unassignedPartIdsForViewer = computed(() => {
    const preview = state.summonedPreview.value
    if (!preview) return []
    if (preview.unassignedPartKeys?.length) return preview.unassignedPartKeys
    if (!preview.unassignedIds?.length) return []
    return resolveUnassignedPartIds(preview.unassignedIds, meshPartDescriptors.value)
  })

  const nestingMeshPartDescriptors = computed(() => {
    const preview = state.summonedPreview.value
    const assignedMeshCount = preview?.assignedMeshes3d?.length ?? 0
    if (!assignedMeshCount) return []
    const partKeys = normalizeGhStringList(
      preview.initialPartKeys?.length ? preview.initialPartKeys : state.previewPartKeys.value,
    )
    return buildNestingMeshPartDescriptors({
      assignedMeshCount,
      initialPartKeys: partKeys,
      postInjectionNames: preview.postInjectionNames ?? [],
      postInjectionAmount: preview.postInjectionAmount ?? [],
      unassignedPartKeys: preview.unassignedPartKeys ?? [],
    })
  })

  const registryMeshDescriptors = computed(() =>
    showNestingMeshView.value
      ? nestingMeshPartDescriptors.value
      : meshPartDescriptors.value,
  )

  const partRegistry = computed(() =>
    buildPartRegistry({
      meshPartDescriptors: registryMeshDescriptors.value,
      boundaries:
        state.viewMode.value === 'output' && state.summonedPreview.value
          ? state.summonedPreview.value.boundaries
          : [],
    }),
  )

  watch(outputViewEnabled, (enabled) => {
    if (!enabled && state.viewMode.value === 'output') state.viewMode.value = 'input'
  })

  function hasSheetSizePrompt() {
    return state.messages.value.some((m) => m.kind === 'sheet-size-select' && !m.meta?.leftover)
  }

  function hasMaterialPrompt() {
    return state.messages.value.some((m) => m.kind === 'material-select' && !m.meta?.leftover)
  }

  const hasMissingMat = computed(() =>
    partRegistry.value.some(
      (entry) => !effectivePartMeta(entry, state.metadataOverrides.value).mat,
    ),
  )

  function partKeysMissingMat() {
    return partRegistry.value
      .filter((entry) => !effectivePartMeta(entry, state.metadataOverrides.value).mat)
      .map((entry) => entry.partKey)
  }

  function partKeysForMaterialApply(previousLabel) {
    return partRegistry.value
      .filter((entry) => {
        const mat = effectivePartMeta(entry, state.metadataOverrides.value).mat
        if (!mat) return true
        if (previousLabel && mat === previousLabel) return true
        return false
      })
      .map((entry) => entry.partKey)
  }

  function countMissingMat() {
    return partKeysMissingMat().length
  }

  function promptMaterial() {
    if (hasNestResult(state.summonedPreview.value)) return
    if (state.activeMaterialSelectId.value || hasMaterialPrompt()) return

    ensureInitialNestProcessId()
    const missingCount = countMissingMat()
    const content = missingCount > 0
      ? `${missingCount} ${missingCount === 1 ? 'part is' : 'parts are'} missing material. Choose a material for nesting:`
      : 'Choose a material for nesting:'
    const messageId = pushMessage(
      'assistant',
      'material-select',
      content,
      nestProcessMeta('initial', {
        missingCount,
      }),
    )
    state.activeMaterialSelectId.value = messageId
  }

  function promptSheetSize() {
    if (hasNestResult(state.summonedPreview.value)) return
    const material = state.pendingSheetMaterial.value
    if (!material) return
    if (state.activeSheetSizeSelectId.value || hasSheetSizePrompt()) return

    ensureInitialNestProcessId()
    const defaults = sheetDefaultsForMaterial(material)
    const messageId = pushMessage(
      'assistant',
      'sheet-size-select',
      'What sheet size should be used for nesting?',
      nestProcessMeta('initial', {
        ...defaults,
        materialId: material.id,
        materialLabel: material.label,
        allowedThicknessesMm: material.allowedThicknessesMm,
        allowedSizesMm: material.allowedSizesMm,
      }),
    )
    state.activeSheetSizeSelectId.value = messageId
  }

  watch(
    () => state.readyForNesting.value && !state.viewerBusy.value,
    (ready) => {
      if (ready) promptMaterial()
    },
  )

  function storeGhPostInjectionLists(data) {
    state.meshPreviewPostInjectionNames.value = normalizeGhStringList(data?.postInjectionNames)
    state.meshPreviewPostInjectionAmount.value = normalizeGhStringList(data?.postInjectionAmount)
  }

  /**
   * Drop sticky PostInjection lists that belong to a previous GH solve when
   * InputText for the current file has no overlapping names.
   */
  function withReconciledPostInjection(data) {
    if (!data || typeof data !== 'object') return data
    const expectedCount = Math.max(
      normalizeGhStringList(data.initialPartKeys).length,
      Array.isArray(data.meshes3d) ? data.meshes3d.length : 0,
    )
    const reconciled = reconcilePostInjectionWithInputText({
      postInjectionNames: data.postInjectionNames,
      postInjectionAmount: data.postInjectionAmount,
      inputText: data.inputText,
      expectedCount,
    })
    if (!reconciled.stale) return data
    return {
      ...data,
      postInjectionNames: reconciled.postInjectionNames,
      postInjectionAmount: reconciled.postInjectionAmount,
    }
  }

  function applyGhPostInjectionMetadata(data, { partKeys = null, replaceOverrides = true } = {}) {
    storeGhPostInjectionLists(data)
    const ghKeys = normalizeGhStringList(data?.initialPartKeys)
    const descriptorKeys = Array.isArray(partKeys) && partKeys.length
      ? partKeys.map((value) => String(value ?? '').trim())
      : ghKeys
    // Keep viewer keys aligned with expanded meshes when available.
    state.previewPartKeys.value = descriptorKeys
    const meshCount = state.meshPreview.value?.length ?? 0
    const { metadataOverrides, meshDescriptorBaseMeta } = seedPostNestMetadata({
      // Associate names/amounts by raw GH keys so expansion cannot shift indices.
      partKeys: ghKeys.length ? ghKeys : descriptorKeys,
      descriptorPartKeys: descriptorKeys,
      postInjectionNames: state.meshPreviewPostInjectionNames.value,
      postInjectionAmount: state.meshPreviewPostInjectionAmount.value,
      metadataOverrides: state.metadataOverrides.value,
      meshCount,
      replaceOverrides,
    })
    state.metadataOverrides.value = metadataOverrides
    state.meshDescriptorBaseMeta.value = meshDescriptorBaseMeta.length ? meshDescriptorBaseMeta : null
  }

  function updateCachedPostInjectionFromNest(data) {
    const names = normalizeGhStringList(data?.postInjectionNames)
    const amounts = normalizeGhStringList(data?.postInjectionAmount)
    if (names.length) state.inputPreviewPostInjectionNames.value = names
    if (amounts.length) state.inputPreviewPostInjectionAmount.value = amounts
    if (Array.isArray(data?.initialPartKeys) && data.initialPartKeys.length) {
      state.inputPreviewPartKeys.value = normalizeGhStringList(data.initialPartKeys)
    }
  }

  function previewProcessedLabel() {
    if (state.sourceType.value === '3dm') return '.3dm processed for visualization'
    if (state.geometryMode.value === '3d') return '3D DXF processed for visualization'
    return 'Processed for visualization'
  }

  async function applyMeshPreviewResult(data, { generation = null } = {}) {
    const stillCurrent = () =>
      generation == null || state.isCurrentPreviewGeneration(generation)

    data = withReconciledPostInjection(data)

    const rawMeshes3d = Array.isArray(data.meshes3d) ? data.meshes3d : null
    if (!rawMeshes3d?.length) return false

    const previewMeshes = await normalizePreviewMeshes3d(rawMeshes3d, data.initialPartKeys)
    if (!stillCurrent()) return false
    const meshes3d = previewMeshes?.meshes?.length ? previewMeshes.meshes : null
    if (!meshes3d?.length) return false

    if (data.jobId) {
      state.inputJobId.value = data.jobId
    }
    state.meshPreview.value = meshes3d
    state.annotationOverlayDxf.value = normalizeInputText(data.inputText, data.inputTextPt)
    applyGhPostInjectionMetadata(data, {
      partKeys: previewMeshes.partKeys,
      replaceOverrides: true,
    })
    cacheInputPreviewState()
    applyGeometryModeFromResponse(data)
    state.readyForNesting.value = true
    return true
  }

  async function applyHopsResult(data, { openModal = true, generation = null } = {}) {
    const stillCurrent = () =>
      generation == null || state.isCurrentPreviewGeneration(generation)

    data = withReconciledPostInjection(data)

    if (data.phase !== 'nest') {
      if (await applyMeshPreviewResult(data, { generation })) {
        if (!stillCurrent()) return
        pushMessage('assistant', 'text', previewProcessedLabel())
      }
      return
    }

    if (!stillCurrent()) return
    applyGeometryModeFromResponse(data)
    cacheInputPreviewState()
    updateCachedPostInjectionFromNest(data)

    const is2dNest = state.geometryMode.value === '2d'
    if (!is2dNest) {
      state.blockInserts.value = data.blockInserts ?? []
      state.schemeOutliers.value = data.schemeOutliers ?? []
      state.boundaries.value = data.boundaries ?? []
    }
    state.dxfInterpreted.value = true

    const unassignedReasons = normalizeUnassignedReasons(data.unassignedReasons)
    const nestAmounts = normalizeGhStringList(
      data.postInjectionAmount?.length
        ? data.postInjectionAmount
        : state.inputPreviewPostInjectionAmount.value ?? [],
    )
    const { nestedCount, unassignedCount, unassignedIds } = resolveNestingCounts(
      {
        ...data,
        postInjectionAmount: nestAmounts,
      },
      {
        normalizePartKeys: normalizeGhStringList,
        normalizeNames: normalizeGhStringList,
        normalizeAmounts: normalizeGhStringList,
        metadataOverrides: state.metadataOverrides.value,
      },
    )

    const nestPartKeys = state.inputPreviewPartKeys.value?.length
      ? state.inputPreviewPartKeys.value
      : normalizeGhStringList(data.initialPartKeys)
    const nestNames = state.inputPreviewPostInjectionNames.value?.length
      ? state.inputPreviewPostInjectionNames.value
      : normalizeGhStringList(data.postInjectionNames)
    const unassignedPartKeys = resolveUnassignedPartKeys(unassignedIds, nestPartKeys, {
      names: nestNames,
    })

    let assignedMeshes3d = null
    if (Array.isArray(data.assignedMeshes3d) && data.assignedMeshes3d.length) {
      const normalized = await normalizeMeshes3d(data.assignedMeshes3d)
      assignedMeshes3d = normalized.length ? normalized : null
    }

    let unassignedMeshes3d = null
    if (Array.isArray(data.unassignedMeshes3d) && data.unassignedMeshes3d.length) {
      const normalized = await normalizeMeshes3d(data.unassignedMeshes3d)
      unassignedMeshes3d = normalized.length ? normalized : null
    }

    const inputTextDxf = normalizeInputText(data.inputText, data.inputTextPt)

    let dxfText = typeof data.dxfText === 'string' ? data.dxfText : ''
    if (!dxfText && data.jobId) {
      dxfText = await fetchJobDxfText(data.jobId)
    }

    state.meshPreview.value = null
    if (!is2dNest) {
      state.previewPartKeys.value = []
      state.annotationOverlayDxf.value = null
    }
    state.sheetSizeModifiedSinceNest.value = false
    state.metadataModifiedSinceNest.value = false
    state.postNestMetadataEditing.value = false
    state.meshDescriptorBaseMeta.value = null
    state.viewMode.value = 'input'
    state.nestingViewerKey.value += 1

    state.leftoverNestPreview.value = null
    state.pendingLeftoverSheetSize.value = null
    state.pendingLeftoverSheetMaterial.value = null
    state.summonedPreview.value = {
      dxfText,
      boundaries: data.boundaries ?? [],
      blockInserts: data.blockInserts ?? [],
      schemeOutliers: data.schemeOutliers ?? [],
      jobId: data.jobId ?? null,
      sheetCount: data.routing?.branchCount ?? 1,
      initialPartKeys: normalizeGhStringList(data.initialPartKeys),
      postInjectionNames: normalizeGhStringList(data.postInjectionNames),
      postInjectionAmount: normalizeGhStringList(data.postInjectionAmount),
      partCount: nestedCount,
      nestedCount,
      unassignedCount,
      unassignedIds,
      unassignedPartKeys,
      unassignedReasons,
      assignedMeshes3d,
      unassignedMeshes3d,
      inputTextDxf,
      hasUnassignedDxf: Boolean(data.hasUnassignedDxf),
      nestingMetrics: data.nestingMetrics ?? null,
      sheetX: state.pendingSheetSize.value?.sheetX ?? null,
      sheetY: state.pendingSheetSize.value?.sheetY ?? null,
      sheetThickness: state.pendingSheetSize.value?.sheetThickness ?? null,
    }
    if (openModal) {
      clearNestFitErrors({ processKind: 'initial' })
      trimNestingResultMessages()
      pushMessage(
        'assistant',
        'nesting-result',
        buildNestingResultMessage(nestedCount, unassignedCount),
        nestProcessMeta('initial', {
          jobId: data.jobId ?? null,
          nestedCount,
          unassignedCount,
          ...(unassignedCount > 0
            ? {
                unassignedIds,
                unassignedReasons,
                unassignedIdsText: formatUnassignedIdsDisplay(unassignedIds),
              }
            : {}),
        }),
      )
      state.showNestingModal.value = true
    }
  }

  function cacheInputPreviewState() {
    if (state.annotationOverlayDxf.value) {
      state.inputPreviewAnnotationDxf.value = state.annotationOverlayDxf.value
    }
    if (state.previewPartKeys.value?.length) {
      state.inputPreviewPartKeys.value = [...state.previewPartKeys.value]
    }
    if (state.meshPreview.value?.length) {
      state.inputPreviewMeshes.value = state.meshPreview.value
      state.inputPreviewPostInjectionNames.value = [...state.meshPreviewPostInjectionNames.value]
      state.inputPreviewPostInjectionAmount.value = [...state.meshPreviewPostInjectionAmount.value]
    }
  }

  function restoreInputAnnotationOverlay(fallbackDxf = null) {
    if (state.inputPreviewAnnotationDxf.value) {
      state.annotationOverlayDxf.value = state.inputPreviewAnnotationDxf.value
      return true
    }
    if (fallbackDxf) {
      state.annotationOverlayDxf.value = fallbackDxf
      return true
    }
    return false
  }

  function restoreInputMeshPreview() {
    if (!state.inputPreviewMeshes.value?.length) return false
    state.meshPreview.value = state.inputPreviewMeshes.value
    if (state.inputPreviewPartKeys.value?.length) {
      state.previewPartKeys.value = [...state.inputPreviewPartKeys.value]
    }
    state.meshPreviewPostInjectionNames.value = state.inputPreviewPostInjectionNames.value ?? []
    state.meshPreviewPostInjectionAmount.value = state.inputPreviewPostInjectionAmount.value ?? []
    state.meshDescriptorBaseMeta.value = buildDescriptorBaseMetaFromGhLists({
      partKeys: state.previewPartKeys.value,
      postInjectionNames: state.meshPreviewPostInjectionNames.value,
      postInjectionAmount: state.meshPreviewPostInjectionAmount.value,
      meshCount: state.meshPreview.value?.length ?? 0,
    })
    return true
  }

  function restoreInputPreviewForMetadataEditing({ annotationFallback = null } = {}) {
    let restored = restoreInputMeshPreview()

    if (state.inputPreviewPartKeys.value?.length) {
      state.previewPartKeys.value = [...state.inputPreviewPartKeys.value]
      restored = true
    }

    if (restoreInputAnnotationOverlay(annotationFallback)) {
      restored = true
    }

    if (restored) {
      state.dxfInterpreted.value = Boolean(state.meshPreview.value?.length)
    }

    return restored
  }

  function applyPostNestMetadataSeed() {
    const partKeys =
      state.inputPreviewPartKeys.value?.length
        ? state.inputPreviewPartKeys.value
        : state.previewPartKeys.value
    const postInjectionNames =
      state.summonedPreview.value?.postInjectionNames?.length
        ? state.summonedPreview.value.postInjectionNames
        : state.inputPreviewPostInjectionNames.value
          ?? state.meshPreviewPostInjectionNames.value
    const postInjectionAmount =
      state.summonedPreview.value?.postInjectionAmount?.length
        ? state.summonedPreview.value.postInjectionAmount
        : state.inputPreviewPostInjectionAmount.value
          ?? state.meshPreviewPostInjectionAmount.value

    const { metadataOverrides, meshDescriptorBaseMeta } = seedPostNestMetadata({
      partKeys,
      postInjectionNames,
      postInjectionAmount,
      metadataOverrides: state.metadataOverrides.value,
      meshCount: state.meshPreview.value?.length ?? 0,
    })
    state.metadataOverrides.value = metadataOverrides
    state.meshDescriptorBaseMeta.value = meshDescriptorBaseMeta.length
      ? meshDescriptorBaseMeta
      : null
  }

  function trimNestingResultMessages() {
    state.messages.value = state.messages.value.filter((m) => m.kind !== 'nesting-result')
  }

  function invalidateNestResult({ reason }) {
    const hadNested = hasNestResult(state.summonedPreview.value)
    if (!hadNested) return

    if (reason === 'metadata') {
      state.metadataModifiedSinceNest.value = true
    } else if (reason === 'sheet-size') {
      state.sheetSizeModifiedSinceNest.value = true
    }

    resetNestingViewerState()
    trimNestingResultMessages()
    // Keep the same Initial nesting panel open and unscratched; unused sheet-size
    // confirms are struck individually via markPriorSheetSizeConfirmsSuperseded.
  }

  function markModified(handle) {
    markModifiedBase(handle)
    if (hasNestResult(state.summonedPreview.value)) {
      invalidateNestResult({ reason: 'metadata' })
    }
    clearNestRevealInterrupted('initial')
    kickstartInitialNest()
  }

  function clearPendingLeftoverNest() {
    state.pendingLeftoverSheetSize.value = null
    state.pendingLeftoverSheetMaterial.value = null
    state.leftoverNestPreview.value = null
    state.activeMaterialSelectId.value = null
    state.activeMaterialConfirmId.value = null
  }

  function resetNestingViewerState() {
    state.summonedPreview.value = null
    clearPendingLeftoverNest()
    state.showNestingModal.value = false
    state.postNestMetadataEditing.value = false
    state.blockInserts.value = []
    state.schemeOutliers.value = []
    state.boundaries.value = []
    state.dxfInterpreted.value = false
    state.viewMode.value = 'input'
    restoreInputPreviewForMetadataEditing()
    state.nestingViewerKey.value += 1
  }

  function promptLeftoverMaterialReuse() {
    if (!state.summonedPreview.value?.hasUnassignedDxf) return
    if (state.leftoverNestPreview.value) return
    if (state.activeLeftoverMaterialReuseId.value) return

    const previous = state.pendingSheetMaterial.value
    if (!previous) {
      promptLeftoverMaterialSelect()
      return
    }

    ensureLeftoverNestProcessId()
    const messageId = pushMessage(
      'assistant',
      'confirm',
      `Use the same material as before (${previous.label}), or choose a different one?`,
      nestProcessMeta('leftover', {
        leftoverMaterialReuse: true,
        choices: ['Same material', 'Different material'],
        previousMaterialId: previous.id,
        previousMaterialLabel: previous.label,
      }),
    )
    state.activeLeftoverMaterialReuseId.value = messageId
  }

  function onLeftoverMaterialReuseChoice(choice) {
    const msgId = state.activeLeftoverMaterialReuseId.value
    const msg = state.messages.value.find((m) => m.id === msgId)
    if (!msg?.meta?.leftoverMaterialReuse) return

    const normalized = String(choice ?? '').trim().toLowerCase()
    const useSame = normalized === 'same material' || normalized === 'same'
    const useDifferent = normalized === 'different material' || normalized === 'different'
    if (!useSame && !useDifferent) return

    msg.meta = { ...msg.meta, resolved: true, choice }
    state.activeLeftoverMaterialReuseId.value = null

    if (useSame) {
      const previous = state.pendingSheetMaterial.value
      if (!previous) {
        promptLeftoverMaterialSelect()
        return
      }
      state.pendingLeftoverSheetMaterial.value = { ...previous }
      const selectId = pushMessage(
        'assistant',
        'material-select',
        'Choose a material for the unassigned parts:',
        nestProcessMeta('leftover', {
          materialId: previous.id,
          materialLabel: previous.label,
          allowedThicknessesMm: previous.allowedThicknessesMm,
          allowedSizesMm: previous.allowedSizesMm,
          resolved: true,
        }),
      )
      const confirmId = pushMessage(
        'assistant',
        'text',
        `Material for unassigned parts: ${previous.label} (same as before)`,
        nestProcessMeta('leftover', {
          materialConfirm: true,
          promptMessageId: selectId,
        }),
      )
      state.activeMaterialConfirmId.value = confirmId
      state.activeMaterialSelectId.value = null
      promptLeftoverSheetSize()
      return
    }

    promptLeftoverMaterialSelect()
  }

  function promptLeftoverMaterialSelect() {
    if (!state.summonedPreview.value?.hasUnassignedDxf) return
    if (state.leftoverNestPreview.value) return
    if (state.activeMaterialSelectId.value) return

    ensureLeftoverNestProcessId()
    const existing = state.messages.value.find(
      (m) => m.kind === 'material-select' && m.meta?.leftover && !m.meta?.resolved,
    )
    if (existing) {
      existing.meta = {
        ...existing.meta,
        ...nestProcessMeta('leftover'),
        resolved: false,
      }
      state.activeMaterialConfirmId.value = null
      state.activeMaterialSelectId.value = existing.id
      return
    }

    const messageId = pushMessage(
      'assistant',
      'material-select',
      'Choose a material for the unassigned parts:',
      nestProcessMeta('leftover'),
    )
    state.activeMaterialSelectId.value = messageId
  }

  function promptLeftoverSheetSize() {
    if (!state.summonedPreview.value?.hasUnassignedDxf) return
    if (state.leftoverNestPreview.value) return
    if (state.activeSheetSizeSelectId.value) return

    const material = state.pendingLeftoverSheetMaterial.value
    if (!material) return

    ensureLeftoverNestProcessId()
    const defaults = sheetDefaultsForMaterial(material)
    const messageId = pushMessage(
      'assistant',
      'sheet-size-select',
      'Choose a sheet size for the unassigned parts:',
      nestProcessMeta('leftover', {
        ...defaults,
        materialId: material.id,
        materialLabel: material.label,
        allowedThicknessesMm: material.allowedThicknessesMm,
        allowedSizesMm: material.allowedSizesMm,
      }),
    )
    state.activeSheetSizeSelectId.value = messageId
  }

  function resolveLeftoverPartKeys() {
    return resolveLeftoverPartKeysFromPreview(state.summonedPreview.value ?? {}, {
      fallbackPartKeys: state.inputPreviewPartKeys.value ?? [],
    })
  }

  function buildLeftoverNestMetadataOverrides() {
    const preview = state.summonedPreview.value
    if (!preview) return {}
    const leftoverPartKeys = resolveLeftoverPartKeys()
    return buildLeftoverMetadataBundle({
      initialPartKeys: preview.initialPartKeys ?? [],
      postInjectionNames: preview.postInjectionNames ?? [],
      postInjectionAmount: preview.postInjectionAmount ?? [],
      unassignedPartKeys: leftoverPartKeys,
      unassignedIds: preview.unassignedIds ?? [],
      metadataOverrides: state.metadataOverrides.value,
    }).overrides
  }

  /**
   * Transport-only leftover nest. Does not touch busy/thinking/UI application.
   * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
   */
  async function fetchLeftoverNestPayload({
    sheetX,
    sheetY,
    sheetThickness,
    signal,
  } = {}) {
    const primaryJobId = state.summonedPreview.value?.jobId
    if (!primaryJobId) {
      return { ok: false, error: 'No primary nesting job available for leftover nesting.' }
    }

    const leftoverPartKeys = resolveLeftoverPartKeys()
    if (!leftoverPartKeys.length) {
      return {
        ok: false,
        error: 'No unassigned part keys available for leftover nesting.',
      }
    }

    const formData = new FormData()
    formData.append('sheetWidth', String(sheetX))
    formData.append('sheetHeight', String(sheetY))
    formData.append('sheetThickness', String(sheetThickness))
    formData.append('leftoverPartKeys', JSON.stringify(leftoverPartKeys))
    formData.append('leftoverMode', 'true')
    formData.append(
      'isCarat',
      state.pendingSheetMaterial.value?.id === 'carat' ? 'true' : 'false',
    )
    const overrides = buildLeftoverNestMetadataOverrides()
    formData.append('metadataOverrides', JSON.stringify(overrides))
    if (import.meta.env.DEV) {
      console.info(
        `Leftover nest: ${leftoverPartKeys.length} LeftoverPartKeys, ${Object.keys(overrides).length} override key(s)`,
        { leftoverPartKeys, overrides },
      )
    }

    try {
      // WAITING BFF: POST /api/jobs/:id/nest-unassigned — Simple Parts Flask stand-in
      const response = await fetch(`/api/jobs/${primaryJobId}/nest-unassigned`, {
        method: 'POST',
        body: formData,
        signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          ok: false,
          error:
            data.error
            || 'Parts still could not be fit into sheet. Try a different sheet size.',
        }
      }
      return {
        ok: true,
        data: {
          ...data,
          sheetX,
          sheetY,
          sheetThickness,
        },
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      return {
        ok: false,
        error: 'Parts still could not be fit into sheet. Try a different sheet size.',
      }
    }
  }

  function applyLeftoverNestFailure(errorMessage) {
    state.leftoverNestPreview.value = null
    state.pendingLeftoverSheetMaterial.value = null
    state.activeMaterialSelectId.value = null
    state.activeMaterialConfirmId.value = null
    state.activeLeftoverMaterialReuseId.value = null
    clearStaleLeftoverPrompts()
    ensureLeftoverNestProcessId({ renew: true })
    pushNestFitError(
      errorMessage || 'Parts still could not be fit into sheet. Try a different sheet size.',
      'leftover',
    )
    promptLeftoverMaterialReuse()
  }

  async function applyLeftoverNestSuccess(data) {
    const sheetX = data.sheetX
    const sheetY = data.sheetY
    const sheetThickness = data.sheetThickness
    let dxfText = typeof data.dxfText === 'string' ? data.dxfText : ''
    if (!dxfText && data.jobId) {
      dxfText = await fetchJobDxfText(data.jobId)
    }
    state.leftoverNestPreview.value = {
      jobId: data.jobId ?? null,
      dxfText,
      boundaries: data.boundaries ?? [],
      blockInserts: data.blockInserts ?? [],
      sheetCount: data.routing?.branchCount ?? 1,
      sheetX,
      sheetY,
      sheetThickness,
      materialLabel: state.pendingLeftoverSheetMaterial.value?.label ?? null,
      nestingMetrics: data.nestingMetrics ?? null,
    }
    const preview = state.summonedPreview.value
    const nestedCount = preview?.nestedCount ?? preview?.partCount ?? 0
    const previouslyUnassignedCount = preview?.unassignedCount ?? 0
    clearNestFitErrors({ processKind: 'leftover' })
    trimNestingResultMessages()
    ensureFullSetNestProcessId({ renew: true })
    pushMessage(
      'assistant',
      'nesting-result',
      buildLeftoverCompleteMessage(nestedCount, previouslyUnassignedCount),
      nestProcessMeta('fullset', {
        leftoverComplete: true,
        nestedCount,
        previouslyUnassignedCount,
        jobId: data.jobId ?? null,
      }),
    )
    state.showNestingModal.value = true
  }

  function currentLeftoverNestFingerprint() {
    const size = state.pendingLeftoverSheetSize.value
    const material = state.pendingLeftoverSheetMaterial.value
    const jobId = state.summonedPreview.value?.jobId
    if (!size || !material || !jobId) return null
    return buildLeftoverNestFingerprint({
      jobId,
      sheetX: size.sheetX,
      sheetY: size.sheetY,
      sheetThickness: size.sheetThickness,
      materialId: material.id,
      leftoverPartKeys: resolveLeftoverPartKeys(),
      overrides: buildLeftoverNestMetadataOverrides(),
    })
  }

  function canKickstartLeftoverNest() {
    if (!state.summonedPreview.value?.jobId) return false
    if (!state.summonedPreview.value?.hasUnassignedDxf) return false
    if (state.leftoverNestPreview.value) return false
    if (state.activeSheetSizeSelectId.value) return false
    if (state.activeMaterialSelectId.value) return false
    if (state.activeLeftoverMaterialReuseId.value) return false
    const material = state.pendingLeftoverSheetMaterial.value
    const size = state.pendingLeftoverSheetSize.value
    if (!material || !size || !sheetFitsMaterial(material, size)) return false
    return resolveLeftoverPartKeys().length > 0
  }

  function kickstartLeftoverNest() {
    if (!canKickstartLeftoverNest()) return
    const size = state.pendingLeftoverSheetSize.value
    const fingerprint = currentLeftoverNestFingerprint()
    if (!size || !fingerprint) return

    speculativeLeftoverNest.start(fingerprint, async ({ signal, generation }) => {
      try {
        const payload = await fetchLeftoverNestPayload({
          sheetX: size.sheetX,
          sheetY: size.sheetY,
          sheetThickness: size.sheetThickness,
          signal,
        })
        if (!speculativeLeftoverNest.isCurrent(generation)) {
          return { ok: false, error: 'cancelled' }
        }
        return payload
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        return {
          ok: false,
          error: 'Parts still could not be fit into sheet. Try a different sheet size.',
        }
      }
    })
  }

  async function awaitOrRevealLeftoverNest() {
    const size = state.pendingLeftoverSheetSize.value
    const material = state.pendingLeftoverSheetMaterial.value
    if (!size || !material || state.leftoverNestPreview.value) return
    if (!sheetFitsMaterial(material, size)) return

    clearNestFitErrors({ processKind: 'leftover' })

    const fingerprint = currentLeftoverNestFingerprint()
    if (!fingerprint) return

    const snap = speculativeLeftoverNest.getSnapshot()
    if (
      !speculativeLeftoverNest.matchesFingerprint(fingerprint)
      || (!snap.promise && !snap.outcome)
    ) {
      kickstartLeftoverNest()
    }

    const pool = buildPool('leftovers')
    const thinking = createThinkingRotator()
    let thinkingFailed = false
    let interrupted = false
    let resolvePause = /** @type {(v?: unknown) => void} */ (() => {})
    const pausePromise = new Promise((resolve) => {
      resolvePause = resolve
    })

    const thinkingId = thinkingChat.begin(nestProcessMeta('leftover'))
    state.busy.value = true
    state.nestRevealPaused.value = null
    state.nestRevealLive.value = 'leftover'
    const thinkStartedAt = Date.now()

    const session = {
      kind: /** @type {const} */ ('leftover'),
      /**
       * @param {{ keepContinue?: boolean }} [opts]
       */
      interrupt({ keepContinue = true } = {}) {
        if (interrupted) return
        interrupted = true
        thinking.stop()
        thinkingChat.collapse(thinkingId, { interrupted: true })
        state.busy.value = false
        state.busyMessage.value = ''
        state.nestRevealLive.value = null
        state.nestRevealPaused.value = keepContinue ? 'leftover' : null
        resolvePause('interrupted')
      },
    }
    activeRevealSession = session

    thinking.start({
      pool,
      onMessage: (msg) => {
        state.busyMessage.value = msg
        thinkingChat.append(thinkingId, msg)
      },
    })

    try {
      let current = speculativeLeftoverNest.getSnapshot()
      const hadCachedOutcome = Boolean(current.outcome && !current.promise)
      let outcome = current.outcome
      if (current.promise) {
        const raced = await Promise.race([
          current.promise.then((o) => ({ type: 'outcome', o })),
          pausePromise.then(() => ({ type: 'interrupted' })),
        ])
        if (raced.type === 'interrupted' || interrupted) return
        outcome = raced.o
      } else if (hadCachedOutcome) {
        const remaining = MIN_REVEAL_THINK_MS - (Date.now() - thinkStartedAt)
        if (remaining > 0) {
          const raced = await Promise.race([
            sleep(remaining).then(() => ({ type: 'ready' })),
            pausePromise.then(() => ({ type: 'interrupted' })),
          ])
          if (raced.type === 'interrupted' || interrupted) return
        }
      }

      if (interrupted) return

      if (
        !outcome
        || !speculativeLeftoverNest.matchesFingerprint(fingerprint)
      ) {
        thinkingFailed = true
        await thinking.fail()
        return
      }
      if (!outcome.ok) {
        thinkingFailed = true
        await thinking.fail()
        speculativeLeftoverNest.cancel()
        applyLeftoverNestFailure(outcome.error)
        return
      }
      await applyLeftoverNestSuccess(outcome.data)
      speculativeLeftoverNest.cancel()
    } catch (err) {
      if (interrupted) return
      thinkingFailed = true
      await thinking.fail()
      speculativeLeftoverNest.cancel()
      applyLeftoverNestFailure(
        'Parts still could not be fit into sheet. Try a different sheet size.',
      )
    } finally {
      if (activeRevealSession === session) activeRevealSession = null
      if (interrupted) return
      if (!thinkingFailed) thinking.stop()
      thinkingChat.collapse(thinkingId, { failed: thinkingFailed })
      state.busy.value = false
      state.busyMessage.value = ''
      state.nestRevealLive.value = null
      state.nestRevealPaused.value = null
    }
  }

  function resolveNestPartKeys() {
    if (state.previewPartKeys.value?.length) return state.previewPartKeys.value
    if (state.inputPreviewPartKeys.value?.length) return state.inputPreviewPartKeys.value
    if (state.summonedPreview.value?.initialPartKeys?.length) {
      return state.summonedPreview.value.initialPartKeys
    }
    return []
  }

  function resolveNestMetadataDescriptors(partKeys) {
    const meshCount = Math.max(
      state.meshPreview.value?.length ?? 0,
      partKeys.length,
    )
    if (!meshCount) return meshPartDescriptors.value
    if (meshPartDescriptors.value.length >= meshCount) return meshPartDescriptors.value
    return buildMeshPartDescriptors(
      meshCount,
      partKeys,
      state.meshDescriptorBaseMeta.value ?? [],
    )
  }

  function buildNestMetadataPayload() {
    const partKeys = resolveNestPartKeys()
    return buildPartKeyMetadataOverrides({
      metadataOverrides: state.metadataOverrides.value,
      meshPartDescriptors: resolveNestMetadataDescriptors(partKeys),
      partKeys,
    })
  }

  function currentNestFingerprint() {
    const size = state.pendingSheetSize.value
    const material = state.pendingSheetMaterial.value
    if (!size || !material) return null
    return buildNestFingerprint({
      inputJobId: state.inputJobId.value,
      sheetX: size.sheetX,
      sheetY: size.sheetY,
      sheetThickness: size.sheetThickness,
      materialId: material.id,
      overrides: buildNestMetadataPayload(),
    })
  }

  function canKickstartInitialNest() {
    if (!state.selectedFile.value || !state.readyForNesting.value) return false
    if (hasNestResult(state.summonedPreview.value)) return false
    if (state.activeSheetSizeSelectId.value) return false
    if (state.activeMaterialSelectId.value) return false
    if (state.activeLeftoverMaterialReuseId.value) return false
    if (hasMissingMat.value) return false
    const material = state.pendingSheetMaterial.value
    const size = state.pendingSheetSize.value
    return Boolean(material)
      && Boolean(size)
      && sheetFitsMaterial(material, size)
  }

  function formatHopsNetworkError(err) {
    const message = String(err?.message ?? err)
    const isNetwork =
      err instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(message)
    return isNetwork
      ? 'Could not reach the backend for Hops solve. Is Rhino Compute running?'
      : `Hops result processing failed: ${message}`
  }

  /**
   * Transport-only Hops solve. Does not touch busy/thinking/UI application.
   * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
   */
  async function fetchHopsSolvePayload({
    runNesting = true,
    sheetWidth,
    sheetHeight,
    sheetThickness,
    signal,
  } = {}) {
    const formData = new FormData()
    formData.append('run', runNesting ? 'true' : 'false')
    if (runNesting && state.inputJobId.value) {
      formData.append('inputJobId', state.inputJobId.value)
    } else if (state.selectedFile.value) {
      formData.append('file', state.selectedFile.value)
    } else {
      return { ok: false, error: 'No file selected.' }
    }
    if (runNesting) {
      formData.append('sheetWidth', String(Math.round(sheetWidth)))
      formData.append('sheetHeight', String(Math.round(sheetHeight)))
      formData.append('sheetThickness', String(Math.round(sheetThickness)))
      formData.append(
        'isCarat',
        state.pendingSheetMaterial.value?.id === 'carat' ? 'true' : 'false',
      )
      const overrides = buildNestMetadataPayload()
      formData.append('metadataOverrides', JSON.stringify(overrides))
      if (import.meta.env.DEV && Object.keys(overrides).length) {
        console.info(
          `Nest metadataOverrides: ${Object.keys(overrides).length} part(s)`,
          overrides,
        )
      }
    }
    // WAITING BFF: POST /api/hops/solve — Simple Parts Flask stand-in; the UI should call the Platform BFF
    const res = await fetch('/api/hops/solve', {
      method: 'POST',
      body: formData,
      signal,
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return { ok: false, error: errBody.error || 'Processing failed.' }
    }
    const data = await res.json()
    return { ok: true, data }
  }

  function kickstartInitialNest() {
    if (!canKickstartInitialNest()) return
    const size = state.pendingSheetSize.value
    const fingerprint = currentNestFingerprint()
    if (!size || !fingerprint) return

    speculativeNest.start(fingerprint, async ({ signal, generation }) => {
      while (state.getSummonPreviewTask()) {
        await state.getSummonPreviewTask()
        if (!speculativeNest.isCurrent(generation)) {
          return { ok: false, error: 'cancelled' }
        }
      }
      try {
        const payload = await fetchHopsSolvePayload({
          runNesting: true,
          sheetWidth: size.sheetX,
          sheetHeight: size.sheetY,
          sheetThickness: size.sheetThickness,
          signal,
        })
        if (!speculativeNest.isCurrent(generation)) {
          return { ok: false, error: 'cancelled' }
        }
        return payload
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        console.error('Hops solve error:', err)
        return { ok: false, error: formatHopsNetworkError(err) }
      }
    })
  }

  async function awaitOrRevealNest() {
    const size = state.pendingSheetSize.value
    const material = state.pendingSheetMaterial.value
    if (!size || !material || hasNestResult(state.summonedPreview.value)) return
    if (!sheetFitsMaterial(material, size)) return

    clearNestFitErrors({ processKind: 'initial' })

    const fingerprint = currentNestFingerprint()
    if (!fingerprint) return

    const snap = speculativeNest.getSnapshot()
    if (
      !speculativeNest.matchesFingerprint(fingerprint)
      || (!snap.promise && !snap.outcome)
    ) {
      kickstartInitialNest()
    }

    const pool = buildPool('nest', {
      format: state.sourceType.value || 'dxf',
    })
    const thinking = createThinkingRotator()
    let thinkingFailed = false
    let interrupted = false
    let resolvePause = /** @type {(v?: unknown) => void} */ (() => {})
    const pausePromise = new Promise((resolve) => {
      resolvePause = resolve
    })

    const thinkingId = thinkingChat.begin(nestProcessMeta('initial'))
    state.busy.value = true
    state.nestRevealPaused.value = null
    state.nestRevealLive.value = 'initial'
    const thinkStartedAt = Date.now()

    const session = {
      kind: /** @type {const} */ ('initial'),
      /**
       * @param {{ keepContinue?: boolean }} [opts]
       */
      interrupt({ keepContinue = true } = {}) {
        if (interrupted) return
        interrupted = true
        thinking.stop()
        thinkingChat.collapse(thinkingId, { interrupted: true })
        state.busy.value = false
        state.busyMessage.value = ''
        state.nestRevealLive.value = null
        state.nestRevealPaused.value = keepContinue ? 'initial' : null
        resolvePause('interrupted')
      },
    }
    activeRevealSession = session

    thinking.start({
      pool,
      onMessage: (msg) => {
        state.busyMessage.value = msg
        thinkingChat.append(thinkingId, msg)
      },
    })

    try {
      let current = speculativeNest.getSnapshot()
      const hadCachedOutcome = Boolean(current.outcome && !current.promise)
      let outcome = current.outcome
      if (current.promise) {
        const raced = await Promise.race([
          current.promise.then((o) => ({ type: 'outcome', o })),
          pausePromise.then(() => ({ type: 'interrupted' })),
        ])
        if (raced.type === 'interrupted' || interrupted) return
        outcome = raced.o
      } else if (hadCachedOutcome) {
        const remaining = MIN_REVEAL_THINK_MS - (Date.now() - thinkStartedAt)
        if (remaining > 0) {
          const raced = await Promise.race([
            sleep(remaining).then(() => ({ type: 'ready' })),
            pausePromise.then(() => ({ type: 'interrupted' })),
          ])
          if (raced.type === 'interrupted' || interrupted) return
        }
      }

      if (interrupted) return

      if (
        !outcome
        || !speculativeNest.matchesFingerprint(fingerprint)
      ) {
        thinkingFailed = true
        await thinking.fail()
        return
      }
      if (!outcome.ok) {
        thinkingFailed = true
        await thinking.fail()
        pushNestFitError(outcome.error || 'Processing failed.', 'initial')
        speculativeNest.cancel()
        return
      }
      if (!checkHardTypeError(outcome.data)) {
        thinkingFailed = true
        await thinking.fail()
        speculativeNest.cancel()
        return
      }
      await applyHopsResult(outcome.data, { openModal: true })
      speculativeNest.cancel()
    } catch (err) {
      if (interrupted) return
      thinkingFailed = true
      await thinking.fail()
      console.error('Hops solve error:', err)
      pushNestFitError(formatHopsNetworkError(err), 'initial')
      speculativeNest.cancel()
    } finally {
      if (activeRevealSession === session) activeRevealSession = null
      if (interrupted) return
      if (!thinkingFailed) thinking.stop()
      thinkingChat.collapse(thinkingId, { failed: thinkingFailed })
      state.busy.value = false
      state.busyMessage.value = ''
      state.nestRevealLive.value = null
      state.nestRevealPaused.value = null
    }
  }

  async function solveUpload({
    openModal = true,
    runNesting = true,
    sheetWidth,
    sheetHeight,
    sheetThickness,
    useViewerBusy = false,
  } = {}) {
    if (!state.selectedFile.value) return false

    const { generation, signal } = state.beginSummonPreview()

    const task = (async () => {
      const phase = runNesting ? 'nest' : 'preview'
      const pool = buildPool(phase, {
        format: state.sourceType.value || 'dxf',
      })
      const thinking = createThinkingRotator()
      let thinkingFailed = false
      const thinkingMeta = runNesting ? nestProcessMeta('initial') : {}
      const thinkingId = thinkingChat.begin(thinkingMeta)

      const onThinkingLine = (msg) => {
        if (!state.isCurrentPreviewGeneration(generation)) return
        state.busyMessage.value = msg
        thinkingChat.append(thinkingId, msg)
      }

      state.busy.value = true
      if (useViewerBusy) {
        state.viewerBusy.value = true
        state.viewerBusyMessage.value = ''
      }
      thinking.start({ pool, onMessage: onThinkingLine })

      const isStale = () => !state.isCurrentPreviewGeneration(generation)

      try {
        const payload = await fetchHopsSolvePayload({
          runNesting,
          sheetWidth,
          sheetHeight,
          sheetThickness,
          signal,
        })
        if (isStale()) return false
        if (!payload.ok) {
          thinkingFailed = true
          await thinking.fail()
          if (isStale()) return false
          if (runNesting) {
            pushNestFitError(payload.error, 'initial')
          } else {
            pushFileError(payload.error)
          }
          return false
        }
        if (payload.data?.errorHard) {
          thinkingFailed = true
          await thinking.fail()
          if (isStale()) return false
          checkHardTypeError(payload.data)
          return false
        }
        await applyHopsResult(payload.data, { openModal, generation })
        if (isStale()) return false
        if (!runNesting) emitSoftIntegrityWarnings(payload.data)
        return true
      } catch (err) {
        if (err?.name === 'AbortError' || isStale()) return false
        thinkingFailed = true
        await thinking.fail()
        if (isStale()) return false
        console.error('Hops solve error:', err)
        const errMsg = formatHopsNetworkError(err)
        if (runNesting) {
          pushNestFitError(errMsg, 'initial')
        } else {
          pushFileError(errMsg)
        }
        return false
      } finally {
        thinking.stop()
        if (!isStale()) {
          thinkingChat.collapse(thinkingId, { failed: thinkingFailed })
          state.busy.value = false
          state.busyMessage.value = ''
          if (useViewerBusy) {
            state.viewerBusy.value = false
            state.viewerBusyMessage.value = ''
          }
        } else {
          // Stale run: drop its thinking bubble if it still exists; do not touch busy UI owned by the newer file.
          thinkingChat.collapse(thinkingId, { failed: false, interrupted: true })
        }
      }
    })().finally(() => {
      if (state.getSummonPreviewTask() === task) {
        state.setSummonPreviewTask(null)
      }
    })

    state.setSummonPreviewTask(task)
    return await task
  }

  function showPartByNr(partNr) {
    const registry = partRegistry.value
    const resolved = resolvePartByNr(registry, partNr, state.metadataOverrides.value)

    const meshSelectionActive =
      showMeshPreview.value
      || showNestingMeshView.value
      || (state.postNestMetadataEditing.value && Boolean(state.meshPreview.value?.length))

    if (resolved && meshSelectionActive && resolved.entry.selectionMeshId) {
      state.meshViewerRef.value?.selectPartByHandle(resolved.entry.selectionMeshId)
      return
    }

    if (resolved?.entry.selectionMeshId) {
      state.meshViewerRef.value?.selectPartByHandle(resolved.entry.selectionMeshId)
      return
    }

    const nrs = listKnownPartNrs(registry, state.metadataOverrides.value)
    const hint =
      meshSelectionActive && !registry.length
        ? state.postNestMetadataEditing.value
          ? `Couldn't find part ${partNr} in the mesh preview.`
          : `Couldn't find part ${partNr} in the mesh preview (metadata linking is not available until nesting).`
        : `Couldn't find part ${partNr}. Available: ${nrs.join(', ') || 'none'}.`
    pushMessage('assistant', 'text', hint)
  }

  const chat = useChat(state, {
    pushMessage,
    FIELD_LABELS,
    showPartByNr,
    onMetadataModified: () => {
      if (hasNestResult(state.summonedPreview.value)) {
        invalidateNestResult({ reason: 'metadata' })
      }
      kickstartInitialNest()
    },
    markModifiedPart,
    getPartRegistry: () => partRegistry.value,
  })

  async function onAttachFile(file) {
    const lower = file.name.toLowerCase()
    const is3dm = lower.endsWith('.3dm')
    const isDwg = lower.endsWith('.dwg')
    clearNestRevealInterrupted()
    cancelInitialNest()
    cancelLeftoverNest()
    resetFileState(state)
    state.selectedFile.value = file
    // Force viewer remount so prior-file selection/overrides cannot linger in the same instance.
    state.nestingViewerKey.value += 1
    state.sourceType.value = is3dm ? '3dm' : isDwg ? 'dwg' : 'dxf'
    state.dxfText.value = null

    pushMessage('user', 'file', file.name)

    const ok = await solveUpload({
      openModal: false,
      runNesting: false,
      useViewerBusy: true,
    })
    if (ok && !state.meshPreview.value?.length) {
      const kind = is3dm ? '.3dm' : 'file'
      state.previewNotice.value =
        `This ${kind} couldn't be previewed — Hops returned no geometry.`
      pushFileError(
        `This ${kind} couldn't be previewed — no geometry was returned. It may not meet the expected format.`,
      )
    }
  }

  function onStartNesting() {
    if (state.nestRevealPaused.value === 'leftover') {
      awaitOrRevealLeftoverNest()
      return
    }
    if (state.nestRevealPaused.value === 'initial') {
      awaitOrRevealNest()
      return
    }
    if (showLeftoverNestingButton.value) {
      awaitOrRevealLeftoverNest()
      return
    }
    awaitOrRevealNest()
  }

  function onStopNesting() {
    activeRevealSession?.interrupt({ keepContinue: true })
  }

  function markPriorSheetSizeConfirmsSuperseded({ leftover = false, exceptId = null } = {}) {
    for (const msg of state.messages.value) {
      if (!msg.meta?.sheetSizeConfirm) continue
      if (Boolean(msg.meta?.leftover) !== leftover) continue
      if (exceptId && msg.id === exceptId) continue
      msg.meta = { ...msg.meta, superseded: true }
    }
  }

  function sheetSizesEqual(a, b) {
    if (!a || !b) return false
    return a.sheetX === b.sheetX && a.sheetY === b.sheetY && a.sheetThickness === b.sheetThickness
  }

  function materialsEqual(a, b) {
    if (!a || !b) return false
    return a.id === b.id
  }

  function findActiveConfirm({ kind, promptMessageId, leftover = false }) {
    return state.messages.value.find((m) => {
      if (leftover ? !m.meta?.leftover : m.meta?.leftover) return false
      if (m.meta?.superseded) return false
      if (m.meta?.promptMessageId !== promptMessageId) return false
      if (kind === 'sheet-size') return Boolean(m.meta?.sheetSizeConfirm)
      if (kind === 'material') return Boolean(m.meta?.materialConfirm)
      return false
    })
  }

  function onSheetSizeChoice({ sheetX, sheetY, sheetThickness }) {
    const x = Math.round(Number(sheetX))
    const y = Math.round(Number(sheetY))
    const t = Math.round(Number(sheetThickness))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t) || x <= 0 || y <= 0 || t <= 0) return

    const msgId = state.activeSheetSizeSelectId.value
    const msg = state.messages.value.find((m) => m.id === msgId)
    const isLeftover = Boolean(msg?.meta?.leftover)
    const nextSize = { sheetX: x, sheetY: y, sheetThickness: t }

    if (msg) {
      msg.meta = { ...msg.meta, sheetX: x, sheetY: y, sheetThickness: t, resolved: true }
    }

    if (isLeftover) {
      clearNestFitErrors({ processKind: 'leftover' })
      const material = state.pendingLeftoverSheetMaterial.value
      if (!material || !sheetFitsMaterial(material, nextSize)) return

      state.pendingLeftoverSheetSize.value = nextSize
      markPriorSheetSizeConfirmsSuperseded({ leftover: true })
      const confirmId = pushMessage(
        'assistant',
        'text',
        `Sheet size for unassigned parts: ${x}mm x ${y}mm x ${t}mm`,
        nestProcessMeta('leftover', { sheetSizeConfirm: true, promptMessageId: msgId }),
      )
      state.activeSheetSizeConfirmId.value = confirmId
      state.activeSheetSizeSelectId.value = null
      clearNestRevealInterrupted('leftover')
      kickstartLeftoverNest()
      return
    }

    clearNestFitErrors({ processKind: 'initial' })
    const material = state.pendingSheetMaterial.value
    if (material && !sheetFitsMaterial(material, nextSize)) return

    const previousSize = state.pendingSheetSize.value
    const sizeUnchanged = sheetSizesEqual(previousSize, nextSize)
    const hadNested = hasNestResult(state.summonedPreview.value)

    state.pendingSheetSize.value = nextSize

    // Re-confirming the same size must not invalidate or supersede nesting.
    if (sizeUnchanged) {
      state.activeSheetSizeSelectId.value = null
      const existingConfirm = findActiveConfirm({
        kind: 'sheet-size',
        promptMessageId: msgId,
        leftover: false,
      })
      if (existingConfirm) {
        state.activeSheetSizeConfirmId.value = existingConfirm.id
      } else {
        markPriorSheetSizeConfirmsSuperseded({ leftover: false })
        state.activeSheetSizeConfirmId.value = pushMessage(
          'assistant',
          'text',
          `Sheet size for nesting: ${x}mm x ${y}mm x ${t}mm`,
          nestProcessMeta('initial', { sheetSizeConfirm: true, promptMessageId: msgId }),
        )
      }
      if (!hadNested) {
        clearNestRevealInterrupted('initial')
        kickstartInitialNest()
      }
      return
    }

    if (hadNested) {
      invalidateNestResult({ reason: 'sheet-size' })
    }

    markPriorSheetSizeConfirmsSuperseded({ leftover: false })
    const confirmId = pushMessage(
      'assistant',
      'text',
      `Sheet size for nesting: ${x}mm x ${y}mm x ${t}mm`,
      nestProcessMeta('initial', { sheetSizeConfirm: true, promptMessageId: msgId }),
    )
    state.activeSheetSizeConfirmId.value = confirmId
    state.activeSheetSizeSelectId.value = null

    if (hadNested) {
      // Keep prior Initial nesting panels for history; only drop nest results.
      state.messages.value = state.messages.value.filter((m) => m.kind !== 'nesting-result')
    }

    clearNestRevealInterrupted('initial')
    kickstartInitialNest()
  }

  function onMaterialChoice({ id, label, allowedThicknessesMm, allowedSizesMm }) {
    const matId = String(id ?? '').trim()
    const matLabel = String(label ?? '').trim()
    const allowed = (Array.isArray(allowedThicknessesMm) ? allowedThicknessesMm : [])
      .map((t) => Math.round(Number(t)))
      .filter((t) => Number.isFinite(t) && t > 0)
    const sizes = (Array.isArray(allowedSizesMm) ? allowedSizesMm : [])
      .map((entry) => {
        const x = Math.round(Number(entry?.x))
        const y = Math.round(Number(entry?.y))
        if (![x, y].every((n) => Number.isFinite(n) && n > 0)) return null
        return { x, y }
      })
      .filter(Boolean)
    if (!matId || !matLabel || !allowed.length || !sizes.length) return

    const chosen = {
      id: matId,
      label: matLabel,
      allowedThicknessesMm: allowed,
      allowedSizesMm: sizes,
    }
    const msgId = state.activeMaterialSelectId.value
    const msg = state.messages.value.find((m) => m.id === msgId)
    const isLeftover = Boolean(msg?.meta?.leftover)

    if (isLeftover) {
      state.pendingLeftoverSheetMaterial.value = chosen
      state.pendingLeftoverSheetSize.value = null
      cancelLeftoverNest()

      if (msg) {
        msg.meta = {
          ...msg.meta,
          materialId: matId,
          materialLabel: matLabel,
          allowedThicknessesMm: allowed,
          allowedSizesMm: sizes,
          resolved: true,
        }
      }

      const confirmId = pushMessage(
        'assistant',
        'text',
        `Material for unassigned parts: ${matLabel}`,
        nestProcessMeta('leftover', {
          materialConfirm: true,
          promptMessageId: msgId,
        }),
      )
      state.activeMaterialConfirmId.value = confirmId
      state.activeMaterialSelectId.value = null

      if (state.leftoverNestPreview.value) {
        state.leftoverNestPreview.value = {
          ...state.leftoverNestPreview.value,
          materialLabel: matLabel,
        }
        return
      }

      const existingSheetPrompt = state.messages.value.find(
        (m) => m.kind === 'sheet-size-select' && m.meta?.leftover,
      )
      if (existingSheetPrompt) {
        const defaults = sheetDefaultsForMaterial(chosen)
        existingSheetPrompt.meta = {
          ...existingSheetPrompt.meta,
          ...nestProcessMeta('leftover'),
          ...defaults,
          materialId: chosen.id,
          materialLabel: chosen.label,
          allowedThicknessesMm: chosen.allowedThicknessesMm,
          allowedSizesMm: chosen.allowedSizesMm,
          resolved: false,
        }
        state.activeSheetSizeConfirmId.value = null
        state.activeSheetSizeSelectId.value = existingSheetPrompt.id
        return
      }

      promptLeftoverSheetSize()
      return
    }

    const previousMaterial = state.pendingSheetMaterial.value
    const previousLabel = previousMaterial?.label ?? null
    const materialUnchanged = materialsEqual(previousMaterial, chosen)
    const keys = partKeysForMaterialApply(previousLabel)
    const hadNested = hasNestResult(state.summonedPreview.value)

    if (msg) {
      msg.meta = {
        ...msg.meta,
        materialId: matId,
        materialLabel: matLabel,
        allowedThicknessesMm: allowed,
        allowedSizesMm: sizes,
        resolved: true,
      }
    }

    // Re-confirming the same material must not invalidate or supersede nesting.
    if (materialUnchanged) {
      state.pendingSheetMaterial.value = chosen
      state.activeMaterialSelectId.value = null
      const existingConfirm = findActiveConfirm({
        kind: 'material',
        promptMessageId: msgId,
        leftover: false,
      })
      if (existingConfirm) {
        state.activeMaterialConfirmId.value = existingConfirm.id
      } else {
        state.activeMaterialConfirmId.value = pushMessage(
          'assistant',
          'text',
          `Material for nesting: ${matLabel}`,
          nestProcessMeta('initial', {
            materialConfirm: true,
            promptMessageId: msgId,
          }),
        )
      }
      if (!hadNested) {
        if (!state.pendingSheetSize.value) {
          cancelInitialNest()
          promptSheetSize()
          return
        }
        clearNestRevealInterrupted('initial')
        kickstartInitialNest()
      }
      return
    }

    if (hadNested) {
      invalidateNestResult({ reason: 'metadata' })
    }

    if (keys.length) {
      state.metadataOverrides.value = applyMetadataByPartKeys({
        partKeys: keys,
        field: 'mat',
        value: matLabel,
        metadataOverrides: state.metadataOverrides.value,
      })
    }

    state.pendingSheetMaterial.value = chosen

    const confirmId = pushMessage(
      'assistant',
      'text',
      `Material for nesting: ${matLabel}`,
      nestProcessMeta('initial', {
        materialConfirm: true,
        promptMessageId: msgId,
      }),
    )
    state.activeMaterialConfirmId.value = confirmId
    state.activeMaterialSelectId.value = null

    const existingSize = state.pendingSheetSize.value
    if (existingSize && !sheetFitsMaterial(chosen, existingSize)) {
      state.pendingSheetSize.value = null
      cancelInitialNest()
      const existingSheetPrompt = state.messages.value.find(
        (m) => m.kind === 'sheet-size-select' && !m.meta?.leftover,
      )
      if (existingSheetPrompt) {
        const defaults = sheetDefaultsForMaterial(chosen)
        existingSheetPrompt.meta = {
          ...existingSheetPrompt.meta,
          ...nestProcessMeta('initial'),
          ...defaults,
          materialId: chosen.id,
          materialLabel: chosen.label,
          allowedThicknessesMm: chosen.allowedThicknessesMm,
          allowedSizesMm: chosen.allowedSizesMm,
          resolved: false,
          superseded: false,
        }
        state.activeSheetSizeConfirmId.value = null
        state.activeSheetSizeSelectId.value = existingSheetPrompt.id
        return
      }
    }

    if (!state.pendingSheetSize.value) {
      cancelInitialNest()
      promptSheetSize()
      return
    }

    clearNestRevealInterrupted('initial')
    kickstartInitialNest()
  }

  function onModifyMaterial({ promptMessageId }) {
    const prompt = state.messages.value.find((m) => m.id === promptMessageId)
    if (!prompt || prompt.kind !== 'material-select') return

    if (prompt.meta?.leftover) {
      const material = state.pendingLeftoverSheetMaterial.value
      prompt.meta = {
        ...prompt.meta,
        materialId: material?.id,
        materialLabel: material?.label,
        allowedThicknessesMm: material?.allowedThicknessesMm,
        allowedSizesMm: material?.allowedSizesMm,
        sheetThickness: state.pendingLeftoverSheetSize.value?.sheetThickness,
        resolved: false,
      }
      cancelLeftoverNest()
    } else {
      const material = state.pendingSheetMaterial.value
      prompt.meta = {
        ...prompt.meta,
        materialId: material?.id,
        materialLabel: material?.label,
        allowedThicknessesMm: material?.allowedThicknessesMm,
        allowedSizesMm: material?.allowedSizesMm,
        sheetThickness: state.pendingSheetSize.value?.sheetThickness,
        resolved: false,
      }
      cancelInitialNest()
    }

    state.activeMaterialConfirmId.value = null
    state.activeMaterialSelectId.value = promptMessageId
  }

  function onModifySheetSize({ promptMessageId }) {
    const prompt = state.messages.value.find((m) => m.id === promptMessageId)
    if (!prompt || prompt.kind !== 'sheet-size-select') return

    if (prompt.meta?.leftover) {
      const material = state.pendingLeftoverSheetMaterial.value
      prompt.meta = {
        ...prompt.meta,
        ...state.pendingLeftoverSheetSize.value,
        materialId: material?.id,
        materialLabel: material?.label,
        allowedThicknessesMm: material?.allowedThicknessesMm,
        allowedSizesMm: material?.allowedSizesMm,
        resolved: false,
      }
      cancelLeftoverNest()
      state.activeSheetSizeConfirmId.value = null
      state.activeSheetSizeSelectId.value = promptMessageId
      return
    }

    const material = state.pendingSheetMaterial.value
    if (!material) return

    const inCurrentProcess =
      prompt.meta?.processId === state.initialNestProcessId.value
      && !prompt.meta?.superseded

    // Same attempt — reopen the existing select in place without invalidating nesting.
    // Nesting is only invalidated later if the confirmed size actually changes.
    if (inCurrentProcess) {
      prompt.meta = {
        ...prompt.meta,
        ...state.pendingSheetSize.value,
        materialId: material.id,
        materialLabel: material.label,
        allowedThicknessesMm: material.allowedThicknessesMm,
        allowedSizesMm: material.allowedSizesMm,
        resolved: false,
      }
      cancelInitialNest()
      state.activeSheetSizeConfirmId.value = null
      state.activeSheetSizeSelectId.value = promptMessageId
      return
    }

    // Older / superseded panel — open a fresh select on the current Initial nesting attempt.
    const currentProcessId = state.initialNestProcessId.value
    state.messages.value = state.messages.value.filter((m) => {
      if (m.meta?.processId !== currentProcessId) return true
      if (m.kind === 'sheet-size-select' && !m.meta?.leftover) return false
      if (m.meta?.sheetSizeConfirm && !m.meta?.leftover) return false
      return true
    })

    const size = state.pendingSheetSize.value ?? sheetDefaultsForMaterial(material)
    const messageId = pushMessage(
      'assistant',
      'sheet-size-select',
      'What sheet size should be used for nesting?',
      nestProcessMeta('initial', {
        ...size,
        materialId: material.id,
        materialLabel: material.label,
        allowedThicknessesMm: material.allowedThicknessesMm,
        allowedSizesMm: material.allowedSizesMm,
        resolved: false,
      }),
    )
    cancelInitialNest()
    state.activeSheetSizeConfirmId.value = null
    state.activeSheetSizeSelectId.value = messageId
  }

  const canStartNesting = computed(() => {
    if (!state.selectedFile.value || state.busy.value || state.viewerBusy.value) return false
    return state.readyForNesting.value
  })

  const showNestingButton = computed(() => {
    if (state.activeSheetSizeSelectId.value) return false
    if (state.activeMaterialSelectId.value) return false
    if (state.activeLeftoverMaterialReuseId.value) return false
    if (hasNestResult(state.summonedPreview.value)) return false
    const material = state.pendingSheetMaterial.value
    const size = state.pendingSheetSize.value
    return canStartNesting.value
      && Boolean(material)
      && Boolean(size)
      && !hasMissingMat.value
      && sheetFitsMaterial(material, size)
  })

  const showLeftoverNestingButton = computed(() => {
    if (state.busy.value || state.viewerBusy.value) return false
    if (state.activeSheetSizeSelectId.value) return false
    if (state.activeMaterialSelectId.value) return false
    if (state.activeLeftoverMaterialReuseId.value) return false
    if (state.leftoverNestPreview.value) return false
    if (!state.summonedPreview.value?.hasUnassignedDxf) return false
    const material = state.pendingLeftoverSheetMaterial.value
    const size = state.pendingLeftoverSheetSize.value
    return Boolean(material)
      && Boolean(size)
      && sheetFitsMaterial(material, size)
  })

  const nestingButtonPrompt = computed(() => {
    if (state.nestRevealPaused.value === 'initial') return NEST_CONTINUE_PROMPT
    if (state.metadataModifiedSinceNest.value) return METADATA_MODIFIED_NEST_PROMPT
    if (state.sheetSizeModifiedSinceNest.value) {
      return 'Sheet size has been modified, please run Nesting process again'
    }
    return 'File ready — run nesting to flatten and nest parts.'
  })

  const leftoverNestingButtonPrompt = computed(() => {
    if (state.nestRevealPaused.value === 'leftover') return NEST_CONTINUE_PROMPT
    return 'Unassigned parts ready — run nesting to place them on the sheet.'
  })

  const canStopNesting = computed(() => state.nestRevealLive.value != null)

  const nestingNeedsRerun = computed(
    () =>
      state.sheetSizeModifiedSinceNest.value || state.metadataModifiedSinceNest.value,
  )

  function onAttachError(message) {
    pushFileError(message)
  }

  function onClearAll() {
    clearNestRevealInterrupted()
    cancelInitialNest()
    cancelLeftoverNest()
    resetFileState(state)
  }

  function closeNestingModal() {
    state.showNestingModal.value = false
    if (!hasNestResult(state.summonedPreview.value)) return

    state.postNestMetadataEditing.value = true
    state.viewMode.value = 'input'
    restoreInputPreviewForMetadataEditing({
      annotationFallback: state.summonedPreview.value?.inputTextDxf ?? null,
    })
    applyPostNestMetadataSeed()
    state.nestingViewerKey.value += 1
  }

  function openNestingModal() {
    if (!state.summonedPreview.value) return
    state.showNestingModal.value = true
  }

  function onNestUnassignedParts() {
    cancelInitialNest()
    cancelLeftoverNest()
    closeNestingModal()
    state.pendingLeftoverSheetSize.value = null
    state.pendingLeftoverSheetMaterial.value = null
    clearStaleLeftoverPrompts()
    ensureLeftoverNestProcessId({ renew: true })
    promptLeftoverMaterialReuse()
  }

  function onConfirmChoice({ choice, messageId }) {
    if (messageId && messageId === state.activeLeftoverMaterialReuseId.value) {
      onLeftoverMaterialReuseChoice(choice)
    }
  }

  function isShowNestingResultRequest(text) {
    return /^show\s+nesting\s+result\.?$/i.test(String(text ?? '').trim())
  }

  function onSendText(text) {
    if (isShowNestingResultRequest(text)) {
      pushMessage('user', 'text', text)
      if (hasNestResult(state.summonedPreview.value)) {
        openNestingModal()
      } else {
        pushMessage('assistant', 'text', 'No nesting result yet. Upload a file and run Nest first.')
      }
      return
    }
    chat.onSendText(text)
  }

  return {
    ...state,
    outputViewEnabled,
    activeViewer,
    showNestingMeshView,
    showMeshPreview,
    showPreviewNotice,
    canStartNesting,
    canStopNesting,
    showNestingButton,
    showLeftoverNestingButton,
    leftoverNestingButtonPrompt,
    nestingNeedsRerun,
    nestingButtonPrompt,
    onAttachFile,
    onAttachError,
    onClearAll,
    onStartNesting,
    onStopNesting,
    onSheetSizeChoice,
    onModifySheetSize,
    onMaterialChoice,
    onModifyMaterial,
    onConfirmChoice,
    hasMissingMat,
    closeNestingModal,
    openNestingModal,
    onNestUnassignedParts,
    onSendText,
    meshPartDescriptors,
    nestingMeshPartDescriptors,
    unassignedPartIdsForViewer,
    partRegistry,
    viewerClickForProperties,
    markModified,
  }
}
