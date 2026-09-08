<script setup>
/**
 * DXF upload chat. Display-only message history; flow lives in App.vue.
 */

import { computed, nextTick, ref, watch } from 'vue'
import InputRequirementsBubble from './InputRequirementsBubble.vue'

/** @typedef {'user' | 'assistant'} ChatMessageRole */
/** @typedef {'text' | 'file' | 'result' | 'error' | 'warning' | 'confirm' | 'text-position-select' | 'sheet-size-select' | 'material-select' | 'nesting-result' | 'thinking'} ChatMessageKind */

/**
 * @typedef {object} ChatMessage
 * @property {string} id
 * @property {ChatMessageRole} role
 * @property {ChatMessageKind} kind
 * @property {string} content
 * @property {Record<string, unknown>} [meta]
 */

const IMPORT_FILE_EXTENSIONS = ['.dxf', '.3dm', '.dwg']

const props = defineProps({
  /** @type {import('vue').PropType<ChatMessage[]>} */
  messages: {
    type: Array,
    default: () => [],
  },
  /** True while a text or file message is being parsed */
  busy: {
    type: Boolean,
    default: false,
  },
  busyMessage: {
    type: String,
    default: '',
  },
  awaitingConfirm: {
    type: Boolean,
    default: false,
  },
  activeTextPositionSelectId: {
    type: String,
    default: null,
  },
  activeSheetSizeSelectId: {
    type: String,
    default: null,
  },
  activeSheetSizeConfirmId: {
    type: String,
    default: null,
  },
  activeMaterialSelectId: {
    type: String,
    default: null,
  },
  activeMaterialConfirmId: {
    type: String,
    default: null,
  },
  activeConfirmId: {
    type: String,
    default: null,
  },
  /** @type {import('vue').PropType<Array<{ id: string, label: string, allowedThicknessesMm: number[], allowedSizesMm: Array<{ x: number, y: number }> }>>} */
  materials: {
    type: Array,
    default: () => [],
  },
  activeExportAssociatedMessageId: {
    type: String,
    default: null,
  },
  hasBoxes: {
    type: Boolean,
    default: false,
  },
  canStartNesting: {
    type: Boolean,
    default: false,
  },
  canStopNesting: {
    type: Boolean,
    default: false,
  },
  nestRevealPaused: {
    type: String,
    default: null,
  },
  canStartLeftoverNesting: {
    type: Boolean,
    default: false,
  },
  nestingButtonPrompt: {
    type: String,
    default: 'File ready — run nesting to flatten and nest parts.',
  },
  leftoverNestingButtonPrompt: {
    type: String,
    default: 'Unassigned parts ready — run nesting to place them on the sheet.',
  },
  nestingNeedsRerun: {
    type: Boolean,
    default: false,
  },
  /** Incremented by useApp when a file error should expand the requirements bubble. */
  inputRequirementsOpenTick: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'send-text',
  'attach-file',
  'attach-error',
  'confirm-choice',
  'export-associated',
  'text-position-choice',
  'sheet-size-choice',
  'modify-sheet-size',
  'material-choice',
  'modify-material',
  'clear-all',
  'start-nesting',
  'stop-nesting',
  'show-nesting-result',
])

const TEXT_POSITION_OPTIONS = [
  { value: 'inside', label: 'Inside — text inside the part boundary' },
  { value: 'outside', label: 'Outside — text closest to the part boundary' },
]

const fileInputRef = ref(null)
const messageListRef = ref(null)
const draftText = ref('')
const isDragging = ref(false)

const inputDisabled = computed(() => props.busy)
const canSend = computed(() => draftText.value.trim().length > 0 && !inputDisabled.value)
const isEmpty = computed(() => props.messages.length === 0)

function nestingResultSummary(message) {
  if (message.meta?.leftoverComplete) {
    const nested = message.meta?.nestedCount
    const previously = message.meta?.previouslyUnassignedCount
    if (typeof nested === 'number' && typeof previously === 'number') {
      const previouslyLabel = previously === 1 ? 'part' : 'parts'
      return `Nesting complete — ${nested} nested + ${previously} previously unassigned ${previouslyLabel} nested`
    }
    return message.content
  }
  const nested = message.meta?.nestedCount
  const unassigned = message.meta?.unassignedCount
  if (typeof nested === 'number' && typeof unassigned === 'number') {
    if (unassigned === 0) {
      return `Nesting complete — ${nested} part${nested === 1 ? '' : 's'}.`
    }
    return `Nesting complete — ${nested} nested, ${unassigned} not nested.`
  }
  return message.content
}

const showNestCta = computed(
  () =>
    props.canStartNesting
    && props.nestRevealPaused !== 'initial'
    && !props.activeSheetSizeSelectId
    && !props.activeMaterialSelectId,
)

const showLeftoverNestCta = computed(
  () =>
    props.canStartLeftoverNesting
    && props.nestRevealPaused !== 'leftover'
    && !props.activeSheetSizeSelectId
    && !props.activeMaterialSelectId,
)

