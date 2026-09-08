<script setup>
import { computed } from 'vue'

const props = defineProps({
  pages: { type: Array, default: () => [] },
  parts: { type: Array, default: () => [] },
})

function pageSrc(page) {
  return `data:${page.mediaType};base64,${page.imageBase64}`
}

const partsByPage = computed(() => {
  const map = new Map()
  for (const part of props.parts) {
    const idx = part.pageIndex ?? 0
    if (!map.has(idx)) map.set(idx, [])
    map.get(idx).push(part)
  }
  return map
})

function partsForPage(pageIndex) {
  return partsByPage.value.get(pageIndex) ?? []
}

function partLabel(part) {
  const nr = part.nr ? String(part.nr) : '?'
  return `${nr} — ${part.width} × ${part.height} mm`
}
</script>

<template>
  <div class="scan-input-view">
    <div v-for="page in pages" :key="page.pageIndex" class="scan-page">
      <img class="scan-page-image" :src="pageSrc(page)" :alt="`Scan page ${page.pageIndex + 1}`" />
      <ul v-if="partsForPage(page.pageIndex).length" class="scan-part-list">
        <li v-for="(part, i) in partsForPage(page.pageIndex)" :key="i">
          {{ partLabel(part) }}
          <span v-if="part.rotation" class="scan-part-rotation">({{ part.rotation }}°)</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.scan-input-view {
  height: 100%;
  overflow: auto;
  padding: 1rem;
  background: var(--color-bg, #f5f5f5);
}

.scan-page {
  margin-bottom: 1.5rem;
}

.scan-page-image {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--color-border, #ccc);
  background: #fff;
}

.scan-part-list {
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  font-size: 0.9rem;
  color: var(--color-text-summary, #333);
}

.scan-part-rotation {
  opacity: 0.7;
}
</style>
