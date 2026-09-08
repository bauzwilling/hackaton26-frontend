<script setup>
const showCorrectParts = defineModel('showCorrectParts', { type: Boolean, default: false })
const showIncorrectParts = defineModel('showIncorrectParts', { type: Boolean, default: false })
</script>

<template>
  <label class="output-parts-toggle">
    <input v-model="showCorrectParts" type="checkbox" />
    <span class="legend-part-green">Correct parts (only)</span>
  </label>
  <label class="output-parts-toggle">
    <input v-model="showIncorrectParts" type="checkbox" />
    <span class="legend-part-red">Incorrect parts (only)</span>
  </label>
</template>

<style scoped>
.output-parts-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-summary);
  cursor: pointer;
  user-select: none;
}
</style>