/**
 * Group contiguous nesting-process messages into labeled panels.
 * @returns {Array<{
 *   key: string,
 *   type: 'process' | 'standalone' | 'nest-cta',
 *   processKind?: string,
 *   processId?: string,
 *   superseded?: boolean,
 *   label?: string,
 *   messages: object[],
 *   showNestCta: boolean,
 * }>}
 */
const chatBlocks = computed(() => {
  const blocks = []
  let current = null

  for (const message of props.messages) {
    const processId = message.meta?.processId
    const processKind = message.meta?.processKind
    if (processId && processKind) {
      // Initial nesting stays open and unscratched; only unused sheet-size
      // confirms (message-level superseded) get strikethrough.
      const messageSupersedesPanel =
        processKind !== 'initial' && Boolean(message.meta?.superseded)
      if (current?.type === 'process' && current.processId === processId) {
        current.messages.push(message)
        if (messageSupersedesPanel) current.superseded = true
      } else {
        current = {
          key: `process-${processId}`,
          type: 'process',
          processId,
          processKind,
          superseded: messageSupersedesPanel,
          label: processPanelLabel(processKind),
          messages: [message],
          showNestCta: false,
        }
        blocks.push(current)
      }
    } else {
      current = null
      blocks.push({
        key: `msg-${message.id}`,
        type: 'standalone',
        messages: [message],
        showNestCta: false,
      })
    }
  }

  if (showNestCta.value) {
    const initial = [...blocks]
      .reverse()
      .find((b) => b.type === 'process' && b.processKind === 'initial' && !b.superseded)
    if (initial) {
      initial.showNestCta = true
    } else {
      blocks.push({
        key: 'nest-cta',
        type: 'nest-cta',
        messages: [],
        showNestCta: true,
        processKind: 'initial',
      })
    }
  }

  if (showLeftoverNestCta.value) {
    const leftover = [...blocks]
      .reverse()
      .find((b) => b.type === 'process' && b.processKind === 'leftover' && !b.superseded)
    if (leftover) {
      leftover.showNestCta = true
    } else {
      blocks.push({
        key: 'leftover-nest-cta',
        type: 'nest-cta',
        messages: [],
        showNestCta: true,
        processKind: 'leftover',
      })
    }
  }

  return blocks
})

/**
 * @param {string} processKind
 */
function processPanelLabel(processKind) {
  if (processKind === 'leftover') return 'Unassigned parts'
  if (processKind === 'fullset') return 'Full set'
  return 'Initial nesting'
}

