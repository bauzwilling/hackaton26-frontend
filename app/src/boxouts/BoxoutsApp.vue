<script setup>
/**
 * Root layout: chat input state, variation table, and 3D solve viewer.
 */

import { computed, ref, watch } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ThreeDViewer from './components/3DViewer.vue'
import CsvPreviewComponent from './components/CsvPreviewComponent.vue'
import ParallelCoordinatesComponent from './components/ParallelCoordinatesComponent.vue'
import NestingPanelCountComponent from './components/NestingPanelCountComponent.vue'
import NestingCurvePreviewComponent from './components/NestingCurvePreviewComponent.vue'
import SendResultsComponent from './components/SendResultsComponent.vue'
import { analyzeCsv, analyzeImage, parseBoxCommand } from './lib/compute.js'
import {
  appendVariations,
  coerceParamValue,
  collectOutOfRangeMessages,
  CSV_GH_INPUT_NAMES,
  CSV_PARSE_SOURCE,
  CSV_PARSE_SOURCE_LABELS,
  formatDefaultBoxName,
  mergeAnalyzeWithLocalParse,
  normalizeVariationPayload,
  parseLenientLocalCsv,
  spliceBoxRow,
  summarizeVariationRows,
  tryParseCleanCsv,
} from './lib/csv.js'
import { createSolveState, resetSolveState, SOLVE_STAGE } from './lib/solveState.js'
import ExcelJS from 'exceljs'
import './boxouts.css'


//print box-out version
console.log('Box-Out Version 0.1.5')

const inputLists = ref(null)
const csvSourceLists = ref(null)
const emptyCellKeys = ref(new Set())
const variationNames = ref([])
const quantities = ref([])
const selectedVariationIndex = ref(0)
const solveRequestId = ref(0)

const csvError = ref(null)
const csvAnalyzing = ref(false)
const csvParamCount = ref(0)
/** @type {import('vue').Ref<'local'|'llm'|null>} */
const csvParseSource = ref(null)

/** @type {import('vue').Ref<{ fileName: string, normalized: object, parseSource: string }|null>} */
const pendingFileImport = ref(null)

/** @type {import('vue').Ref<import('./components/ChatPanelComponent.vue').ChatMessage[]>} */
const chatMessages = ref([])
const solveState = ref(createSolveState())
const nestingPreviewOpen = ref(false)
const sendResultsPhase = ref(null)

const nestingGeometryPayload = computed(
  () => solveState.value.fullSetNesting?.geometryPayload ?? null,
)

const nestingPreviewReady = computed(
  () =>
    !solveState.value.isSolving &&
    solveState.value.fullSetNesting?.geometryPayload != null,
)

function onToggleNestingPreview() {
  if (!nestingPreviewReady.value) return
  nestingPreviewOpen.value = !nestingPreviewOpen.value
}

watch(nestingPreviewReady, (ready) => {
  if (!ready) {
    nestingPreviewOpen.value = false
    sendResultsPhase.value = null
  }
})

function nextChatMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** @param {import('./components/ChatPanelComponent.vue').ChatMessage} message */
function pushChatMessage(message) {
  chatMessages.value = [...chatMessages.value, message]
}

function existingBoxesForLlm() {
  if (!inputLists.value || csvParamCount.value === 0) return []
  return Array.from({ length: csvParamCount.value }, (_, i) => ({
    boxNumber: i + 1,
    name: variationNames.value[i]?.trim() || formatDefaultBoxName(i),
    BoxWidth: inputLists.value.BoxWidth[i],
    BoxHeight: inputLists.value.BoxHeight[i],
    BoxDepth: inputLists.value.BoxDepth[i],
  }))
}

function clearTableState() {
  inputLists.value = null
  csvSourceLists.value = null
  emptyCellKeys.value = new Set()
  variationNames.value = []
  quantities.value = []
  csvParamCount.value = 0
  csvParseSource.value = null
  selectedVariationIndex.value = 0
  resetSolveState(solveState)
  nestingPreviewOpen.value = false
}

watch(
  () => solveState.value.solveStage,
  (stage) => {
    if (stage === SOLVE_STAGE.completed && csvParamCount.value > 0) {
      selectedVariationIndex.value = Math.min(
        selectedVariationIndex.value,
        csvParamCount.value - 1,
      )
    }
  },
)

