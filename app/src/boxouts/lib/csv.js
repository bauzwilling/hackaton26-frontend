/**
 * CSV parsing and validation for BoxDepth / BoxHeight / BoxWidth variation tables.
 * No compute or API calls.
 */

/** Grasshopper input parameter names expected in CSV columns */
export const CSV_GH_INPUT_NAMES = ['BoxDepth', 'BoxHeight', 'BoxWidth']

/** Allowed numeric ranges per parameter (enforced on recalculate) */
export const CSV_GH_PARAM_BOUNDS = {
  BoxDepth: { min: 150, max: 450 },
  BoxHeight: { min: 600, max: 2600 },
  BoxWidth: { min: 800, max: 1000 },
}

/** Short labels for chat and UI copy */
export const CSV_GH_PARAM_LABELS = {
  BoxDepth: 'Depth (mm)',
  BoxHeight: 'Height (mm)',
  BoxWidth: 'Width (mm)',
}

/** Header label for the box name column */
export const CSV_VARIATION_COLUMN = 'Box'

/** Header label for the quantity column */
export const CSV_QUANTITY_COLUMN = 'Quantity'

/** Default 1-based label when a row has no name (e.g. Box 1, Box 2). */
export function formatDefaultBoxName(index) {
  return `Box ${index + 1}`
}

/** Display labels for invalid table cells */
export const CSV_CELL_MISSING = 'missing value'
export const CSV_CELL_EMPTY = 'empty value'
export const CSV_CELL_OUT_OF_RANGE = 'value out of valid range'

/** How the last uploaded CSV was parsed */
export const CSV_PARSE_SOURCE = {
  local: 'local',
  llm: 'llm',
}

/** Human-readable labels for CSV_PARSE_SOURCE values */
export const CSV_PARSE_SOURCE_LABELS = {
  [CSV_PARSE_SOURCE.local]: 'Parsed locally (no LLM)',
  [CSV_PARSE_SOURCE.llm]: 'Normalized via LLM',
}

/**
 * Row count shared by inputLists columns and variationNames (max length when mismatched).
 * @param {object} lists
 * @param {string[]} [variationNames]
 */
export function getVariationRowCount(lists, variationNames = [], quantities = []) {
  const lengths = [
    ...(lists ? CSV_GH_INPUT_NAMES.map((name) => lists[name]?.length ?? 0) : []),
    variationNames?.length ?? 0,
    quantities?.length ?? 0,
  ]
  return Math.max(0, ...lengths)
}

/**
 * Pad an array to rowCount; numeric lists use null, names use ''.
 * @param {Array} values
 * @param {number} rowCount
 * @param {boolean} [isNameColumn=false]
 */
function padToRowCount(values, rowCount, isNameColumn = false) {
  const fill = isNameColumn ? '' : null
  const padded = [...(values ?? [])]
  while (padded.length < rowCount) {
    padded.push(fill)
  }
  return padded.slice(0, rowCount)
}

function padQuantities(values, rowCount) {
  const padded = [...(values ?? [])]
  while (padded.length < rowCount) padded.push(1)
  return padded.slice(0, rowCount).map((q) => coerceQuantity(q))
}

