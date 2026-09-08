<script setup>
/**
 * 3D viewer: runs backend solve jobs, syncs solve state to App, renders via viewerScene.js.
 */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  cloneSolvedLists,
  collectInvalidRowErrors,
  coerceQuantity,
  CSV_GH_INPUT_NAMES,
  getVariationRowCount,
  planIncrementalSolve,
  remapIndexMap,
} from '../lib/csv.js'
import { processSolveSnapshot, runSolve } from '../lib/compute.js'
import {
  buildVariationStatuses,
  createSolveState,
  ROW_STATUS,
  SOLVE_STAGE,
} from '../lib/solveState.js'
import { createViewerScene } from '../lib/viewerScene.js'

const props = defineProps({
  inputLists: Object,
  variationNames: { type: Array, default: () => [] },
  quantities: { type: Array, default: () => [] },
  selectedVariationIndex: { type: Number, default: 0 },
  /** Incremented by App after CSV upload or Recalculate to start a new backend job */
  solveRequestId: { type: Number, default: 0 },
})

const emit = defineEmits(['update:solveState'])

const containerRef = ref(null)

const joinedGeometryCache = ref(new Map())
const isSolving = ref(false)
const solveStage = ref(SOLVE_STAGE.idle)
const solveError = ref(null)
const solveOk = ref(false)
const geometryCount = ref(0)
const solveWarnings = ref([])
const sentParamNames = ref([])
const rowErrors = ref(new Map())
const computeProgress = ref({
  total: 0,
  currentIndex: null,
  completedCount: 0,
  failedCount: 0,
})
const perBoxNesting = ref({ kSheetNr: null, fSheetNr: null })
const fullSetNesting = ref({ kSheetNr: null, fSheetNr: null, geometryPayload: null })
const perBoxNestingByRow = ref(new Map())
/** Row indices sent to POST /solve for the in-flight job (spinner only on these rows) */
const computingIndices = ref([])

let viewerScene = null
let solveRunId = 0
let solveTurn = Promise.resolve()
/** @type {object|null} Last lists sent to POST /solve (for incremental recompute) */
let lastSolvedLists = null
/** @type {number[]|null} Last quantities sent to POST /solve */
let lastSolvedQuantities = null

// --- Derived display state ---

const activeRhinoDoc = computed(
  () => joinedGeometryCache.value.get(props.selectedVariationIndex) ?? null,
)

const variationStatuses = computed(() =>
  buildVariationStatuses({
    total: computeProgress.value.total,
    cache: joinedGeometryCache.value,
    rowErrors: rowErrors.value,
    currentIndex: computeProgress.value.currentIndex,
    isSolving: isSolving.value,
    computingIndices: computingIndices.value,
  }),
)

const activeVariationStatus = computed(
  () => variationStatuses.value[props.selectedVariationIndex] ?? ROW_STATUS.pending,
)

const viewerIsLoading = computed(
  () =>
    isSolving.value &&
    (activeVariationStatus.value === ROW_STATUS.computing ||
      activeVariationStatus.value === ROW_STATUS.pending),
)

const viewerLoadError = computed(() => {
  if (activeVariationStatus.value !== ROW_STATUS.failed) return null
  return rowErrors.value.get(props.selectedVariationIndex) ?? 'Compute failed for this row'
})

// --- Solve state sync to App ---

/** Emit full solve payload for App / Sidebar / table */
function publishSolveState() {
  emit('update:solveState', {
    isSolving: isSolving.value,
    solveStage: solveStage.value,
    solveError: solveError.value,
    solveOk: solveOk.value,
    geometryCount: geometryCount.value,
    warnings: [...solveWarnings.value],
    computeProgress: { ...computeProgress.value },
    rowErrors: new Map(rowErrors.value),
    variationStatuses: [...variationStatuses.value],
    sentParamNames: [...sentParamNames.value],
    perBoxNesting: { ...perBoxNesting.value },
    fullSetNesting: { ...fullSetNesting.value },
  })
}

/** Reset geometry cache and local solve UI fields */
function resetLocalSolve() {
  solveRunId++
  viewerScene?.clearSceneMeshes()
  joinedGeometryCache.value = new Map()
  isSolving.value = false
  solveStage.value = SOLVE_STAGE.idle
  solveError.value = null
  solveOk.value = false
  geometryCount.value = 0
  solveWarnings.value = []
  sentParamNames.value = []
  rowErrors.value = new Map()
  computeProgress.value = {
    total: 0,
    currentIndex: null,
    completedCount: 0,
    failedCount: 0,
  }
  perBoxNesting.value = { kSheetNr: null, fSheetNr: null }
  fullSetNesting.value = { kSheetNr: null, fSheetNr: null, geometryPayload: null }
  perBoxNestingByRow.value = new Map()
  computingIndices.value = []
  lastSolvedLists = null
  lastSolvedQuantities = null
  publishSolveState()
}