function onSolveStateUpdate(state) {
  solveState.value = {
    ...createSolveState(),
    ...state,
    rowErrors: state.rowErrors instanceof Map ? new Map(state.rowErrors) : new Map(),
    computeProgress: { ...state.computeProgress },
    warnings: [...(state.warnings ?? [])],
    variationStatuses: [...(state.variationStatuses ?? [])],
    sentParamNames: [...(state.sentParamNames ?? [])],
    perBoxNesting: {
      kSheetNr: state.perBoxNesting?.kSheetNr ?? null,
      fSheetNr: state.perBoxNesting?.fSheetNr ?? null,
    },
    fullSetNesting: { ...(state.fullSetNesting ?? {}) },
  }
}

function csvField(value) {
  if (value == null || value === '') return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function xlsxBufferToCsv(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Excel file has no sheets')

  const colCount = sheet.actualColumnCount
  const lines = []
  sheet.eachRow((row) => {
    const fields = []
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c)
      fields.push(csvField(cell.text || cell.value))
    }
    lines.push(fields.join(','))
  })
  return lines.join('\n')
}

async function fileToCsvText(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    return xlsxBufferToCsv(await file.arrayBuffer())
  }
  return file.text()
}

/**
 * @param {{ inputLists: object, variationNames: string[], variationCount: number }} normalizedNew
 * @param {'local'|'llm'} parseSource
 * @param {'replace'|'append'|'overwrite'} mode
 */
function applyVariationPayload(normalizedNew, parseSource, mode) {
  const previousCount = csvParamCount.value
  const isAppend = mode === 'append'

  const merged = normalizeVariationPayload(
    isAppend
      ? appendVariations(inputLists.value, variationNames.value, normalizedNew, quantities.value)
      : normalizedNew,
  )

  const newEmptyKeys = normalizedNew.emptyCellKeys ?? new Set()

  if (isAppend) {
    const offset = previousCount
    const mergedKeys = new Set(emptyCellKeys.value)
    for (const key of newEmptyKeys) {
      const [i, param] = key.split(':')
      mergedKeys.add(`${Number(i) + offset}:${param}`)
    }
    emptyCellKeys.value = mergedKeys
  } else {
    emptyCellKeys.value = new Set(newEmptyKeys)
    selectedVariationIndex.value = 0
  }

  csvSourceLists.value = {
    BoxDepth: [...merged.inputLists.BoxDepth],
    BoxHeight: [...merged.inputLists.BoxHeight],
    BoxWidth: [...merged.inputLists.BoxWidth],
  }

  csvParseSource.value = parseSource
  csvParamCount.value = merged.variationCount
  inputLists.value = merged.inputLists
  variationNames.value = merged.variationNames
  quantities.value = merged.quantities
  solveRequestId.value += 1

  const rowStartIndex = isAppend ? previousCount : 0
  return {
    addedCount: isAppend ? merged.variationCount - previousCount : merged.variationCount,
    isAppend,
    sourceLabel: CSV_PARSE_SOURCE_LABELS[parseSource] ?? 'Parsed',
    summaryText: summarizeVariationRows(merged.inputLists, merged.variationNames, rowStartIndex).join('\n') || 'No boxes parsed.',
    outOfRangeMessages: collectOutOfRangeMessages(merged.inputLists, merged.variationNames, rowStartIndex),
  }
}

function formatWithWarnings(summaryText, outOfRangeMessages) {
  if (!outOfRangeMessages.length) return summaryText
  return `${summaryText}\n\nOut of range:\n${outOfRangeMessages.join('\n')}`
}

function finishFileImport(choice) {
  const pending = pendingFileImport.value
  if (!pending) return
  pendingFileImport.value = null

  if (choice === 'cancel') {
    pushChatMessage({ id: nextChatMessageId(), role: 'assistant', kind: 'result', content: 'Import cancelled.' })
    return
  }

  const result = applyVariationPayload(
    pending.normalized,
    pending.parseSource,
    choice === 'append' ? 'append' : 'overwrite',
  )
  const label = choice === 'append' ? 'Added' : 'Replaced with'
  pushChatMessage({
    id: nextChatMessageId(),
    role: 'assistant',
    kind: result.outOfRangeMessages.length > 0 ? 'error' : 'result',
    content: formatWithWarnings(
      `${label} ${result.addedCount} box(es). ${result.sourceLabel}.\n${result.summaryText}`,
      result.outOfRangeMessages,
    ),
  })
}