export function coerceQuantity(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function rowSizeKey(lists, index) {
  const complete = CSV_GH_INPUT_NAMES.every((param) =>
    isParamValueValid(lists[param]?.[index], param),
  )
  if (!complete) return `incomplete:${index}`
  return CSV_GH_INPUT_NAMES.map((param) => coerceParamValue(lists[param][index])).join('|')
}

/** Merge rows with identical dimensions; sum quantities. */
export function groupVariationsBySize(payload) {
  const { inputLists, quantities } = payload
  const count = getVariationRowCount(inputLists, payload.variationNames, quantities)
  if (count === 0) {
    return { inputLists, variationNames: [], quantities: [], variationCount: 0 }
  }

  const groups = new Map()
  for (let i = 0; i < count; i++) {
    const key = rowSizeKey(inputLists, i)
    const qty = coerceQuantity(quantities?.[i])
    const existing = groups.get(key)
    if (existing) {
      existing.quantity += qty
    } else {
      groups.set(key, {
        BoxDepth: inputLists.BoxDepth[i],
        BoxHeight: inputLists.BoxHeight[i],
        BoxWidth: inputLists.BoxWidth[i],
        quantity: qty,
      })
    }
  }

  const merged = { BoxDepth: [], BoxHeight: [], BoxWidth: [] }
  const mergedQuantities = []
  for (const entry of groups.values()) {
    merged.BoxDepth.push(entry.BoxDepth)
    merged.BoxHeight.push(entry.BoxHeight)
    merged.BoxWidth.push(entry.BoxWidth)
    mergedQuantities.push(entry.quantity)
  }

  const rowCount = mergedQuantities.length
  return {
    inputLists: merged,
    variationNames: renumberBoxNames(rowCount),
    quantities: mergedQuantities,
    variationCount: rowCount,
  }
}

/**
 * Align inputLists and variationNames to a single rowCount (pads shorter arrays).
 * @param {{ inputLists: object, variationNames: string[], quantities?: number[] }} payload
 */
export function normalizeVariationPayload(payload) {
  const rowCount = getVariationRowCount(
    payload.inputLists,
    payload.variationNames,
    payload.quantities,
  )

  return groupVariationsBySize({
    inputLists: {
      BoxDepth: padToRowCount(payload.inputLists?.BoxDepth, rowCount),
      BoxHeight: padToRowCount(payload.inputLists?.BoxHeight, rowCount),
      BoxWidth: padToRowCount(payload.inputLists?.BoxWidth, rowCount),
    },
    variationNames: payload.variationNames,
    quantities: padQuantities(payload.quantities, rowCount),
  })
}

/**
 * Append new variation rows to existing input lists.
 * @param {object|null} existingLists
 * @param {string[]} existingNames
 * @param {{ inputLists: object, variationNames?: string[] }} newPayload
 */
/** Remove one row from all columns and names. */
export function spliceBoxRow(lists, names, index, quantities = []) {
  return {
    inputLists: {
      BoxDepth: lists.BoxDepth.filter((_, i) => i !== index),
      BoxHeight: lists.BoxHeight.filter((_, i) => i !== index),
      BoxWidth: lists.BoxWidth.filter((_, i) => i !== index),
    },
    variationNames: names.filter((_, i) => i !== index),
    quantities: quantities.filter((_, i) => i !== index),
  }
}

/** Force 1-based Box N labels for every row (ignores CSV or LLM names). */
export function renumberBoxNames(countOrNames) {
  const count = Array.isArray(countOrNames) ? countOrNames.length : countOrNames
  return Array.from({ length: count }, (_, i) => formatDefaultBoxName(i))
}

/** @deprecated Use renumberBoxNames */
export function renumberDefaultBoxNames(names) {
  return renumberBoxNames(names)
}

export function appendVariations(existingLists, existingNames, newPayload, existingQuantities = []) {
  const normalized = normalizeVariationPayload(newPayload)
  const existingCount = getVariationRowCount(existingLists, existingNames, existingQuantities)

  if (existingCount === 0) {
    return normalized
  }

  return normalizeVariationPayload({
    inputLists: {
      BoxDepth: [...(existingLists?.BoxDepth ?? []), ...normalized.inputLists.BoxDepth],
      BoxHeight: [...(existingLists?.BoxHeight ?? []), ...normalized.inputLists.BoxHeight],
      BoxWidth: [...(existingLists?.BoxWidth ?? []), ...normalized.inputLists.BoxWidth],
    },
    variationNames: [...(existingNames ?? []), ...normalized.variationNames],
    quantities: [...existingQuantities, ...normalized.quantities],
  })
}

/**
 * Human-readable summary of variation rows for chat responses.
 * @param {object} lists
 * @param {string[]} variationNames
 * @param {number} [startIndex=0]
 */
/**
 * @param {string} param
 */
export function formatParamRange(param) {
  const { min, max } = CSV_GH_PARAM_BOUNDS[param]
  return `${min}–${max} mm`
}

/**
 * Chat warnings for values outside allowed bounds.
 * @param {object} lists
 * @param {string[]} variationNames
 * @param {number} [startIndex=0]
 */
export function collectOutOfRangeMessages(lists, variationNames, startIndex = 0) {
  const rows = inputListsToVariationRows(lists, variationNames)
  const messages = []

  for (const row of rows.slice(startIndex)) {
    const name = row.name?.trim() || formatDefaultBoxName(row.index)

    for (const param of CSV_GH_INPUT_NAMES) {
      const value = row[param]
      if (value == null || !Number.isFinite(value)) continue
      if (isParamValueValid(value, param)) continue

      const label = CSV_GH_PARAM_LABELS[param]
      messages.push(
        `${name} ${label} (${value} mm) is out of range. Valid ${label} range: ${formatParamRange(param)}.`,
      )
    }
  }

  return messages
}

export function summarizeVariationRows(lists, variationNames, startIndex = 0, quantities = []) {
  const rows = inputListsToVariationRows(lists, variationNames, quantities)

  return rows.slice(startIndex).map((row) => {
    const depth = row.BoxDepth ?? '?'
    const height = row.BoxHeight ?? '?'
    const width = row.BoxWidth ?? '?'
    const name = row.name?.trim() || formatDefaultBoxName(row.index)
    return `${name}: ${depth} × ${height} × ${width} mm (D × H × W)`
  })
}

/**
 * Parse a dimension cell to a whole-number mm value, or null if missing/invalid.
 * @param {unknown} value
 */
export function coerceParamValue(value) {
  if (value == null || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num)
}

/**
 * Whether a numeric cell value is present and within bounds.
 * @param {unknown} value
 * @param {string} param
 */
export function isParamValueValid(value, param) {
  const num = coerceParamValue(value)
  if (num == null) return false
  const { min, max } = CSV_GH_PARAM_BOUNDS[param]
  return num >= min && num <= max
}

/**
 * Display text for a variation table cell.
 * @param {unknown} value
 * @param {{ param?: string, isName?: boolean }} [options]
 */
export function formatVariationCellDisplay(value, { param = null, isName = false } = {}) {
  if (isName) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed || CSV_CELL_MISSING
  }

  if (value == null || value === '') {
    return CSV_CELL_MISSING
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return CSV_CELL_MISSING
  }

  if (!isParamValueValid(num, param)) {
    return CSV_CELL_OUT_OF_RANGE
  }

  return String(num)
}