function sumPerBoxNesting() {
  if (perBoxNestingByRow.value.size === 0) {
    return { kSheetNr: null, fSheetNr: null }
  }
  let kSheetNr = 0
  let fSheetNr = 0
  for (const [index, entry] of perBoxNestingByRow.value.entries()) {
    const qty = coerceQuantity(props.quantities?.[index])
    kSheetNr += (entry?.kSheetNr ?? 0) * qty
    fSheetNr += (entry?.fSheetNr ?? 0) * qty
  }
  return { kSheetNr, fSheetNr }
}

function mergePerBoxNestingFromSnapshot(snapshot) {
  const byVariation = snapshot?.perBoxNesting?.byVariation ?? {}
  for (const [indexKey, entry] of Object.entries(byVariation)) {
    const index = Number.parseInt(indexKey, 10)
    if (!Number.isFinite(index) || !entry) continue
    perBoxNestingByRow.value.set(index, {
      kSheetNr: entry.kSheetNr ?? null,
      fSheetNr: entry.fSheetNr ?? null,
    })
  }
  perBoxNesting.value = sumPerBoxNesting()
}

/** Drop cached geometry for rows that will be recomputed; keep the rest when possible. */
function prepareIncrementalSolve(plan) {
  if (!plan.nestingOnly) {
    if (plan.invalidateAllCache) {
      joinedGeometryCache.value = new Map()
      rowErrors.value = new Map()
      perBoxNestingByRow.value = new Map()
      perBoxNesting.value = { kSheetNr: null, fSheetNr: null }
      geometryCount.value = 0
      solveWarnings.value = []
    } else {
      for (const index of plan.indices) {
        joinedGeometryCache.value.delete(index)
        rowErrors.value.delete(index)
        perBoxNestingByRow.value.delete(index)
      }
      perBoxNesting.value = sumPerBoxNesting()
    }
  }

  solveError.value = null
  fullSetNesting.value = { kSheetNr: null, fSheetNr: null, geometryPayload: null }
}

/**
 * Merge one backend poll snapshot into cache and local state.
 * @param {object} snapshot
 * @param {Map<number, string>} [preSolveRowErrors]
 */
function applySnapshot(snapshot, preSolveRowErrors = new Map(), nestingOnly = false) {
  const result = processSolveSnapshot(snapshot, {
    cache: joinedGeometryCache.value,
    warnings: solveWarnings.value,
    rowErrors: rowErrors.value,
    geometryCount: geometryCount.value,
  })

  joinedGeometryCache.value = result.cache
  for (const index of preSolveRowErrors.keys()) {
    joinedGeometryCache.value.delete(index)
  }

  rowErrors.value = result.rowErrors
  for (const [index, message] of preSolveRowErrors) {
    rowErrors.value.set(index, message)
  }

  solveWarnings.value = result.warnings
  geometryCount.value = result.geometryCount
  computeProgress.value = {
    ...result.computeProgress,
    completedCount: joinedGeometryCache.value.size,
  }
  solveOk.value = joinedGeometryCache.value.size > 0
  fullSetNesting.value = {
    ...fullSetNesting.value,
    ...result.fullSetNesting,
    geometryPayload:
      result.fullSetNesting.geometryPayload ?? fullSetNesting.value.geometryPayload ?? null,
  }
  if (!nestingOnly) {
    mergePerBoxNestingFromSnapshot(snapshot)
  }
  publishSolveState()
}

/**
 * Start a multi-variation solve for the current input lists.
 * @param {object} lists - GH input lists from CSV
 * @param {string[]} names - Variation labels
 */
