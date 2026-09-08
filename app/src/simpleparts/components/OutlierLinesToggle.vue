<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
})

const showOutlierLines = defineModel('showOutlierLines', { type: Boolean, default: false })
</script>

<template>
  <label class="outlier-lines-toggle" :class="{ 'outlier-lines-toggle--disabled': disabled }">
    <input v-model="showOutlierLines" type="checkbox" :disabled="disabled" />
    Show closing lines
  </label>
</template>

<style scoped>
.outlier-lines-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-summary);
  cursor: pointer;
  user-select: none;
}

.outlier-lines-toggle--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
