<script setup>
defineProps({
  labels: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="part-tag-bubbles">
    <span
      v-for="(label, i) in labels"
      :key="i"
      class="part-tag-marker"
      :class="label.mode === 'dot' ? 'part-tag-dot' : 'part-tag-bubble'"
      :style="{
        left: label.left + 'px',
        top: label.top + 'px',
        fontSize: label.fontSize + 'px',
        width: label.mode === 'dot' ? label.dotSize + 'px' : undefined,
        height: label.mode === 'dot' ? label.dotSize + 'px' : undefined,
      }"
    >
      {{ label.mode === 'text' ? label.text : '' }}
    </span>
  </div>
</template>

<style scoped>
.part-tag-bubbles {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.part-tag-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
  color: var(--color-text-summary);
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--color-text-summary);
}

.part-tag-bubble {
  padding: 4px 8px;
  text-align: center;
  line-height: 1.1;
  border-radius: 999px;
  white-space: nowrap;
}

.part-tag-dot {
  border-radius: 50%;
  padding: 0;
}
</style>
