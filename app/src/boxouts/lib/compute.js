/**
 * Browser-side Grasshopper solve client and rhino3dm decoding.
 * API base and poll interval come from VITE_* env (see lib/env.js).
 */

import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import rhino3dmWasm from 'rhino3dm/rhino3dm.wasm?url'

import { getApiBase, getPollIntervalMs } from './env.js'

const API_BASE = getApiBase()
const POLL_INTERVAL_MS = getPollIntervalMs()

let rhino = null
let loadPromise = null

/** Delay helper for poll loop */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * JSON fetch with consistent error handling.
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function fetchJson(url, options) {
  const res = await fetch(url, options)
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error || `${res.status} ${res.statusText}`)
  }
  return body
}

/**
 * Load rhino3dm WASM once (singleton).
 * @returns {Promise<object>} rhino3dm module
 */
export async function loadRhino() {
  if (rhino) return rhino
  if (loadPromise) return loadPromise

  loadPromise = rhino3dm({ locateFile: () => rhino3dmWasm }).then((m) => {
    rhino = m
    return m
  })

  return loadPromise
}

/**
 * Default parameter names/values from the Grasshopper definition (not from CSV).
 * @returns {Promise<Array>}
 */
export async function getDefinitionDefaultParams() {
  const body = await fetchJson(`${API_BASE}/definition-defaults`)
  return body.params
}

/**
 * Normalize messy CSV via backend Anthropic analyze route.
 * @param {string} csvText
 */
