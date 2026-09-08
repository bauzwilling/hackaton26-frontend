<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
})

const showSchemeOutliers = defineModel('showSchemeOutliers', { type: Boolean, default: false })
</script>

<template>
  <label class="scheme-outliers-toggle" :class="{ 'scheme-outliers-toggle--disabled': disabled }">
    <input v-model="showSchemeOutliers" type="checkbox" :disabled="disabled" />
    Show outliers
  </label>
</template>

<style scoped>
.scheme-outliers-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-summary);
  cursor: pointer;
  user-select: none;
}

.scheme-outliers-toggle--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
