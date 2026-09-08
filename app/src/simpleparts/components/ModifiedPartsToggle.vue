<script setup>
const showModifiedPartsGreen = defineModel('showModifiedPartsGreen', { type: Boolean, default: false })
</script>

<template>
  <label class="modified-parts-toggle">
    <input v-model="showModifiedPartsGreen" type="checkbox" />
    <span class="legend-part-green">Show modified parts in green</span>
  </label>
</template>

<style scoped>
.modified-parts-toggle {
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