async function startVariationSolve(lists, names, qtys) {
  const runId = ++solveRunId
  const plan = planIncrementalSolve(lists, lastSolvedLists, names, qtys, lastSolvedQuantities)

  if (plan.indices.length === 0 && !plan.nestingOnly) {
    isSolving.value = false
    computingIndices.value = []
    computeProgress.value = { ...computeProgress.value, currentIndex: null }
    publishSolveState()
    return
  }

  if (plan.nestingOnly) {
    if (plan.deletedIndex != null) {
      joinedGeometryCache.value = remapIndexMap(joinedGeometryCache.value, plan.deletedIndex)
      rowErrors.value = remapIndexMap(rowErrors.value, plan.deletedIndex)
      perBoxNestingByRow.value = remapIndexMap(perBoxNestingByRow.value, plan.deletedIndex)
    }
    perBoxNesting.value = sumPerBoxNesting()
    solveOk.value = joinedGeometryCache.value.size > 0
  }

  prepareIncrementalSolve(plan)

  const preSolveRowErrors = plan.nestingOnly
    ? new Map()
    : collectInvalidRowErrors(lists, names)
  if (!plan.nestingOnly) {
    for (const [index, message] of preSolveRowErrors) {
      if (plan.indices.includes(index)) {
        rowErrors.value.set(index, message)
      }
    }
  }

  const isPartial = !plan.invalidateAllCache && plan.indices.length < plan.solveLists.BoxWidth.length
  const variationIndices = plan.nestingOnly ? [] : isPartial ? plan.indices : undefined
  const rowCount = getVariationRowCount(lists, names, qtys)
  computingIndices.value = plan.nestingOnly
    ? []
    : isPartial
      ? [...plan.indices]
      : Array.from({ length: rowCount }, (_, i) => i)

  isSolving.value = true
  solveStage.value = SOLVE_STAGE.running
  sentParamNames.value = [...CSV_GH_INPUT_NAMES]
  computeProgress.value = {
    total: getVariationRowCount(lists, names, qtys),
    currentIndex: null,
    completedCount: joinedGeometryCache.value.size,
    failedCount: plan.nestingOnly
      ? 0
      : [...rowErrors.value.keys()].filter((index) => plan.indices.includes(index)).length,
  }
  solveOk.value = joinedGeometryCache.value.size > 0
  publishSolveState()

  try {
    const snapshot = await runSolve(plan.solveLists, {
      variationIndices,
      quantities: qtys,
      onSnapshot: (pollSnapshot) => {
        if (runId !== solveRunId) return
        applySnapshot(pollSnapshot, preSolveRowErrors, plan.nestingOnly)
      },
      shouldAbort: () => runId !== solveRunId,
    })

    if (runId !== solveRunId || snapshot?.status === 'aborted') return
    lastSolvedLists = cloneSolvedLists(plan.solveLists)
    lastSolvedQuantities = [...qtys]
    solveStage.value = SOLVE_STAGE.completed
  } catch (err) {
    if (runId !== solveRunId) return
    solveError.value = err instanceof Error ? err.message : 'Solver failed'
    if (solveStage.value !== SOLVE_STAGE.completed) {
      solveStage.value = SOLVE_STAGE.failed
    }
  } finally {
    if (runId !== solveRunId) return
    isSolving.value = false
    computingIndices.value = []
    computeProgress.value = {
      ...computeProgress.value,
      currentIndex: null,
    }
    publishSolveState()
  }
}

// --- Watches ---

/** Trigger solve when App increments solveRequestId (after CSV upload or Recalculate) */
watch(
  () => props.solveRequestId,
  (requestId) => {
    if (!requestId || !props.inputLists) return
    solveTurn = solveTurn.then(async () => {
      await nextTick()
      if (!props.solveRequestId || !props.inputLists) return
      await startVariationSolve(props.inputLists, props.variationNames, props.quantities)
    })
  },
)

watch(
  () => props.inputLists,
  (lists) => {
    if (!lists || getVariationRowCount(lists, props.variationNames, props.quantities) === 0) {
      resetLocalSolve()
    }
  },
)

watch(activeRhinoDoc, (doc) => {
  if (!viewerScene) return
  if (doc) void viewerScene.showDoc(doc)
  else viewerScene.clearSceneMeshes()
})

onMounted(() => {
  if (containerRef.value) {
    viewerScene = createViewerScene(containerRef.value)
  }
  publishSolveState()
})

onUnmounted(() => {
  solveRunId++
  viewerScene?.dispose()
  viewerScene = null
})
</script>

<template>
  <!-- Right panel: WebGL viewer with compute loading / error overlays -->
  <main ref="containerRef" class="view">
    <div v-if="viewerIsLoading" class="overlay">
      <div class="spinner" aria-hidden="true" />
      <p class="overlay-text">Computing geometry…</p>
    </div>
    <div v-else-if="viewerLoadError" class="overlay overlay-error">
      <p class="overlay-text">{{ viewerLoadError }}</p>
    </div>
  </main>
</template>

<style scoped>
.view {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: var(--color-viewer-background);
  border-left: 1px solid var(--color-border);
}

.view :deep(canvas) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: color-mix(in srgb, var(--color-viewer-background) 75%, transparent);
  pointer-events: none;
}

.overlay-error {
  background: color-mix(in srgb, var(--color-viewer-background) 85%, transparent);
}

.overlay-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-viewer-foreground);
  text-align: center;
  max-width: 80%;
}

.overlay-error .overlay-text {
  color: #f5a8a8;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid color-mix(in srgb, var(--color-viewer-foreground) 25%, transparent);
  border-top-color: var(--color-viewer-foreground);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
