<script setup>
const clickForProperties = defineModel('clickForProperties', { type: Boolean, default: false })
</script>

<template>
  <label class="part-properties-toggle">
    <input v-model="clickForProperties" type="checkbox" />
    Click for properties / layer
  </label>
</template>

<style scoped>
.part-properties-toggle {
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
