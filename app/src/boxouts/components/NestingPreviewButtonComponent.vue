<script setup>
const props = defineProps({
  disabled: Boolean,
})

const emit = defineEmits(['toggle'])

function onClick() {
  if (props.disabled) return
  emit('toggle')
}
</script>

<template>
  <button
    type="button"
    class="btn-preview-nesting"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="btn-preview-nesting__line">Preview</span>
    <span class="btn-preview-nesting__line">Nesting</span>
  </button>
</template>

<style scoped>
.btn-preview-nesting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.55rem 0.75rem;
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.2;
  cursor: pointer;
  border: 1px solid var(--color-neutral-edited-accent);
  border-radius: 4px;
  background: var(--color-result-bg);
  color: var(--color-result-text);
  font-weight: 600;
}

.btn-preview-nesting:hover:not(:disabled) {
  background: var(--color-neutral-selected);
  border-color: var(--color-result-text);
}

.btn-preview-nesting:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-preview-nesting__line {
  display: block;
}
</style>
