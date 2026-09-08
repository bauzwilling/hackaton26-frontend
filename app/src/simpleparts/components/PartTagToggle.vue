<script setup>
const showPartLabels = defineModel('showPartLabels', { type: Boolean, default: false })
</script>

<template>
  <label class="part-tag-toggle">
    <input v-model="showPartLabels" type="checkbox" />
    Show all part names
  </label>
</template>

<style scoped>
.part-tag-toggle {
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
