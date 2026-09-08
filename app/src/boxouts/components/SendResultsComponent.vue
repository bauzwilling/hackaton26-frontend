<script setup>
const props = defineProps({
  disabled: Boolean,
})

const emit = defineEmits(['click'])

function onClick() {
  if (props.disabled) return
  emit('click')
}
</script>

<template>
  <button
    type="button"
    class="btn-send-results"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="btn-send-results__line">Send</span>
    <span class="btn-send-results__line">Results</span>
  </button>
</template>

<style scoped>
.btn-send-results {
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

.btn-send-results:hover:not(:disabled) {
  background: var(--color-neutral-selected);
  border-color: var(--color-result-text);
}

.btn-send-results:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-send-results__line {
  display: block;
}
</style>