/** Scroll the message list to the latest bubble */
async function scrollToBottom() {
  await nextTick()
  const el = messageListRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

const textPositionSelections = ref({})
const sheetSizeDrafts = ref({})
const materialDrafts = ref({})
/** Expanded superseded process panels (collapsed by default). */
const expandedSupersededProcessIds = ref(/** @type {Record<string, boolean>} */ ({}))

function isProcessPanelCollapsed(block) {
  if (!block?.superseded || !block.processId) return false
  return !expandedSupersededProcessIds.value[block.processId]
}

function toggleSupersededProcessPanel(block) {
  if (!block?.superseded || !block.processId) return
  const id = block.processId
  expandedSupersededProcessIds.value = {
    ...expandedSupersededProcessIds.value,
    [id]: !expandedSupersededProcessIds.value[id],
  }
}

watch(
  () => {
    const thinking = [...props.messages].reverse().find((m) => m.kind === 'thinking')
    return [
      props.messages.length,
      showNestCta.value,
      showLeftoverNestCta.value,
      thinking?.content ?? '',
      props.busy,
    ]
  },
  () => {
    scrollToBottom()
  },
)

watch(
  () => props.messages,
  (msgs) => {
    const next = { ...textPositionSelections.value }
    for (const message of msgs) {
      if (message.kind !== 'text-position-select') continue
      if (next[message.id] == null && message.meta?.selectedPosition) {
        next[message.id] = message.meta.selectedPosition
      }
    }
    textPositionSelections.value = next
  },
  { deep: true },
)

watch(
  () => props.activeSheetSizeSelectId,
  (id) => {
    if (!id) return
    const message = props.messages.find((m) => m.id === id)
    if (!message || message.kind !== 'sheet-size-select') return
    const { sheetX, sheetY, sheetThickness } = message.meta ?? {}
    if (sheetX == null && sheetY == null && sheetThickness == null) return
    sheetSizeDrafts.value = {
      ...sheetSizeDrafts.value,
      [id]: {
        sheetX: sheetX != null ? String(sheetX) : '',
        sheetY: sheetY != null ? String(sheetY) : '',
        sheetThickness: sheetThickness != null ? String(sheetThickness) : '',
      },
    }
  },
)

watch(
  () => props.activeMaterialSelectId,
  (id) => {
    if (!id) return
    const message = props.messages.find((m) => m.id === id)
    if (!message || message.kind !== 'material-select') return
    const materialId = message.meta?.materialId
    if (materialId == null && materialDrafts.value[id] != null) return
    materialDrafts.value = {
      ...materialDrafts.value,
      [id]: materialId != null ? String(materialId) : (materialDrafts.value[id] ?? ''),
    }
  },
)

/** @param {File} file */
function isImportFile(file) {
  const name = file.name.toLowerCase()
  return IMPORT_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** @param {File} file */
function forwardFile(file) {
  if (!isImportFile(file)) {
    emit(
      'attach-error',
      'Unsupported file type. Please upload a .dxf, .3dm, or .dwg file.',
    )
    return
  }
  emit('attach-file', file)
}

function openFilePicker() {
  if (inputDisabled.value) return
  fileInputRef.value?.click()
}

/**
 * @param {Event} event
 */
function onFileInputChange(event) {
  const file = event.target.files?.[0]
  if (file) forwardFile(file)
  event.target.value = ''
}

function onSendText() {
  const text = draftText.value.trim()
  if (!text || inputDisabled.value) return
  emit('send-text', text)
  draftText.value = ''
}

/**
 * @param {KeyboardEvent} event
 */
function onComposerKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  onSendText()
}

/**
 * @param {DragEvent} event
 */
function onDragOver(event) {
  event.preventDefault()
  if (inputDisabled.value) return
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

/**
 * @param {DragEvent} event
 */
function onDrop(event) {
  event.preventDefault()
  isDragging.value = false
  if (inputDisabled.value) return

  const files = event.dataTransfer?.files
  if (!files?.length) return
  if (files.length > 1) {
    emit('attach-error', 'Please drag and drop only one file at a time.')
    return
  }
  forwardFile(files[0])
}

/**
 * @param {ChatMessage} message
 */
function bubbleClass(message) {
  return {
    'bubble-user': message.role === 'user',
    'bubble-assistant': message.role === 'assistant',
    'bubble-error': message.kind === 'error',
    'bubble-warning': message.kind === 'warning',
    'bubble-result': message.kind === 'result' || message.kind === 'nesting-result',
    'bubble-thinking': message.kind === 'thinking',
    'bubble-thinking--collapsed': message.kind === 'thinking' && Boolean(message.meta?.collapsed),
    'bubble-thinking--live': message.kind === 'thinking' && !message.meta?.collapsed,
    'bubble-confirm': message.kind === 'confirm',
    'bubble-text-position-select': message.kind === 'text-position-select',
    'bubble-sheet-size-select': message.kind === 'sheet-size-select',
    'bubble-sheet-size-select--leftover':
      message.kind === 'sheet-size-select' && Boolean(message.meta?.leftover),
    'bubble-sheet-size-confirm': Boolean(message.meta?.sheetSizeConfirm),
    'bubble-material-select': message.kind === 'material-select',
    'bubble-material-select--leftover':
      message.kind === 'material-select' && Boolean(message.meta?.leftover),
    'bubble-material-confirm': Boolean(message.meta?.materialConfirm),
    'bubble-superseded': Boolean(message.meta?.superseded),
  }
}

function toggleThinkingExpanded(message) {
  if (!message?.meta || message.meta.interrupted) return
  message.meta.expanded = !message.meta.expanded
}

function isActiveTextPositionSelect(message) {
  return message.kind === 'text-position-select' && message.id === props.activeTextPositionSelectId
}

function selectedTextPositionFor(message) {
  return textPositionSelections.value[message.id] ?? message.meta?.selectedPosition ?? 'inside'
}

function onTextPositionSelectChange(message, event) {
  const value = event.target.value
  textPositionSelections.value = { ...textPositionSelections.value, [message.id]: value }
}

function onTextPositionContinue(message) {
  const position = selectedTextPositionFor(message)
  if (!position) return
  emit('text-position-choice', position)
}

/** @param {string} choice */
function onConfirmChoice(message, choice) {
  emit('confirm-choice', { choice, messageId: message.id })
}

function isActiveSheetSizeSelect(message) {
  return message.kind === 'sheet-size-select' && message.id === props.activeSheetSizeSelectId
}

function sheetSizeDraftFor(message) {
  return sheetSizeDrafts.value[message.id] ?? { sheetX: '', sheetY: '', sheetThickness: '' }
}

function updateSheetSizeDraft(message, field, value) {
  const current = sheetSizeDraftFor(message)
  sheetSizeDrafts.value = { ...sheetSizeDrafts.value, [message.id]: { ...current, [field]: value } }
}

function parseSheetSize(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function sheetFormatOptionsFor(message) {
  return (Array.isArray(message.meta?.allowedSizesMm) ? message.meta.allowedSizesMm : [])
    .map((entry) => {
      const x = Math.round(Number(entry?.x))
      const y = Math.round(Number(entry?.y))
      if (![x, y].every((n) => Number.isFinite(n) && n > 0)) return null
      return { x, y }
    })
    .filter(Boolean)
}

function sheetFormatKey(x, y) {
  return `${x}x${y}`
}

function sheetFormatDraftValue(message) {
  const draft = sheetSizeDraftFor(message)
  const x = parseSheetSize(draft.sheetX)
  const y = parseSheetSize(draft.sheetY)
  if (x == null || y == null) return ''
  return sheetFormatKey(x, y)
}

function updateSheetFormatDraft(message, formatKey) {
  const format = sheetFormatOptionsFor(message).find(
    (f) => sheetFormatKey(f.x, f.y) === formatKey,
  )
  if (!format) return
  const current = sheetSizeDraftFor(message)
  sheetSizeDrafts.value = {
    ...sheetSizeDrafts.value,
    [message.id]: {
      ...current,
      sheetX: String(format.x),
      sheetY: String(format.y),
    },
  }
}

function sheetThicknessOptionsFor(message) {
  return (Array.isArray(message.meta?.allowedThicknessesMm) ? message.meta.allowedThicknessesMm : [])
    .map((t) => Math.round(Number(t)))
    .filter((t) => Number.isFinite(t) && t > 0)
}

function canConfirmSheetSize(message) {
  const draft = sheetSizeDraftFor(message)
  const sheetX = parseSheetSize(draft.sheetX)
  const sheetY = parseSheetSize(draft.sheetY)
  const thickness = parseSheetSize(draft.sheetThickness)
  const formats = sheetFormatOptionsFor(message)
  const thicknessOptions = sheetThicknessOptionsFor(message)
  const formatAllowed = formats.some((f) => f.x === sheetX && f.y === sheetY)
  return (
    sheetX != null
    && sheetY != null
    && thickness != null
    && formatAllowed
    && (thicknessOptions.length === 0 || thicknessOptions.includes(thickness))
  )
}

function onSheetSizeConfirm(message) {
  const draft = sheetSizeDraftFor(message)
  const sheetX = parseSheetSize(draft.sheetX)
  const sheetY = parseSheetSize(draft.sheetY)
  const sheetThickness = parseSheetSize(draft.sheetThickness)
  if (sheetX == null || sheetY == null || sheetThickness == null) return
  if (!canConfirmSheetSize(message)) return
  emit('sheet-size-choice', { sheetX, sheetY, sheetThickness })
}

function onModifySheetSize(message) {
  const promptMessageId = message.meta?.promptMessageId
  if (!promptMessageId) return
  emit('modify-sheet-size', { promptMessageId })
}

function isActiveMaterialSelect(message) {
  return message.kind === 'material-select' && message.id === props.activeMaterialSelectId
}

function materialDraftFor(message) {
  return materialDrafts.value[message.id] ?? ''
}

function updateMaterialDraft(message, value) {
  materialDrafts.value = { ...materialDrafts.value, [message.id]: value }
}

function formatThicknessList(thicknesses) {
  return thicknesses.join(', ')
}

function selectedMaterialFor(message) {
  const id = materialDraftFor(message)
  if (!id) return null
  return props.materials.find((m) => m.id === id) ?? null
}

function canConfirmMaterial(message) {
  return selectedMaterialFor(message) != null
}

function onMaterialConfirm(message) {
  const selected = selectedMaterialFor(message)
  if (!selected) return
  emit('material-choice', {
    id: selected.id,
    label: selected.label,
    allowedThicknessesMm: selected.allowedThicknessesMm,
    allowedSizesMm: selected.allowedSizesMm,
  })
}

function onModifyMaterial(message) {
  const promptMessageId = message.meta?.promptMessageId
  if (!promptMessageId) return
  emit('modify-material', { promptMessageId })
}
</script>

<template>
  <section
    class="chat-panel"
    :class="{ 'chat-panel--dragging': isDragging, 'chat-panel--busy': busy }"
    :aria-busy="busy"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div ref="messageListRef" class="message-list" role="log" aria-live="polite">
      <div class="requirements-slot">
        <InputRequirementsBubble :open-tick="inputRequirementsOpenTick" />
      </div>

      <p v-if="isEmpty" class="empty-hint">
        Upload a DXF, DWG, or 3dm file or drag and drop it here to start processing.
      </p>

      <div
        v-for="block in chatBlocks"
        :key="block.key"
        class="chat-block"
        :class="{
          'nest-process-panel': block.type === 'process',
          'nest-process-panel--initial': block.processKind === 'initial',
          'nest-process-panel--leftover': block.processKind === 'leftover',
          'nest-process-panel--fullset': block.processKind === 'fullset',
          'nest-process-panel--superseded': block.superseded,
          'nest-process-panel--collapsed': isProcessPanelCollapsed(block),
        }"
      >
        <button
          v-if="block.type === 'process' && block.superseded"
          type="button"
          class="nest-process-panel__header nest-process-panel__header--toggle"
          :aria-expanded="!isProcessPanelCollapsed(block)"
          @click="toggleSupersededProcessPanel(block)"
        >
          <span class="nest-process-panel__title">{{ block.label }}</span>
          <span class="nest-process-panel__chevron" aria-hidden="true">{{
            isProcessPanelCollapsed(block) ? '▸' : '▾'
          }}</span>
        </button>
        <div v-else-if="block.type === 'process'" class="nest-process-panel__header">
          {{ block.label }}
        </div>

        <template v-if="!isProcessPanelCollapsed(block)">
        <article
          v-for="message in block.messages"
          :key="message.id"
          class="message"
          :class="message.role === 'user' ? 'message-user' : 'message-assistant'"
        >
          <div class="bubble" :class="bubbleClass(message)">
            <p class="bubble-text">
              <template v-if="message.kind === 'thinking'">
                <template v-if="message.meta?.collapsed && message.meta?.interrupted">
                  <span class="thinking-summary thinking-summary--static">
                    <span class="thinking-summary-label">{{
                      message.meta?.summary || 'Stopped'
                    }}</span>
                  </span>
                  <button
                    v-if="nestRevealPaused === message.meta?.processKind"
                    type="button"
                    class="btn-thinking-action"
                    :disabled="busy"
                    @click="emit('start-nesting')"
                  >
                    Resume process
                  </button>
                </template>
                <template v-else>
                  <button
                    v-if="message.meta?.collapsed"
                    type="button"
                    class="thinking-summary"
                    :aria-expanded="Boolean(message.meta?.expanded)"
                    @click="toggleThinkingExpanded(message)"
                  >
                    <span class="thinking-summary-label">{{
                      message.meta?.summary || 'Thought for a moment'
                    }}</span>
                    <span class="thinking-chevron" aria-hidden="true">{{
                      message.meta?.expanded ? '▾' : '▸'
                    }}</span>
                  </button>
                  <template v-if="!message.meta?.collapsed || message.meta?.expanded">
                    <span v-if="!message.meta?.collapsed" class="thinking-label">Thinking</span>
                    <span class="thinking-stream">{{ message.content }}</span><span
                      v-if="!message.meta?.collapsed"
                      class="thinking-cursor"
                      aria-hidden="true"
                    />
                    <button
                      v-if="!message.meta?.collapsed && canStopNesting"
                      type="button"
                      class="btn-thinking-action"
                      @click="emit('stop-nesting')"
                    >
                      Stop Processing
                    </button>
                  </template>
                </template>
              </template>
              <template v-else-if="message.kind === 'result' && message.meta?.legend">
                {{ message.content }}<br><br>
                <template v-for="m in message.meta.legend.materials" :key="m.label">
                  - <span :class="'legend-part-' + m.color">{{ m.label }}</span>:
                  {{ m.count }} {{ m.count === 1 ? 'curve' : 'curves' }}<br>
                </template>
                <template v-if="message.meta.legend.red">
                  - <span class="legend-part-red">Missing/Faulty metadata</span>
                  ({{ message.meta.legend.red }})<br>
                </template>
              </template>
              <template v-else-if="message.meta?.greenHint">
                Use Output view with <strong>Correct parts</strong> / <strong>Incorrect parts</strong> to see metadata status
                (<span class="legend-part-green">green</span> = complete,
                <span class="legend-part-red">red</span> = missing).
              </template>
              <template v-else-if="message.meta?.missingSerialCount != null">
                <span class="legend-part-red">
                  {{ message.meta.missingSerialCount }}
                  {{ message.meta.missingSerialCount === 1 ? 'element is' : 'elements are' }}
                </span>
                missing name (Name).
              </template>
              <template v-else-if="message.meta?.missingMaterialCount != null">
                <span class="legend-part-red">
                  {{ message.meta.missingMaterialCount }}
                  {{ message.meta.missingMaterialCount === 1 ? 'element is' : 'elements are' }}
                </span>
                missing material (Material).
              </template>
              <template v-else-if="message.meta?.missingAnzCount != null">
                <span class="legend-part-red">
                  {{ message.meta.missingAnzCount }}
                  {{ message.meta.missingAnzCount === 1 ? 'element is' : 'elements are' }}
                </span>
                missing quantity (Amount).
              </template>
              <template v-else-if="message.meta?.inspectUnsolvedCount != null">
                Assigned metadata to {{ message.meta.inspectSolvedCount }}
                {{ message.meta.inspectSolvedCount === 1 ? 'part' : 'parts' }}.
                <template v-if="message.meta.inspectUnsolvedCount > 0">
                  <span class="legend-part-red">
                    {{ message.meta.inspectUnsolvedCount }}
                    {{ message.meta.inspectUnsolvedCount === 1 ? 'part still has' : 'parts still have' }}
                  </span>
                  missing metadata.
                </template>
              </template>
              <template v-else-if="message.kind === 'nesting-result'">
                <span class="nesting-result-summary">{{ nestingResultSummary(message) }}</span>
                <template v-if="!message.meta?.leftoverComplete && message.meta?.unassignedCount > 0">
                  <div class="nesting-unassigned-details">
                    <span v-if="message.meta.unassignedIdsText" class="nesting-unassigned-ids">
                      {{ message.meta.unassignedIdsText }}
                    </span>
                    <template v-if="message.meta.unassignedReasons?.length">
                      <span
                        v-for="(reason, index) in message.meta.unassignedReasons"
                        :key="`${reason}-${index}`"
                        class="nesting-unassigned-reason"
                      >
                        {{ reason }}
                      </span>
                    </template>
                    <span class="nesting-unassigned-hint">
                      Unassigned parts will now show <span class="legend-part-red">red</span> in app viewer.
                    </span>
                  </div>
                </template>
              </template>
              <template v-else-if="message.kind === 'text-position-select' && !isActiveTextPositionSelect(message)">
                {{ message.content }}
                <template v-if="selectedTextPositionFor(message)">
                  <br><span class="text-position-choice-value">{{ selectedTextPositionFor(message) }}</span>
                </template>
              </template>
              <template v-else-if="message.kind === 'text-position-select' && isActiveTextPositionSelect(message)">
                {{ message.content }}
              </template>
              <template v-else-if="message.meta?.sheetSizeConfirm">
                {{ message.content }}
              </template>
              <template v-else-if="message.meta?.materialConfirm">
                {{ message.content }}
              </template>
              <template v-else-if="message.kind === 'sheet-size-select'">
                {{ message.content }}
              </template>
              <template v-else-if="message.kind === 'material-select'">
                {{ message.content }}
              </template>
              <template v-else>{{ message.content }}</template>
            </p>
            <button
              v-if="
                message.meta?.sheetSizeConfirm
                  && message.id === activeSheetSizeConfirmId
                  && !message.meta?.superseded
              "
              type="button"
              class="btn-sheet-size-modify"
              @click="onModifySheetSize(message)"
            >
              Modify
            </button>
            <button
              v-if="message.meta?.materialConfirm && message.id === activeMaterialConfirmId"
              type="button"
              class="btn-sheet-size-modify"
              @click="onModifyMaterial(message)"
            >
              Modify
            </button>
            <div
              v-if="message.kind === 'text-position-select' && isActiveTextPositionSelect(message)"
              class="text-position-select-actions"
            >
              <select
                class="text-position-select"
                :value="selectedTextPositionFor(message)"
                @change="onTextPositionSelectChange(message, $event)"
              >
                <option v-for="opt in TEXT_POSITION_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <button type="button" @click="onTextPositionContinue(message)">
                Continue
              </button>
            </div>
            <div
              v-if="message.kind === 'sheet-size-select' && isActiveSheetSizeSelect(message)"
              class="sheet-size-select-actions"
            >
              <div class="sheet-size-row">
                <select
                  class="sheet-size-input sheet-thickness-select"
                  :value="sheetFormatDraftValue(message)"
                  aria-label="Sheet format in millimeters"
                  @change="updateSheetFormatDraft(message, $event.target.value)"
                >
                  <option
                    v-for="format in sheetFormatOptionsFor(message)"
                    :key="sheetFormatKey(format.x, format.y)"
                    :value="sheetFormatKey(format.x, format.y)"
                  >
                    {{ format.x }} × {{ format.y }} mm
                  </option>
                </select>
                <span class="sheet-size-label">(format)</span>
              </div>
              <div class="sheet-size-row">
                <select
                  class="sheet-size-input sheet-thickness-select"
                  :value="sheetSizeDraftFor(message).sheetThickness"
                  aria-label="Sheet thickness in millimeters"
                  @change="updateSheetSizeDraft(message, 'sheetThickness', $event.target.value)"
                >
                  <option
                    v-for="thickness in sheetThicknessOptionsFor(message)"
                    :key="thickness"
                    :value="String(thickness)"
                  >
                    {{ thickness }} mm
                  </option>
                </select>
                <span class="sheet-size-label">(thickness)</span>
              </div>
              <button
                type="button"
                :disabled="!canConfirmSheetSize(message)"
                @click="onSheetSizeConfirm(message)"
              >
                Confirm
              </button>
            </div>
            <div
              v-if="message.kind === 'material-select' && isActiveMaterialSelect(message)"
              class="sheet-size-select-actions"
            >
              <select
                class="material-select"
                :value="materialDraftFor(message)"
                aria-label="Material"
                @change="updateMaterialDraft(message, $event.target.value)"
              >
                <option value="" disabled>Select material…</option>
                <option
                  v-for="mat in materials"
                  :key="mat.id"
                  :value="mat.id"
                >
                  {{ mat.label }} ({{ formatThicknessList(mat.allowedThicknessesMm) }} mm)
                </option>
              </select>
              <button
                type="button"
                :disabled="!canConfirmMaterial(message)"
                @click="onMaterialConfirm(message)"
              >
                Confirm
              </button>
            </div>
            <div
              v-if="message.meta?.showExportAssociated && message.id === activeExportAssociatedMessageId"
              class="confirm-actions"
            >
              <button
                type="button"
                :disabled="busy"
                @click="emit('export-associated')"
              >
                Export associated parts
              </button>
            </div>
            <div
              v-if="message.kind === 'nesting-result'"
              class="nesting-result-actions"
            >
              <button type="button" class="btn-show-nesting-result" @click="emit('show-nesting-result')">
                {{ message.meta?.leftoverComplete ? 'Show full nesting result' : 'Show nesting result' }}
              </button>
            </div>
            <div
              v-if="message.kind === 'confirm' && message.meta?.choices && message.id === activeConfirmId"
              class="confirm-actions"
            >
              <button
                v-for="choice in message.meta.choices"
                :key="choice"
                type="button"
                @click="onConfirmChoice(message, choice)"
              >
                {{ choice }}
              </button>
            </div>
          </div>
        </article>

        <article v-if="block.showNestCta" class="message message-assistant">
          <div
            class="bubble bubble-nesting"
            :class="{ 'bubble-nesting--modified': nestingNeedsRerun && block.processKind !== 'leftover' }"
          >
            <p class="bubble-text">
              {{
                block.processKind === 'leftover'
                  ? leftoverNestingButtonPrompt
                  : nestingButtonPrompt
              }}
            </p>
            <button
              type="button"
              class="btn-nesting"
              :class="{ 'btn-nesting--modified': nestingNeedsRerun && block.processKind !== 'leftover' }"
              :disabled="busy"
              @click="emit('start-nesting')"
            >
              Nest
            </button>
          </div>
        </article>
        </template>
      </div>

      <p
        v-if="busy && !messages.some((m) => m.kind === 'thinking' && !m.meta?.collapsed)"
        class="typing-indicator"
      >{{ busyMessage || 'Working…' }}</p>
    </div>

    <div v-if="isDragging" class="drop-overlay" aria-hidden="true">
      Drop file
    </div>

    <form class="composer" @submit.prevent="onSendText">
      <input
        ref="fileInputRef"
        type="file"
        class="file-input"
        accept=".dxf,.3dm,.dwg"
        tabindex="-1"
        @change="onFileInputChange"
      />

      <textarea
        v-model="draftText"
        class="composer-input"
        rows="2"
        placeholder="…"
        aria-label="Chat message"
        @keydown="onComposerKeydown"
      />

      <div class="composer-actions">
        <button type="button" class="btn-clear" :disabled="!hasBoxes || inputDisabled" @click="emit('clear-all')">
          Clear
        </button>
        <button
          type="button"
          class="btn-attach"
          title="DXF file"
          :disabled="inputDisabled"
          @click="openFilePicker"
        >
          Attach file
        </button>
        <button type="submit" class="btn-send" :disabled="!canSend">Send</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.chat-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 12rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  overflow: hidden;
}

.chat-panel--dragging {
  border-color: var(--color-accent);
  background: var(--color-accent-bg);
}

.chat-panel--busy .composer {
  opacity: 0.85;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.chat-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-self: stretch;
  max-width: 100%;
}

.nest-process-panel {
  padding: 0.45rem 0.5rem 0.55rem;
  border-radius: 8px;
  background: var(--color-result-bg);
  border: 1px solid var(--color-border);
  gap: 0.4rem;
}

.nest-process-panel--initial {
  border-left: 3px solid var(--color-accent);
}

.nest-process-panel--leftover {
  border-left: 3px solid var(--color-warning-emphasis);
  background: #faf6eb;
}

.nest-process-panel--fullset {
  border-left: 3px solid var(--color-text-summary);
  background: var(--color-surface-hover);
}

.nest-process-panel__header {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 0.1rem 0.15rem 0.25rem;
}

.nest-process-panel__header--toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 0.1rem 0.15rem 0.25rem;
}

