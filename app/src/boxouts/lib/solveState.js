/**
 * Shared solve-job UI state shape, stage constants, and per-row status helpers.
 * Does not call the API — see compute.js.
 */

/** Backend / UI lifecycle for a multi-variation solve job */
export const SOLVE_STAGE = {
  idle: 'idle',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
}

/** Per-row status shown in the table, plot, and 3D viewer overlay */
export const ROW_STATUS = {
  pending: 'pending',
  computing: 'computing',
  done: 'done',
  failed: 'failed',
}

/**
 * Factory for reactive solve UI state mirrored from 3DViewer to App.
 * @returns {object} Initial solve state
 */
export function createSolveState() {
  return {
    isSolving: false,
    solveStage: SOLVE_STAGE.idle,
    solveError: null,
    solveOk: false,
    geometryCount: 0,
    warnings: [],
    sentParamNames: [],
    computeProgress: {
      total: 0,
      currentIndex: null,
      completedCount: 0,
      failedCount: 0,
    },
    rowErrors: new Map(),
    variationStatuses: [],
    perBoxNesting: { kSheetNr: null, fSheetNr: null },
    fullSetNesting: { kSheetNr: null, fSheetNr: null, geometryPayload: null },
  }
}

/**
 * Build per-variation status strings for table rows and viewer overlay.
 * @param {object} options
 * @param {number} options.total - Variation count
 * @param {Map<number, object>} options.cache - Geometry cache (keys = row indices with docs)
 * @param {Map<number, string>} options.rowErrors - Failed row messages
 * @param {number|null} options.currentIndex - Row currently computing on the backend
 * @param {boolean} options.isSolving - Whether a job is in flight
 * @param {number[]|null} [options.computingIndices] - Rows this job is computing; others stay pending
 * @returns {string[]}
 */
export function buildVariationStatuses({
  total,
  cache,
  rowErrors,
  currentIndex,
  isSolving,
  computingIndices = null,
}) {
  if (total === 0) return []

  const computingSet =
    computingIndices == null ? null : new Set(computingIndices)

  const statuses = []
  for (let i = 0; i < total; i++) {
    if (cache.has(i)) {
      statuses.push(ROW_STATUS.done)
    } else if (rowErrors.has(i)) {
      statuses.push(ROW_STATUS.failed)
    } else if (
      isSolving &&
      currentIndex === i &&
      (computingSet == null || computingSet.has(i))
    ) {
      statuses.push(ROW_STATUS.computing)
    } else {
      statuses.push(ROW_STATUS.pending)
    }
  }
  return statuses
}

/**
 * Replace solve state with a fresh object (keeps Vue reactivity when assigned to a ref).
 * @param {import('vue').Ref<object>|object} solveStateRef - ref or plain holder
 */
export function resetSolveState(solveStateRef) {
  const next = createSolveState()
  if (solveStateRef && 'value' in solveStateRef) {
    solveStateRef.value = next
  } else {
    Object.assign(solveStateRef, next)
  }
}