// WAITING BFF: POST /api/app/csv/analyze — UI talks only to the Platform BFF
// WAITING MODEL: Claude normalizes messy CSV; our structuring model should decide from inspector facts
export async function analyzeCsv(csvText) {
  return fetchJson(`${API_BASE}/csv/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvText }),
  })
}

/** Extract box dimensions from a handwritten table or sketch photo. */
// WAITING BFF: POST /api/app/image/analyze — UI talks only to the Platform BFF
// WAITING MODEL: Claude reads the photo; our structuring model should decide from inspector facts
export async function analyzeImage(body) {
  return fetchJson(`${API_BASE}/image/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Parse a chat message into add / update / delete / clear command.
 * @param {string} message
 * @param {object[]} existingBoxes
 */
// WAITING BFF: POST /api/app/chat/command — UI talks only to the Platform BFF
// WAITING MODEL: Claude parses add/update/delete/clear; our structuring model should own that
export async function parseBoxCommand(message, existingBoxes) {
  return fetchJson(`${API_BASE}/chat/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, existingBoxes }),
  })
}

/**
 * Start an async multi-variation solve job on the backend.
 * @param {object} inputLists - { BoxDepth: number[], BoxHeight: number[], BoxWidth: number[] }
 * @param {{ variationIndices?: number[] }} [options] - Subset of rows to compute; omit for all rows; [] for nesting-only
 */
// WAITING BFF: POST /api/app/solve — Door Box-Out / Rhino Compute stay behind the BFF
export async function startSolveJob(inputLists, { variationIndices, quantities } = {}) {
  const body = { inputLists }
  if (quantities?.length) {
    body.quantities = quantities
  }
  if (Array.isArray(variationIndices)) {
    body.variationIndices = variationIndices
  }
  return fetchJson(`${API_BASE}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Poll job status and partial results.
 * @param {string} jobId
 */
// WAITING BFF: GET /api/app/solve/:jobId — job snapshots come from the BFF, not Flask directly
export async function getSolveJob(jobId) {
  return fetchJson(`${API_BASE}/solve/${jobId}`)
}

/**
 * Apply one poll snapshot to local cache, errors, warnings, and progress.
 * @param {object} snapshot - Backend job snapshot
 * @param {object} acc - Accumulator { cache: Map, warnings: string[], rowErrors: Map, geometryCount: number }
 * @returns {object} Updated acc fields plus computeProgress and solveOk
 */
export function processSolveSnapshot(snapshot, acc) {
  const computeProgress = {
    total: snapshot.variationCount ?? 0,
    currentIndex: snapshot.currentVariationIndex ?? null,
    completedCount: snapshot.completedVariations?.length ?? 0,
    failedCount: Object.keys(snapshot.failedVariations ?? {}).length,
  }

  const results = snapshot.variationResults ?? {}
  const cache = new Map(acc.cache)
  let addedGeometry = 0
  const warnings = [...acc.warnings]

  // Decode any newly completed variation geometry into File3dm docs
  for (const [indexKey, entry] of Object.entries(results)) {
    const index = Number.parseInt(indexKey, 10)
    if (cache.has(index) || !entry?.geometryPayload) continue

    const { doc, geometryCount } = createDocFromGhResponse(entry.geometryPayload)
    cache.set(index, doc)
    addedGeometry += geometryCount
    if (entry.warnings?.length) {
      warnings.push(...entry.warnings.map((w) => `Row ${index + 1}: ${w}`))
    }
  }

  // Record per-row failure messages from the backend
  const failed = snapshot.failedVariations ?? {}
  const rowErrors = new Map(acc.rowErrors)
  for (const [indexKey, message] of Object.entries(failed)) {
    const index = Number.parseInt(indexKey, 10)
    rowErrors.set(index, message)
  }

  const geometryCount = acc.geometryCount + addedGeometry

  for (const message of snapshot.jobWarnings ?? []) {
    if (!warnings.includes(message)) {
      warnings.push(message)
    }
  }

  const perBoxNesting = snapshot.perBoxNesting ?? { kSheetNr: null, fSheetNr: null }
  const fullSetNesting = snapshot.fullSetNesting ?? { kSheetNr: null, fSheetNr: null }

  return {
    cache,
    warnings,
    rowErrors,
    geometryCount,
    addedGeometry,
    computeProgress,
    solveOk: cache.size > 0,
    perBoxNesting,
    fullSetNesting,
  }
}

/**
 * Run a full solve: start job, poll until completed or failed.
 * @param {object} inputLists
 * @param {{ onSnapshot?: Function, pollIntervalMs?: number, shouldAbort?: () => boolean, variationIndices?: number[] }} [options]
 */
export async function runSolve(
  inputLists,
  { onSnapshot, pollIntervalMs = POLL_INTERVAL_MS, shouldAbort, variationIndices, quantities } = {},
) {
  await loadRhino()
  const start = await startSolveJob(inputLists, { variationIndices, quantities })
  const jobId = start.jobId

  while (true) {
    if (shouldAbort?.()) {
      return { status: 'aborted', jobId }
    }

    const snapshot = await getSolveJob(jobId)
    onSnapshot?.(snapshot)

    if (snapshot.status === 'completed') {
      return snapshot
    }

    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error || 'Solver failed')
    }

    await sleep(pollIntervalMs)
  }
}

/** Parse Grasshopper path "{0;1;2}" into numeric indices */
function parseGhPathIndices(path) {
  const inner = path.replace(/^\{|\}$/g, '')
  if (!inner) return []
  return inner.split(';').map((s) => Number.parseInt(s, 10))
}

/** Compare two GH tree paths for stable branch ordering */
function compareGhPaths(a, b) {
  const pa = parseGhPathIndices(a)
  const pb = parseGhPathIndices(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (diff !== 0) return diff
  }
  return 0
}

/** Sorted branch keys for a Grasshopper InnerTree */
function sortedBranchPaths(innerTree) {
  return Object.keys(innerTree).sort(compareGhPaths)
}

/**
 * Turn a Grasshopper compute JSON payload into a displayable File3dm.
 * Requires loadRhino() first.
 * @param {object} res - GH output with values[].InnerTree
 * @returns {{ doc: object, geometryCount: number }}
 */
export function createDocFromGhResponse(res) {
  const r = rhino
  const doc = new r.File3dm()
  let geometryCount = 0

  // Walk each output parameter and its data tree branches
  for (const output of res.values ?? []) {
    const innerTree = output.InnerTree ?? {}
    let branchIndex = 0
    for (const path of sortedBranchPaths(innerTree)) {
      for (const d of innerTree[path]) {
        if (!String(d.type ?? '').includes('Geometry')) continue
        const data = JSON.parse(d.data)
        const rhinoObject = r.CommonObject.decode(data)
        const attrs = new r.ObjectAttributes()
        attrs.setUserString('ghParamName', output.ParamName)
        attrs.setUserString('ghBranchIndex', String(branchIndex))
        doc.objects().add(rhinoObject, attrs)
        geometryCount++
      }
      branchIndex++
    }
  }

  // Promote geometry user strings to object attributes for display
  const objects = doc.objects()
  for (let i = 0; i < objects.count; i++) {
    const rhinoObject = objects.get(i)
    const geometry = rhinoObject.geometry()
    if (geometry.userStringCount > 0) {
      const gUserStrings = geometry.getUserStrings()
      for (let j = 0; j < gUserStrings.length; j++) {
        rhinoObject.attributes().setUserString(gUserStrings[j][0], gUserStrings[j][1])
      }
    }
  }

  return { doc, geometryCount }
}
