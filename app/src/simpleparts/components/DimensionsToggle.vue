<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
})

const showDimensions = defineModel('showDimensions', { type: Boolean, default: true })
</script>

<template>
  <label class="dimensions-toggle" :class="{ 'dimensions-toggle--disabled': disabled }">
    <input v-model="showDimensions" type="checkbox" :disabled="disabled" />
    Show dimensions
  </label>
</template>

<style scoped>
.dimensions-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-summary);
  cursor: pointer;
  user-select: none;
}

.dimensions-toggle--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