/**
 * Split one CSV line on comma, semicolon, or tab; trim cells and strip quotes.
 * @param {string} line
 */
function splitCsvLine(line) {
  return line.split(/[,;\t]/).map((cell) => cell.trim().replace(/^"|"$/g, ''))
}

/**
 * Parse raw CSV text into headers and data rows (skips empty lines).
 * @param {string} text
 */
function parseCsvTable(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map(splitCsvLine)
    .filter((row) => row.some((cell) => cell))

  const [headers, ...dataRows] = rows

  return { headers, rows: dataRows }
}

/**
 * Map header row to column indices for BoxDepth, BoxHeight, BoxWidth (case-insensitive).
 * @param {string[]} headers
 */
function findRequiredColumns(headers) {
  const lower = headers.map((h) => h.toLowerCase())
  const colByParam = {}

  for (const name of CSV_GH_INPUT_NAMES) {
    const idx = lower.indexOf(name.toLowerCase())
    colByParam[name] = idx
  }

  return colByParam
}

/**
 * Parse a cell string to a finite number.
 * @param {string} value
 * @param {string} param
 * @param {number} rowIndex
 */
function parseNumber(value, param, rowIndex) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`${param} row ${rowIndex + 1}: must be a number`)
  }
  const num = Number(value)
  if (!Number.isFinite(num)) {
    throw new Error(`${param} row ${rowIndex + 1}: must be a number`)
  }
  return num
}

/**
 * True when any dimension value is a finite number but not a whole integer.
 * @param {object} inputLists
 */
export function hasNonIntegerDimensions(inputLists) {
  for (const param of CSV_GH_INPUT_NAMES) {
    for (const value of inputLists[param] ?? []) {
      if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
        return true
      }
    }
  }
  return false
}

/**
 * Parse an uploaded CSV into GH input lists and variation names.
 * First column must be the variation name per row.
 * @param {string} text - Raw CSV file contents
 */
export function parseParamsFromCsv(text) {
  const { headers, rows } = parseCsvTable(text)

  if (!headers?.length || !rows.length) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  const colByParam = findRequiredColumns(headers)
  for (const param of CSV_GH_INPUT_NAMES) {
    if (colByParam[param] < 0) {
      throw new Error(`Missing column: ${param}`)
    }
  }

  const inputLists = {
    BoxDepth: [],
    BoxHeight: [],
    BoxWidth: [],
  }

  rows.forEach((row, rowIndex) => {
    for (const param of CSV_GH_INPUT_NAMES) {
      inputLists[param].push(parseNumber(row[colByParam[param]], param, rowIndex))
    }
  })

  const variationNames = rows.map((row, i) => {
    const name = row[0]?.trim() ?? ''
    if (!name) {
      throw new Error(`First column must contain a box name at row ${i + 1}`)
    }
    return name
  })

  return normalizeVariationPayload({ inputLists, variationNames })
}