.nest-process-panel__header--toggle:hover {
  color: var(--color-text-summary);
}

.nest-process-panel__title {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.nest-process-panel__chevron {
  font-size: 0.65rem;
  opacity: 0.7;
  text-decoration: none;
}

.nest-process-panel--superseded {
  opacity: 0.72;
  background: var(--color-surface-hover);
}

.nest-process-panel--collapsed {
  padding-bottom: 0.35rem;
}

.nest-process-panel .message {
  max-width: 100%;
}

.requirements-slot {
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
}

.empty-hint {
  margin: auto 0;
  text-align: center;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--color-text-muted);
}

.message {
  display: flex;
  max-width: 100%;
}

.message-user {
  align-self: flex-end;
}

.message-assistant {
  align-self: flex-start;
}

.bubble {
  padding: 0.7rem 0.95rem;
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
}

.bubble-user {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
}

.bubble-assistant {
  background: var(--color-surface-hover);
  color: var(--color-text-summary);
}

.bubble-result {
  background: #ececec;
  color: #7a7a7a;
}

.bubble-thinking {
  background: transparent;
  color: var(--color-text-muted);
  padding: 0.25rem 0.15rem;
  border: none;
  font-style: italic;
}

.bubble-thinking--live {
  padding: 0.7rem 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.bubble-thinking--collapsed {
  font-style: normal;
  padding: 0.2rem 0;
  background: transparent;
}

.thinking-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-hover);
  color: #9a9a9a;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 400;
  cursor: pointer;
}

