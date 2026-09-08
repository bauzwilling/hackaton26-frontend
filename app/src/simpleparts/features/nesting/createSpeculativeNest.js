/**
 * Tracks a silent speculative nest request so results can be revealed later.
 * Stale jobs are aborted via AbortController and ignored via generation tokens.
 */
export function createSpeculativeNest() {
  let generation = 0
  /** @type {AbortController | null} */
  let controller = null
  /** @type {Promise<SpeculativeOutcome | null> | null} */
  let promise = null
  /** @type {string | null} */
  let fingerprint = null
  /** @type {SpeculativeOutcome | null} */
  let outcome = null

  function cancel() {
    generation += 1
    controller?.abort()
    controller = null
    promise = null
    fingerprint = null
    outcome = null
  }

  /**
   * @param {string} nextFingerprint
   * @param {(ctx: { signal: AbortSignal, generation: number }) => Promise<SpeculativeOutcome>} run
   */
  function start(nextFingerprint, run) {
    if (
      nextFingerprint === fingerprint
      && (promise || outcome)
    ) {
      return { reused: true, generation, promise, outcome, signal: controller?.signal ?? null }
    }

    generation += 1
    const gen = generation
    controller?.abort()
    controller = new AbortController()
    fingerprint = nextFingerprint
    outcome = null

    const signal = controller.signal
    promise = Promise.resolve()
      .then(() => run({ signal, generation: gen }))
      .then((result) => {
        if (gen !== generation) return null
        outcome = result
        return result
      })
      .catch((err) => {
        if (gen !== generation) return null
        if (err?.name === 'AbortError') return null
        const message = String(err?.message ?? err)
        outcome = { ok: false, error: message }
        return outcome
      })
      .finally(() => {
        if (gen === generation) {
          promise = null
          controller = null
        }
      })

    return { reused: false, generation: gen, promise, outcome: null, signal }
  }

  function getSnapshot() {
    return {
      generation,
      fingerprint,
      promise,
      outcome,
      signal: controller?.signal ?? null,
    }
  }

  function matchesFingerprint(fp) {
    return fingerprint != null && fingerprint === fp
  }

  function isCurrent(gen) {
    return gen === generation
  }

  return {
    cancel,
    start,
    getSnapshot,
    matchesFingerprint,
    isCurrent,
  }
}

/**
 * @param {{
 *   inputJobId?: string | null,
 *   sheetX: number,
 *   sheetY: number,
 *   sheetThickness: number,
 *   materialId: string,
 *   overrides: Record<string, unknown>,
 * }} input
 */
export function buildNestFingerprint(input) {
  return JSON.stringify({
    inputJobId: input.inputJobId ?? null,
    sheetX: input.sheetX,
    sheetY: input.sheetY,
    sheetThickness: input.sheetThickness,
    materialId: input.materialId,
    overrides: input.overrides,
  })
}

/**
 * @param {{
 *   jobId: string,
 *   sheetX: number,
 *   sheetY: number,
 *   sheetThickness: number,
 *   materialId: string,
 *   leftoverPartKeys: string[],
 *   overrides: Record<string, unknown>,
 * }} input
 */
export function buildLeftoverNestFingerprint(input) {
  return JSON.stringify({
    jobId: input.jobId,
    sheetX: input.sheetX,
    sheetY: input.sheetY,
    sheetThickness: input.sheetThickness,
    materialId: input.materialId,
    leftoverPartKeys: input.leftoverPartKeys,
    overrides: input.overrides,
  })
}

/**
 * @typedef {{ ok: true, data: object } | { ok: false, error: string }} SpeculativeOutcome
 */