async function fileToImageBody(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const name = file.name.toLowerCase()
  const mediaType =
    file.type ||
    (name.endsWith('.png') ? 'image/png' : 'image/jpeg')
  return { imageBase64: btoa(binary), mediaType }
}

async function parseImportFile(file) {
  if (/\.(jpe?g|png)$/i.test(file.name)) {
    const llmResult = await analyzeImage(await fileToImageBody(file))
    return { normalized: normalizeVariationPayload(llmResult), parseSource: CSV_PARSE_SOURCE.llm }
  }

  const text = await fileToCsvText(file)
  const assessment = tryParseCleanCsv(text)
  let parsed
  const usedLlm = assessment.needsAi

  if (!usedLlm) {
    parsed = assessment
  } else {
    const localParsed = parseLenientLocalCsv(text)
    const llmResult = await analyzeCsv(text)
    parsed = mergeAnalyzeWithLocalParse(localParsed, llmResult)
  }

  return {
    normalized: {
      ...normalizeVariationPayload(parsed),
      emptyCellKeys: parsed.emptyCellKeys ?? new Set(),
    },
    parseSource: usedLlm ? CSV_PARSE_SOURCE.llm : CSV_PARSE_SOURCE.local,
  }
}

async function processParsedFileImport(file, parseFile) {
  pushChatMessage({ id: nextChatMessageId(), role: 'user', kind: 'file', content: file.name })
  csvError.value = null
  csvAnalyzing.value = true

  try {
    const { normalized, parseSource } = await parseFile(file)

    if (csvParamCount.value > 0) {
      pendingFileImport.value = { fileName: file.name, normalized, parseSource }
      pushChatMessage({
        id: nextChatMessageId(),
        role: 'assistant',
        kind: 'confirm',
        content: `You have ${csvParamCount.value} box(es). Append ${normalized.variationCount} from "${file.name}" or overwrite?`,
        meta: { choices: ['append', 'overwrite', 'cancel'] },
      })
      return
    }

    const result = applyVariationPayload(normalized, parseSource, 'replace')
    pushChatMessage({
      id: nextChatMessageId(),
      role: 'assistant',
      kind: result.outOfRangeMessages.length > 0 ? 'error' : 'result',
      content: formatWithWarnings(
        `Parsed ${result.addedCount} box(es). ${result.sourceLabel}.\n${result.summaryText}`,
        result.outOfRangeMessages,
      ),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid file'
    csvError.value = message
    pushChatMessage({ id: nextChatMessageId(), role: 'assistant', kind: 'error', content: message })
  } finally {
    csvAnalyzing.value = false
  }
}

function processChatFile(file) {
  return processParsedFileImport(file, parseImportFile)
}

/** @param {string} message */
function onAttachError(message) {
  pushChatMessage({ id: nextChatMessageId(), role: 'assistant', kind: 'error', content: message })
}

async function processChatText(text) {
  pushChatMessage({ id: nextChatMessageId(), role: 'user', kind: 'text', content: text })

  const pendingChoice = text.trim().toLowerCase()
  if (pendingFileImport.value && ['append', 'overwrite', 'cancel'].includes(pendingChoice)) {
    finishFileImport(pendingChoice)
    return
  }

  csvError.value = null
  csvAnalyzing.value = true

  try {
    const command = await parseBoxCommand(text, existingBoxesForLlm())

    if (command.action === 'add') {
      const add = command.add
      if (!add?.variationCount) throw new Error('No box dimensions could be parsed.')
      const result = applyVariationPayload(
        { inputLists: add.inputLists, variationNames: add.variationNames, variationCount: add.variationCount },
        CSV_PARSE_SOURCE.llm,
        csvParamCount.value > 0 ? 'append' : 'replace',
      )
      pushChatMessage({
        id: nextChatMessageId(),
        role: 'assistant',
        kind: result.outOfRangeMessages.length > 0 ? 'error' : 'result',
        content: formatWithWarnings(
          `${result.isAppend ? 'Added' : 'Created'} ${result.addedCount} box(es). ${result.sourceLabel}.\n${result.summaryText}`,
          result.outOfRangeMessages,
        ),
      })
      return
    }

    if (command.action === 'update') {
      const lists = {
        BoxDepth: [...inputLists.value.BoxDepth],
        BoxHeight: [...inputLists.value.BoxHeight],
        BoxWidth: [...inputLists.value.BoxWidth],
      }
      for (const n of command.boxNumbers ?? []) {
        const index = n - 1
        if (index < 0 || index >= csvParamCount.value) continue
        for (const param of CSV_GH_INPUT_NAMES) {
          const delta = coerceParamValue(command.fieldDeltas?.[param])
          if (delta != null) {
            lists[param][index] = (lists[param][index] ?? 0) + delta
            continue
          }
          const coerced = coerceParamValue(command.fields?.[param])
          if (coerced != null) lists[param][index] = coerced
        }
      }
      const merged = normalizeVariationPayload({
        inputLists: lists,
        variationNames: variationNames.value,
        quantities: quantities.value,
      })
      inputLists.value = merged.inputLists
      variationNames.value = merged.variationNames
      quantities.value = merged.quantities
      csvParamCount.value = merged.variationCount
      solveRequestId.value += 1

      const summary = summarizeVariationRows(
        merged.inputLists,
        merged.variationNames,
        0,
        merged.quantities,
      ).join('\n')
      const oor = collectOutOfRangeMessages(merged.inputLists, merged.variationNames, 0)
      pushChatMessage({
        id: nextChatMessageId(),
        role: 'assistant',
        kind: oor.length > 0 ? 'error' : 'result',
        content: formatWithWarnings(`Updated ${command.boxNumbers?.length ?? 0} box(es).\n${summary}`, oor),
      })
      return
    }

    if (command.action === 'delete') {
      const index = command.boxNumber - 1
      if (index < 0 || index >= csvParamCount.value) throw new Error(`Box ${command.boxNumber} not found.`)

      const remaining = csvParamCount.value - 1
      onDeleteRow(index)

      pushChatMessage({
        id: nextChatMessageId(),
        role: 'assistant',
        kind: 'result',
        content: remaining === 0
          ? 'Deleted Box ' + command.boxNumber + '. No boxes remaining.'
          : `Deleted Box ${command.boxNumber}. ${remaining} box(es) remaining.`,
      })
      return
    }

    if (command.action === 'clear') {
      clearTableState()
      pushChatMessage({ id: nextChatMessageId(), role: 'assistant', kind: 'result', content: 'Cleared all boxes.' })
      return
    }

    throw new Error('Could not understand that command.')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not process message'
    csvError.value = message
    pushChatMessage({ id: nextChatMessageId(), role: 'assistant', kind: 'error', content: message })
  } finally {
    csvAnalyzing.value = false
  }
}

function onClearAll() {
  clearTableState()
  pushChatMessage({ id: nextChatMessageId(), role: 'assistant', kind: 'result', content: 'Cleared all boxes.' })
}

function onApplyEditedLists({ inputLists: lists, quantities: qtys }) {
  const merged = normalizeVariationPayload({
    inputLists: lists,
    variationNames: variationNames.value,
    quantities: qtys,
  })
  inputLists.value = merged.inputLists
  variationNames.value = merged.variationNames
  quantities.value = merged.quantities
  csvParamCount.value = merged.variationCount
  solveRequestId.value += 1
}

function onDeleteRow(index) {
  if (index < 0 || index >= csvParamCount.value) return

  const sliced = spliceBoxRow(
    inputLists.value,
    variationNames.value,
    index,
    quantities.value,
  )
  const merged = normalizeVariationPayload({
    inputLists: sliced.inputLists,
    variationNames: sliced.variationNames,
    quantities: sliced.quantities,
  })

  if (merged.variationCount === 0) {
    clearTableState()
    return
  }

  const nextEmptyKeys = new Set()
  for (const key of emptyCellKeys.value) {
    const [i, param] = key.split(':')
    const ri = Number(i)
    if (ri === index) continue
    nextEmptyKeys.add(ri > index ? `${ri - 1}:${param}` : key)
  }
  variationNames.value = merged.variationNames
  inputLists.value = merged.inputLists
  quantities.value = merged.quantities
  csvSourceLists.value = {
    BoxDepth: [...merged.inputLists.BoxDepth],
    BoxHeight: [...merged.inputLists.BoxHeight],
    BoxWidth: [...merged.inputLists.BoxWidth],
  }
  emptyCellKeys.value = nextEmptyKeys
  csvParamCount.value = merged.variationCount
  selectedVariationIndex.value = Math.min(selectedVariationIndex.value, csvParamCount.value - 1)
  solveRequestId.value += 1
}
</script>

<template>
  <div class="app">
    <Sidebar
      :messages="chatMessages"
      :busy="csvAnalyzing"
      :awaiting-confirm="!!pendingFileImport"
      :has-boxes="csvParamCount > 0"
      @send-text="processChatText"
      @attach-file="processChatFile"
      @attach-error="onAttachError"
      @confirm-choice="finishFileImport"
      @clear-all="onClearAll"
    />
    <div class="main">
      <div
        class="center-panel"
        :class="{ 'center-panel--nesting-preview': nestingPreviewOpen }"
      >
        <section class="mobile-table">
          <CsvPreviewComponent
            v-model:active-variation-index="selectedVariationIndex"
            :input-lists="inputLists"
            :csv-source-lists="csvSourceLists"
            :empty-cell-keys="emptyCellKeys"
            :variation-names="variationNames"
            :quantities="quantities"
            :solve="solveState"
            @apply-lists="onApplyEditedLists"
            @delete-row="onDeleteRow"
          />
        </section>
        <div class="mobile-toggle">
          <input type="radio" name="mobile-pane" id="mobile-chat" />
          <label for="mobile-chat">Agent</label>
          <input type="radio" name="mobile-pane" id="mobile-3d" checked />
          <label for="mobile-3d">3D</label>
          <input type="radio" name="mobile-pane" id="mobile-plot" />
          <label for="mobile-plot">Plot</label>
          <input type="radio" name="mobile-pane" id="mobile-nesting" :disabled="!nestingPreviewReady" />
          <label for="mobile-nesting">Nesting</label>
        </div>
        <section class="mobile-viewer">
          <div class="parallel-slot">
            <ParallelCoordinatesComponent
              v-model:selected-index="selectedVariationIndex"
              :input-lists="inputLists"
              :variation-names="variationNames"
            />
          </div>
          <NestingCurvePreviewComponent
            v-if="nestingPreviewReady"
            :geometry-payload="nestingGeometryPayload"
          />
          <NestingPanelCountComponent
            :per-box-nesting="solveState.perBoxNesting"
            :full-set-nesting="solveState.fullSetNesting"
            :solving="solveState.isSolving"
            :preview-disabled="!nestingPreviewReady"
            @toggle="onToggleNestingPreview"
            @send-results="sendResultsPhase = 'confirm'"
          />
          <div v-if="nestingPreviewReady" class="mobile-send-results">
            <SendResultsComponent
              :disabled="!nestingPreviewReady"
              @click="sendResultsPhase = 'confirm'"
            />
          </div>
        </section>
      </div>
      <ThreeDViewer
        :input-lists="inputLists"
        :variation-names="variationNames"
        :quantities="quantities"
        :selected-variation-index="selectedVariationIndex"
        :solve-request-id="solveRequestId"
        @update:solve-state="onSolveStateUpdate"
      />
    </div>
    <div
      v-if="sendResultsPhase"
      class="send-results-overlay"
      @click.self="sendResultsPhase === 'sent' && (sendResultsPhase = null)"
    >
      <div class="send-results-dialog" @click.stop>
        <template v-if="sendResultsPhase === 'confirm'">
          <p class="send-results-dialog__text">Send data to production?</p>
          <div class="send-results-dialog__actions">
            <button type="button" @click="sendResultsPhase = 'sent'">Yes</button>
            <button type="button" @click="sendResultsPhase = null">Go back to editing</button>
          </div>
        </template>
        <p v-else class="send-results-dialog__text">Data sent</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
}

.center-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: #222;
}

.mobile-table,
.mobile-viewer {
  display: contents;
}

.parallel-slot {
  flex: 0 0 25%;
  min-height: 0;
  overflow: hidden;
  border-bottom: 1px solid #ddd;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  order: -1;
}

.center-panel--nesting-preview :deep(.csv-preview) {
  flex: 0 0 50%;
  min-height: 0;
}

:deep(.nesting-panel-bar) {
  flex-shrink: 0;
  border-top: 1px solid #ddd;
  background: #f5f5f5;
  padding: 1.25rem 0.65rem 1.6rem;
  order: 1;
}

.center-panel--nesting-preview .nesting-curve-preview {
  order: 0;
  flex: 1;
  min-height: 0;
}

.send-results-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(51, 51, 51, 0.75);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.send-results-dialog {
  background: var(--color-surface);
  border-radius: 6px;
  padding: 1rem 1.25rem;
  max-width: 18rem;
  text-align: center;
}

.send-results-dialog__text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-summary);
}

.send-results-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.send-results-dialog__actions button {
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}
</style>