.thinking-summary--static {
  cursor: default;
}

.thinking-summary:hover:not(.thinking-summary--static) {
  background: #ebebeb;
  color: #7a7a7a;
}

.thinking-summary:hover:not(.thinking-summary--static) .thinking-summary-label {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.thinking-summary-label {
  font-weight: 400;
}

.thinking-chevron {
  font-size: 0.65rem;
  opacity: 0.65;
}

.thinking-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.7rem;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  opacity: 0.85;
}

.thinking-stream {
  display: block;
  margin-top: 0.35rem;
  white-space: pre-line;
  font-style: italic;
  font-size: 0.75rem;
  line-height: 1.4;
  opacity: 0.9;
}

.bubble-thinking--collapsed .thinking-stream {
  margin-top: 0.45rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--color-border);
}

.thinking-cursor {
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-left: 0.1em;
  vertical-align: text-bottom;
  background: currentColor;
  opacity: 0.55;
  animation: thinking-blink 1s steps(1) infinite;
}

@keyframes thinking-blink {
  50% {
    opacity: 0;
  }
}

.btn-thinking-action {
  display: inline-block;
  margin-top: 0.35rem;
  margin-left: 0.15rem;
  padding: 0.15rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 500;
  font-style: normal;
  letter-spacing: 0.01em;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted);
  vertical-align: middle;
}

