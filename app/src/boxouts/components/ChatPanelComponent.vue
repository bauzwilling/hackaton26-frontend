<script setup>
/**
 * Unified chat input: natural-language box specs and CSV/Excel attachments.
 * Display-only message history; parsing and state updates live in App.vue.
 */

import { computed, nextTick, ref, watch } from 'vue'

/** @typedef {'user' | 'assistant'} ChatMessageRole */
/** @typedef {'text' | 'file' | 'result' | 'error' | 'confirm'} ChatMessageKind */

/**
 * @typedef {object} ChatMessage
 * @property {string} id
 * @property {ChatMessageRole} role
 * @property {ChatMessageKind} kind
 * @property {string} content
 * @property {Record<string, unknown>} [meta]
 */

const IMPORT_FILE_EXTENSIONS = ['.csv', '.xlsx', '.jpg', '.jpeg', '.png']

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
  awaitingConfirm: {
    type: Boolean,
    default: false,
  },
  hasBoxes: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['send-text', 'attach-file', 'attach-error', 'confirm-choice', 'clear-all'])

const fileInputRef = ref(null)
const messageListRef = ref(null)
const draftText = ref('')
const isDragging = ref(false)

const inputDisabled = computed(() => props.busy || props.awaitingConfirm)
const canSend = computed(() => draftText.value.trim().length > 0 && !inputDisabled.value)
const isEmpty = computed(() => props.messages.length === 0)

/** Scroll the message list to the latest bubble */
async function scrollToBottom() {
  await nextTick()
  const el = messageListRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

watch(
  () => props.messages.length,
  () => {
    scrollToBottom()
  },
)

/** @param {File} file */
function isImportFile(file) {
  const name = file.name.toLowerCase()
  return IMPORT_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** @param {File} file */
function forwardFile(file) {
  if (!isImportFile(file)) return
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
    'bubble-result': message.kind === 'result',
    'bubble-confirm': message.kind === 'confirm',
  }
}

/** @param {string} choice */
function onConfirmChoice(choice) {
  emit('confirm-choice', choice)
}
</script>

<template>
  <section
    class="chat-panel"
    :class="{ 'chat-panel--dragging': isDragging, 'chat-panel--busy': busy }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div ref="messageListRef" class="message-list" role="log" aria-live="polite">
      <p v-if="isEmpty" class="empty-hint">
        Describe a box as Depth × Height × Width (e.g. 300 × 2100 × 900 mm) or drag/drop a file (CSV, Excel, JPG, PNG).
      </p>

      <article
        v-for="message in messages"
        :key="message.id"
        class="message"
        :class="message.role === 'user' ? 'message-user' : 'message-assistant'"
      >
        <div class="bubble" :class="bubbleClass(message)">
          <p class="bubble-text">{{ message.content }}</p>
          <div v-if="message.kind === 'confirm' && message.meta?.choices" class="confirm-actions">
            <button
              v-for="choice in message.meta.choices"
              :key="choice"
              type="button"
              @click="onConfirmChoice(choice)"
            >
              {{ choice }}
            </button>
          </div>
        </div>
      </article>

      <p v-if="busy" class="typing-indicator">Parsing…</p>
    </div>

    <div v-if="isDragging" class="drop-overlay" aria-hidden="true">
      Drop CSV, Excel, JPG, or PNG
    </div>

    <form class="composer" @submit.prevent="onSendText">
      <input
        ref="fileInputRef"
        type="file"
        class="file-input"
        accept=".csv,.xlsx,.jpg,.jpeg,.png,text/csv,image/jpeg,image/png"
        tabindex="-1"
        @change="onFileInputChange"
      />

      <textarea
        v-model="draftText"
        class="composer-input"
        rows="2"
        placeholder="e.g. 300 × 2100 × 900 (D × H × W)…"
        :disabled="inputDisabled"
        aria-label="Box description"
        @keydown="onComposerKeydown"
      />

      <div class="composer-actions">
        <button type="button" class="btn-clear" :disabled="!hasBoxes || inputDisabled" @click="emit('clear-all')">
          Clear all
        </button>
        <button
          type="button"
          class="btn-attach"
          title="CSV, Excel, or image (JPG, PNG)"
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
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty-hint {
  margin: auto 0;
  text-align: center;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.message {
  display: flex;
  max-width: 92%;
}

.message-user {
  align-self: flex-end;
}

.message-assistant {
  align-self: flex-start;
}

.bubble {
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.35;
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

.bubble-error {
  background: var(--color-warning-bg);
  color: var(--color-warning-emphasis);
}

.bubble-confirm {
  background: var(--color-accent-bg);
  color: var(--color-text-summary);
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.confirm-actions button {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
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
  padding: 0.5rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.file-input {
  display: none;
}

.composer-input {
  width: 100%;
  resize: vertical;
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
