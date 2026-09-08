<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  EXPORTABLE_LAYERS,
  defaultExportLayerNames,
} from '../boundaryDetection.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  layerNames: { type: Object, default: null },
})

const emit = defineEmits(['close', 'confirm'])

const drafts = ref(defaultExportLayerNames())
const firstInputRef = ref(null)

function setFirstInputRef(el) {
  firstInputRef.value = el
}

const duplicateError = computed(() => {
  const seen = new Map()
  for (const canonical of EXPORTABLE_LAYERS) {
    const value = String(drafts.value[canonical] ?? '').trim() || canonical
    const key = value.toLowerCase()
    if (seen.has(key)) return `Duplicate name “${value}”. Each layer must be unique.`
    seen.set(key, canonical)
  }
  return ''
})

const canConfirm = computed(() => !duplicateError.value)

function syncFromProps() {
  const next = defaultExportLayerNames()
  const source = props.layerNames || {}
  for (const canonical of EXPORTABLE_LAYERS) {
    const value = String(source[canonical] ?? '').trim()
    next[canonical] = value || canonical
  }
  drafts.value = next
}

function onClose() {
  emit('close')
}

function onConfirm() {
  if (!canConfirm.value) return
  const confirmed = defaultExportLayerNames()
  for (const canonical of EXPORTABLE_LAYERS) {
    const value = String(drafts.value[canonical] ?? '').trim()
    confirmed[canonical] = value || canonical
  }
  emit('confirm', confirmed)
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
    syncFromProps()
    await nextTick()
    firstInputRef.value?.focus()
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="edit-layers"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-layers-title"
      @keydown="onKeydown"
    >
      <div class="edit-layers__backdrop" @click="onClose" />
      <form class="edit-layers__panel" @submit.prevent="onConfirm">
        <header class="edit-layers__header">
          <h2 id="edit-layers-title" class="edit-layers__title">Edit layer names</h2>
          <button type="button" class="edit-layers__close" aria-label="Close" @click="onClose">
            ×
          </button>
        </header>

        <div class="edit-layers__body">
          <p class="edit-layers__hint">
            These names are applied to DXFs in the downloaded ZIP. The viewer keeps the default names.
          </p>

          <div
            v-for="(canonical, index) in EXPORTABLE_LAYERS"
            :key="canonical"
            class="edit-layers__row"
          >
            <label class="edit-layers__label" :for="`edit-layer-${canonical}`">
              {{ canonical }}
            </label>
            <input
              :id="`edit-layer-${canonical}`"
              :ref="index === 0 ? setFirstInputRef : undefined"
              v-model="drafts[canonical]"
              type="text"
              class="edit-layers__input"
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <p v-if="duplicateError" class="edit-layers__error">{{ duplicateError }}</p>
        </div>

        <footer class="edit-layers__footer">
          <button type="button" class="edit-layers__btn edit-layers__btn--secondary" @click="onClose">
            Cancel
          </button>
          <button
            type="submit"
            class="edit-layers__btn edit-layers__btn--primary"
            :disabled="!canConfirm"
          >
            Apply
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.edit-layers {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.edit-layers__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.edit-layers__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(420px, 96vw);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.edit-layers__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.edit-layers__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-summary);
}

.edit-layers__close {
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

.edit-layers__close:hover {
  color: var(--color-text-summary);
  background: var(--color-surface-hover);
}

.edit-layers__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.edit-layers__hint {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.edit-layers__row {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.65rem;
  align-items: center;
}

.edit-layers__label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.edit-layers__input {
  width: 100%;
  min-width: 0;
  min-height: 2rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--color-text-summary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  box-sizing: border-box;
}

.edit-layers__input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-bg);
}

.edit-layers__error {
  margin: 0;
  font-size: 0.8rem;
  color: #dc2626;
}

.edit-layers__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}

.edit-layers__btn {
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  transition: background 0.15s ease;
}

.edit-layers__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.edit-layers__btn--secondary {
  color: var(--color-text-summary);
  background: var(--color-surface);
}

.edit-layers__btn--secondary:hover {
  background: var(--color-surface-hover);
}

.edit-layers__btn--primary {
  color: var(--color-surface);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.edit-layers__btn--primary:hover:not(:disabled) {
  background: #163d6e;
}
</style>