/**
 * Parse numeric cell when possible; null when not a finite number.
 * @param {string} value
 */
function parseOptionalNumber(value) {
  if (value == null || String(value).trim() === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Best-effort local parse for AI merge — never throws on bounds or bad numbers.
 * Variation names always come from column 1; missing dimension columns yield null.
 * @param {string} text - Raw CSV file contents
 */
export function parseLenientLocalCsv(text) {
  const { headers, rows } = parseCsvTable(text)

  if (!headers?.length || !rows.length) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  const colByParam = findRequiredColumns(headers)
  const inputLists = {
    BoxDepth: [],
    BoxHeight: [],
    BoxWidth: [],
  }
  const emptyCellKeys = new Set()

  rows.forEach((row, rowIndex) => {
    for (const param of CSV_GH_INPUT_NAMES) {
      const col = colByParam[param]
      const raw = col >= 0 ? row[col] : undefined
      // Empty value: column exists in row but cell is blank (e.g. 35,,99).
      // Missing value: row too short, column absent, or unparseable content.
      if (col >= 0 && col < row.length && String(raw).trim() === '') {
        emptyCellKeys.add(`${rowIndex}:${param}`)
      }
      inputLists[param].push(col >= 0 ? parseOptionalNumber(raw) : null)
    }
  })

  const variationNames = rows.map((row) => row[0]?.trim() ?? '')

  return {
    ...normalizeVariationPayload({ inputLists, variationNames }),
    emptyCellKeys,
  }
}

/**
 * Prefer LLM-normalized numbers; fall back to locally parsed values.
 * Variation names always come from the local CSV (column 1).
 * @param {{ inputLists: object, variationNames: string[] }} localParsed
 * @param {{ inputLists?: object, variationNames?: string[] }} llmResult
 */
export function mergeAnalyzeWithLocalParse(localParsed, llmResult) {
  const local = normalizeVariationPayload(localParsed)
  const llmLists = llmResult?.inputLists ?? {}

  const rowCount = Math.max(
    local.variationCount,
    getVariationRowCount(llmLists, llmResult?.variationNames),
  )

  const variationNames = padToRowCount(local.variationNames, rowCount, true)
  const inputLists = {}

  for (const param of CSV_GH_INPUT_NAMES) {
    inputLists[param] = Array.from({ length: rowCount }, (_, i) => {
      const llmVal = llmLists[param]?.[i]
      if (typeof llmVal === 'number' && Number.isFinite(llmVal)) {
        return Number.isInteger(llmVal) ? llmVal : Math.round(llmVal)
      }
      const localVal = local.inputLists[param]?.[i]
      if (typeof localVal === 'number' && Number.isFinite(localVal)) {
        return localVal
      }
      return null
    })
  }

  return {
    ...normalizeVariationPayload({ inputLists, variationNames }),
    emptyCellKeys: localParsed.emptyCellKeys ?? new Set(),
  }
}

/**
 * Try strict local parse; route to AI when structure/cell parsing fails or decimals appear.
 * Out-of-range whole integers stay on the local path — the table flags them per cell.
 * @param {string} text - Raw CSV file contents
 */
export function tryParseCleanCsv(text) {
  try {
    const parsed = parseParamsFromCsv(text)
    if (hasNonIntegerDimensions(parsed.inputLists)) {
      return { needsAi: true }
    }
    return { needsAi: false, ...parsed }
  } catch {
    return { needsAi: true }
  }
}

/**
 * Build table row objects for CsvPreviewComponent.
 * @param {object} lists - inputLists
 * @param {string[]} variationNames
 */
export function inputListsToVariationRows(lists, variationNames, quantities = []) {
  const count = getVariationRowCount(lists, variationNames, quantities)

  return Array.from({ length: count }, (_, i) => ({
    index: i,
    name: variationNames?.[i] ?? null,
    BoxDepth: lists.BoxDepth?.[i] ?? null,
    BoxHeight: lists.BoxHeight?.[i] ?? null,
    BoxWidth: lists.BoxWidth?.[i] ?? null,
    Quantity: quantities?.[i] ?? 1,
  }))
}

/**
 * Headers + string rows for CSV export preview.
 * @param {object} lists
 * @param {string[]} variationNames
 */
function toPreviewTable(lists, variationNames) {
  const count = getVariationRowCount(lists, variationNames)

  const headers = [CSV_VARIATION_COLUMN, ...CSV_GH_INPUT_NAMES]
  const rows = Array.from({ length: count }, (_, i) => [
    formatVariationCellDisplay(variationNames?.[i], { isName: true }),
    ...CSV_GH_INPUT_NAMES.map((name) =>
      formatVariationCellDisplay(lists[name]?.[i], { param: name }),
    ),
  ])

  return { headers, rows }
}

/**
 * Serialize current input lists to downloadable CSV text.
 * @param {object} lists
 * @param {string[]} variationNames
 */
export function inputListsToCsvText(lists, variationNames) {
  const table = toPreviewTable(lists, variationNames)
  const lines = [
    table.headers.join(','),
    ...table.rows.map((row) => row.join(',')),
  ]
  return lines.join('\n')
}

/**
 * Keys for cells edited since upload: `"rowIndex:param"`.
 * @param {object} source - Original csvSourceLists
 * @param {object} effective - Current inputLists
 * @param {string[]} [variationNames]
 */
export function getEditedCellKeys(source, effective, variationNames = []) {
  const keys = new Set()
  const count = getVariationRowCount(effective, variationNames)

  for (let i = 0; i < count; i++) {
    for (const param of CSV_GH_INPUT_NAMES) {
      if (source[param]?.[i] !== effective[param]?.[i]) {
        keys.add(`${i}:${param}`)
      }
    }
  }

  return keys
}

/**
 * Validate list lengths and numeric bounds before recalculate.
 * @param {object} lists
 * @param {string[]} [variationNames]
 * @returns {string|null} Error message or null if valid
 */
export function validateInputLists(lists, variationNames = []) {
  const count = getVariationRowCount(lists, variationNames)

  if (count === 0) return 'At least one box is required'

  for (let i = 0; i < count; i++) {
    const name = variationNames?.[i]
    if (!name || (typeof name === 'string' && !name.trim())) {
      return `Box name row ${i + 1}: ${CSV_CELL_MISSING}`
    }

    for (const param of CSV_GH_INPUT_NAMES) {
      const value = lists[param]?.[i]
      if (value == null || typeof value !== 'number' || !Number.isFinite(value)) {
        return `${param} row ${i + 1}: ${CSV_CELL_MISSING}`
      }

      if (!isParamValueValid(value, param)) {
        return `${param} row ${i + 1}: ${CSV_CELL_OUT_OF_RANGE}`
      }
    }
  }

  return null
}

/**
 * Build rowErrors for rows that cannot be sent to Grasshopper as-is.
 * @param {object} lists
 * @param {string[]} variationNames
 * @returns {Map<number, string>}
 */
export function collectInvalidRowErrors(lists, variationNames) {
  const errors = new Map()
  const count = getVariationRowCount(lists, variationNames)

  for (let i = 0; i < count; i++) {
    const name = variationNames?.[i]
    if (!name || (typeof name === 'string' && !name.trim())) {
      errors.set(i, CSV_CELL_MISSING)
      continue
    }

    for (const param of CSV_GH_INPUT_NAMES) {
      const value = lists[param]?.[i]
      if (coerceParamValue(value) == null) {
        errors.set(i, CSV_CELL_MISSING)
        break
      }
      if (!isParamValueValid(value, param)) {
        errors.set(i, CSV_CELL_OUT_OF_RANGE)
        break
      }
    }
  }

  return errors
}

/**
 * Clone input lists for the solve API, using bound minima as placeholders for invalid cells.
 * @param {object} lists
 */
export function cloneInputListsForSolve(lists) {
  const count = getVariationRowCount(lists)

  const cloned = {}
  for (const param of CSV_GH_INPUT_NAMES) {
    cloned[param] = Array.from({ length: count }, (_, i) => {
      const value = lists[param]?.[i]
      if (isParamValueValid(value, param)) return coerceParamValue(value)
      return CSV_GH_PARAM_BOUNDS[param].min
    })
  }
  return cloned
}

/** Shallow copy of solved input lists for cache invalidation comparisons. */
export function cloneSolvedLists(lists) {
  return {
    BoxDepth: [...lists.BoxDepth],
    BoxHeight: [...lists.BoxHeight],
    BoxWidth: [...lists.BoxWidth],
  }
}

function rowDimensionsEqual(current, last, index) {
  for (const param of CSV_GH_INPUT_NAMES) {
    if (current[param][index] !== last[param][index]) return false
  }
  return true
}

function rowAtEqual(current, last, ci, li, quantities, lastQuantities) {
  for (const param of CSV_GH_INPUT_NAMES) {
    if (current[param][ci] !== last[param][li]) return false
  }
  return coerceQuantity(quantities?.[ci]) === coerceQuantity(lastQuantities?.[li])
}

/** When exactly one row was removed, return its old 0-based index; else null. */
export function findSingleDeletedIndex(current, last, quantities = [], lastQuantities = []) {
  const count = getVariationRowCount(current)
  const lastCount = getVariationRowCount(last)
  if (lastCount - count !== 1) return null

  let ci = 0
  let li = 0
  let deletedIndex = null

  while (ci < count) {
    if (li >= lastCount) return null
    if (rowAtEqual(current, last, ci, li, quantities, lastQuantities)) {
      ci++
      li++
    } else {
      if (deletedIndex !== null) return null
      deletedIndex = li
      li++
    }
  }
  if (li < lastCount) {
    if (deletedIndex !== null) return null
    deletedIndex = li
    li++
  }
  if (ci !== count || li !== lastCount || deletedIndex === null) return null
  return deletedIndex
}

/** Shift map keys down after removing one row index. */
export function remapIndexMap(map, deletedIndex) {
  const next = new Map()
  for (const [key, value] of map) {
    const i = Number(key)
    if (i === deletedIndex) continue
    next.set(i > deletedIndex ? i - 1 : i, value)
  }
  return next
}

function quantitiesEqual(current, last, count) {
  if (!last) return false
  for (let i = 0; i < count; i++) {
    if (coerceQuantity(current[i]) !== coerceQuantity(last[i])) return false
  }
  return true
}

/**
 * Decide which row indices need Grasshopper compute vs can reuse cached geometry.
 * @param {object} lists - Current input lists
 * @param {object|null} lastSolvedLists - Lists last sent to POST /solve
 * @param {string[]} [variationNames]
 * @param {number[]} [quantities]
 * @param {number[]|null} [lastSolvedQuantities]
 * @returns {{ indices: number[], invalidateAllCache: boolean, solveLists: object }}
 */
export function planIncrementalSolve(
  lists,
  lastSolvedLists,
  variationNames = [],
  quantities = [],
  lastSolvedQuantities = null,
) {
  const solveLists = cloneInputListsForSolve(lists)
  const count = getVariationRowCount(solveLists, variationNames, quantities)

  if (count === 0) {
    return { indices: [], invalidateAllCache: true, solveLists }
  }

  const allIndices = Array.from({ length: count }, (_, i) => i)

  if (!lastSolvedLists) {
    return { indices: allIndices, invalidateAllCache: true, solveLists }
  }

  const lastCount = getVariationRowCount(lastSolvedLists)
  if (count < lastCount) {
    const deletedIndex = findSingleDeletedIndex(
      solveLists,
      lastSolvedLists,
      quantities,
      lastSolvedQuantities,
    )
    if (deletedIndex !== null) {
      return {
        indices: [],
        nestingOnly: true,
        deletedIndex,
        invalidateAllCache: false,
        solveLists,
      }
    }
    return { indices: allIndices, invalidateAllCache: true, solveLists }
  }
  if (!quantitiesEqual(quantities, lastSolvedQuantities, count)) {
    if (count === lastCount) {
      let dimsMatch = true
      for (let i = 0; i < count; i++) {
        if (!rowDimensionsEqual(solveLists, lastSolvedLists, i)) {
          dimsMatch = false
          break
        }
      }
      if (dimsMatch) {
        return { indices: [], nestingOnly: true, invalidateAllCache: false, solveLists }
      }
    }
    return { indices: allIndices, invalidateAllCache: true, solveLists }
  }

  const indices = []
  for (let i = 0; i < count; i++) {
    if (i >= lastCount || !rowDimensionsEqual(solveLists, lastSolvedLists, i)) {
      indices.push(i)
    }
  }

  return {
    indices,
    invalidateAllCache: indices.length === count,
    solveLists,
  }
}