.btn-thinking-action:hover:not(:disabled) {
  background: var(--color-surface-hover);
  border-color: var(--color-neutral-edited-accent);
  color: var(--color-text-summary);
}

.btn-thinking-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bubble-error {
  background: var(--color-error-bg);
  color: var(--color-error-emphasis);
  border: 1px solid var(--color-error-emphasis);
}

.bubble-warning {
  background: var(--color-warning-bg);
  color: var(--color-warning-emphasis);
  border: 1px solid var(--color-warning-emphasis);
}

.bubble-confirm {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
}

.bubble-nesting {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
  border: 1px solid var(--color-accent);
}

.bubble-nesting--modified {
  background: var(--color-warning-bg);
  border-color: var(--color-warning-emphasis);
}

.btn-nesting {
  display: block;
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-surface);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  transition: background 0.15s ease;
}

.btn-nesting:hover:not(:disabled) {
  background: #163d6e;
}

.btn-nesting--modified {
  background: var(--color-warning-emphasis);
  border-color: var(--color-warning-emphasis);
}

.btn-nesting--modified:hover:not(:disabled) {
  background: #e68a00;
  border-color: #e68a00;
}

.btn-nesting:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bubble-text-position-select {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
}

.text-position-select-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.text-position-select {
  width: 100%;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.text-position-select-actions button {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.text-position-choice-value {
  font-style: italic;
  color: var(--color-text-muted);
  text-transform: capitalize;
}

.bubble-sheet-size-select {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
}

.bubble-sheet-size-select--leftover {
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-emphasis);
}

.bubble-material-select {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
}

.bubble-material-select--leftover {
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-emphasis);
}

