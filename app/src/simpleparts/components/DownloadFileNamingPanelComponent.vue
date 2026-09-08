<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  buildDownloadFilename,
  formatSheetDimensions,
  formatSheetThickness,
  getMissingRequiredDownloadFields,
  hasSheetSizeForDownload,
} from '../features/shared/downloadFilename.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  downloadKind: {
    type: String,
    default: 'nesting',
    validator: (value) => value === 'nesting' || value === 'unassigned',
  },
  sheetX: { type: Number, default: null },
  sheetY: { type: Number, default: null },
  sheetThickness: { type: Number, default: null },
  defaultMaterial: { type: String, default: '' },
})

const emit = defineEmits(['close', 'confirm'])

const UNASSIGNED_DOWNLOAD_MESSAGE =
  'A DXF file with joined 2D curves of the unassigned parts will be downloaded. Please repeat the nesting process with an appropriate sheet size with that file.'

const owner = ref('')
const projectId = ref('')
const element = ref('')
const material = ref('')
const comments = ref('')
const ownerInputRef = ref(null)

const dimensions = computed(() => formatSheetDimensions(props.sheetX, props.sheetY) || '—')
const thicknessDisplay = computed(() => formatSheetThickness(props.sheetThickness) || '—')

const hasSheetSize = computed(() =>
  hasSheetSizeForDownload(props.sheetX, props.sheetY, props.sheetThickness),
)

const staticSuffix = computed(() =>
  props.downloadKind === 'unassigned' ? '-unassigned.dxf' : '-nesting.zip',
)

const fields = computed(() => ({
  owner: owner.value,
  projectId: projectId.value,
  element: element.value,
  material: material.value,
  dimensions: dimensions.value === '—' ? '' : dimensions.value,
  thickness: thicknessDisplay.value === '—' ? '' : thicknessDisplay.value,
  comments: comments.value,
}))

function resetFields() {
  owner.value = ''
  projectId.value = ''
  element.value = ''
  material.value = props.defaultMaterial || ''
  comments.value = ''
}

function onClose() {
  emit('close')
}

function onConfirm() {
  if (!hasSheetSize.value) {
    window.alert('Sheet size is unavailable for this nesting result. Please run nesting again.')
    return
  }

  const missing = getMissingRequiredDownloadFields(fields.value)
  if (missing.length) {
    window.alert(`Please fill in all required fields: ${missing.join(', ')}.`)
    return
  }

  emit('confirm', {
    ...fields.value,
    filename: buildDownloadFilename(fields.value, props.downloadKind),
  })
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    resetFields()
    await nextTick()
    ownerInputRef.value?.focus()
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="download-naming"
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-naming-title"
      @keydown="onKeydown"
    >
      <div class="download-naming__backdrop" @click="onClose" />
      <form class="download-naming__panel" @submit.prevent="onConfirm">
        <header class="download-naming__header">
          <h2 id="download-naming-title" class="download-naming__title">Name download file</h2>
          <button type="button" class="download-naming__close" aria-label="Close" @click="onClose">
            ×
          </button>
        </header>

        <div class="download-naming__body">
          <p v-if="downloadKind === 'unassigned'" class="download-naming__warning">
            {{ UNASSIGNED_DOWNLOAD_MESSAGE }}
          </p>

          <div class="download-naming__composer" role="group" aria-label="Download file name">
            <label class="download-naming__segment">
              <span class="download-naming__label download-naming__label--required">Owner</span>
              <input
                ref="ownerInputRef"
                v-model="owner"
                type="text"
                class="download-naming__input"
                autocomplete="off"
              />
            </label>

            <span class="download-naming__separator" aria-hidden="true">-</span>

            <label class="download-naming__segment">
              <span class="download-naming__label download-naming__label--required">Project Id</span>
              <input
                v-model="projectId"
                type="text"
                class="download-naming__input"
                autocomplete="off"
              />
            </label>

            <span class="download-naming__separator" aria-hidden="true">-</span>

            <label class="download-naming__segment">
              <span class="download-naming__label download-naming__label--required">Element</span>
              <input
                v-model="element"
                type="text"
                class="download-naming__input"
                autocomplete="off"
              />
            </label>

            <span class="download-naming__separator" aria-hidden="true">-</span>

            <label class="download-naming__segment">
              <span class="download-naming__label download-naming__label--required">Material</span>
              <input
                v-model="material"
                type="text"
                class="download-naming__input"
                autocomplete="off"
              />
            </label>

            <span class="download-naming__separator" aria-hidden="true">-</span>

            <div class="download-naming__segment">
              <span class="download-naming__label">Dimensions</span>
              <span class="download-naming__static-value">{{ dimensions }}</span>
            </div>

            <span class="download-naming__separator" aria-hidden="true">-</span>

            <div class="download-naming__segment">
              <span class="download-naming__label">Thickness</span>
              <span class="download-naming__static-value">{{ thicknessDisplay }}</span>
            </div>

            <span class="download-naming__separator" aria-hidden="true">-</span>

            <label class="download-naming__segment">
              <span class="download-naming__label">Comments</span>
              <input
                v-model="comments"
                type="text"
                class="download-naming__input"
                autocomplete="off"
                @keydown.enter.prevent="onConfirm"
              />
            </label>

            <span class="download-naming__static-suffix" aria-hidden="true">{{ staticSuffix }}</span>
          </div>
        </div>

        <footer class="download-naming__footer">
          <button type="button" class="download-naming__btn download-naming__btn--secondary" @click="onClose">
            Cancel
          </button>
          <button type="submit" class="download-naming__btn download-naming__btn--primary">
            Download
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.download-naming {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.download-naming__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.download-naming__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(980px, 96vw);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.download-naming__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.download-naming__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-summary);
}

.download-naming__close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  padding: 0;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
}

.download-naming__close:hover {
  color: var(--color-text-summary);
  background: var(--color-surface-hover);
}

.download-naming__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.download-naming__warning {
  margin: 0;
  padding: 0.5rem 0.65rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-summary);
  background: var(--color-warning-bg);
  border-radius: 4px;
}

.download-naming__composer {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.35rem 0.25rem;
}

.download-naming__segment {
  display: flex;
  flex: 1 1 5.5rem;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 4.75rem;
}

.download-naming__label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.download-naming__label--required::after {
  content: ' *';
  color: #dc2626;
}

.download-naming__input,
.download-naming__static-value {
  width: 100%;
  min-width: 0;
  min-height: 2rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.85rem;
  font-family: inherit;
  border-radius: 4px;
  box-sizing: border-box;
}

.download-naming__input {
  color: var(--color-text-summary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.download-naming__static-value {
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
}

.download-naming__input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-bg);
}

.download-naming__separator,
.download-naming__static-suffix {
  flex-shrink: 0;
  padding-bottom: 0.55rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1;
  color: var(--color-text-muted);
  user-select: none;
}

.download-naming__static-suffix {
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}

.download-naming__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}

.download-naming__btn {
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  transition: background 0.15s ease;
}

.download-naming__btn--secondary {
  color: var(--color-text-summary);
  background: var(--color-surface);
}

.download-naming__btn--secondary:hover {
  background: var(--color-surface-hover);
}

.download-naming__btn--primary {
  color: var(--color-surface);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.download-naming__btn--primary:hover {
  background: #163d6e;
}
</style>