.bubble-sheet-size-confirm {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  background: var(--color-surface-hover);
  color: var(--color-text-summary);
}

.bubble-superseded {
  opacity: 0.72;
}

.bubble-superseded .bubble-text {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.bubble-material-confirm {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  background: var(--color-surface-hover);
  color: var(--color-text-summary);
}

.bubble-sheet-size-confirm .bubble-text,
.bubble-material-confirm .bubble-text {
  flex: 1;
  min-width: 0;
}

.btn-sheet-size-modify {
  flex-shrink: 0;
  padding: 0.2rem 0.45rem;
  font-size: 0.72rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.btn-sheet-size-modify:hover {
  background: var(--color-result-bg);
  border-color: var(--color-neutral-edited-accent);
}

.sheet-size-select-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.sheet-size-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.sheet-size-input {
  flex: 0 0 11.5rem;
  width: 11.5rem;
  box-sizing: border-box;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.sheet-thickness-select {
  appearance: auto;
}

.sheet-size-label {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.sheet-size-select-actions button {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.sheet-size-select-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.material-select {
  width: 100%;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.nesting-result-actions {
  margin-top: 0.45rem;
}

.nesting-result-summary {
  display: block;
  font-weight: 500;
}

.nesting-unassigned-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--color-border);
}

.nesting-unassigned-ids {
  display: block;
  font-size: 0.85em;
  color: var(--color-text-muted);
}

.nesting-unassigned-reason {
  display: block;
  margin-top: 0.15rem;
  padding: 0.3rem 0.4rem;
  font-size: 0.85em;
  color: var(--color-warning-emphasis);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-emphasis);
  border-radius: 4px;
}

.nesting-unassigned-hint {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.85em;
  color: var(--color-text-muted);
  font-style: italic;
}

.btn-show-nesting-result {
  display: block;
  width: 100%;
  padding: 0.45rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-surface);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  transition: background 0.15s ease;
}

.btn-show-nesting-result:hover {
  background: #163d6e;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.55rem;
}

.confirm-actions button {
  padding: 0.4rem 0.7rem;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  text-transform: capitalize;
}

.bubble-text {
  margin: 0;
  white-space: pre-line;
}

.typing-indicator {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(230, 242, 255, 0.92);
  border: 2px dashed var(--color-accent);
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-accent);
  pointer-events: none;
  z-index: 1;
}

.composer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  padding: 0.5rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.file-input {
  display: none;
}

.composer-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  resize: none;
  min-height: 2.5rem;
  max-height: 6rem;
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-size: 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.composer-input:focus {
  outline: 2px solid var(--color-accent-bg-hover);
  border-color: var(--color-accent);
}

.composer-input:disabled {
  background: var(--color-surface-hover);
  cursor: not-allowed;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.composer-actions button {
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.composer-actions .btn-clear:hover:not(:disabled),
.composer-actions .btn-attach:hover:not(:disabled) {
  background: var(--color-result-bg);
  border-color: var(--color-neutral-edited-accent);
}

.composer-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-actions .btn-send {
  border: 1px solid var(--color-neutral-edited-accent);
  background: var(--color-result-bg);
  color: var(--color-result-text);
  font-weight: 600;
}

.composer-actions .btn-send:hover:not(:disabled) {
  background: var(--color-neutral-selected);
  border-color: var(--color-result-text);
}
</style>
