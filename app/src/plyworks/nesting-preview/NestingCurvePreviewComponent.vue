<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import JSZip from 'jszip'
import { parseDxf } from 'dxf-vuer'
import NestingDxfViewer from './NestingDxfViewer.vue'

const props = defineProps({
  jobId: { type: String, default: null },
  open: { type: Boolean, default: false },
  solving: { type: Boolean, default: false },
  zipUrl: { type: Function, required: true },
  layout: { type: String, default: 'panel' },
})

const material = ref('kiefer')
const sheetIndex = ref(0)
const hiddenLayers = ref([])
const loading = ref(false)
const error = ref(null)
const sheetsByMaterial = ref({ kiefer: [], film: [] })
const viewerMounted = ref(false)
let fetchToken = 0

const MATERIAL_PREFIX = {
  kiefer: /^Kiefer_(\d+)\.dxf$/i,
  film: /^Film_(\d+)\.dxf$/i,
}

const sheets = computed(() => sheetsByMaterial.value[material.value] ?? [])
const currentSheet = computed(() => sheets.value[sheetIndex.value] ?? null)
const parsedDxf = computed(() => {
  const text = currentSheet.value?.dxfText
  if (!text) return null
  try {
    return parseDxf(text)
  } catch {
    return null
  }
})
const canCycle = computed(() => sheets.value.length > 1)
const sheetLabel = computed(() => {
  const total = sheets.value.length
  if (!total) return 'No sheets'
  return `Sheet ${sheetIndex.value + 1}/${total}`
})

function sheetIndexFromName(name) {
  const base = String(name || '').split('/').pop() || ''
  const match = base.match(/_(\d+)\.dxf$/i)
  if (match) return Math.max(0, Number(match[1]) - 1)
  return null
}

function materialForEntry(name) {
  const base = String(name || '').split('/').pop() || ''
  if (MATERIAL_PREFIX.kiefer.test(base)) return 'kiefer'
  if (MATERIAL_PREFIX.film.test(base)) return 'film'
  return null
}

async function loadJobSheets(jobId) {
  const token = ++fetchToken
  sheetsByMaterial.value = { kiefer: [], film: [] }
  sheetIndex.value = 0
  hiddenLayers.value = []
  error.value = null
  if (!jobId) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await fetch(props.zipUrl(jobId))
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Failed to load nesting sheets')
    }
    const zip = await JSZip.loadAsync(await res.arrayBuffer())
    const grouped = { kiefer: [], film: [] }
    const pending = []
    zip.forEach((relativePath, file) => {
      if (file.dir || !/\.dxf$/i.test(relativePath)) return
      const kind = materialForEntry(relativePath)
      const index = sheetIndexFromName(relativePath)
      if (!kind || index == null) return
      pending.push(
        file.async('string').then((dxfText) => {
          grouped[kind].push({ index, dxfText })
        }),
      )
    })
    await Promise.all(pending)
    grouped.kiefer.sort((a, b) => a.index - b.index)
    grouped.film.sort((a, b) => a.index - b.index)
    if (token !== fetchToken) return
    sheetsByMaterial.value = grouped
    if (!grouped[material.value].length && grouped.film.length) {
      material.value = 'film'
    } else if (!grouped[material.value].length && grouped.kiefer.length) {
      material.value = 'kiefer'
    }
    if (!grouped.kiefer.length && !grouped.film.length) {
      throw new Error('No sheet DXFs found in nesting result')
    }
  } catch (err) {
    if (token !== fetchToken) return
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === fetchToken) loading.value = false
  }
}

function selectMaterial(next) {
  if (material.value === next) return
  material.value = next
  sheetIndex.value = 0
  hiddenLayers.value = []
}

function goPrevSheet() {
  if (!canCycle.value) return
  const count = sheets.value.length
  sheetIndex.value = (sheetIndex.value - 1 + count) % count
  hiddenLayers.value = []
}

function goNextSheet() {
  if (!canCycle.value) return
  sheetIndex.value = (sheetIndex.value + 1) % sheets.value.length
  hiddenLayers.value = []
}

watch(
  () => ({ jobId: props.jobId, solving: props.solving }),
  (curr, prev) => {
    if (!curr.jobId) {
      void loadJobSheets(null)
      return
    }
    const jobChanged = !prev || curr.jobId !== prev.jobId
    const nestFinished = Boolean(prev?.solving) && !curr.solving
    if (jobChanged || nestFinished) {
      void loadJobSheets(curr.jobId)
    }
  },
  { immediate: true },
)

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      viewerMounted.value = false
      return
    }
    await nextTick()
    viewerMounted.value = true
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="nesting-curve-preview"
    :class="{ 'nesting-curve-preview--fill': layout === 'fill' }"
  >
    <div class="material-toggle-group" role="group" aria-label="Nesting material">
      <button
        type="button"
        class="material-toggle material-toggle--kiefer"
        :class="{ 'material-toggle--active': material === 'kiefer' }"
        :aria-pressed="material === 'kiefer'"
        @click="selectMaterial('kiefer')"
      >
        Kiefer
      </button>
      <button
        type="button"
        class="material-toggle material-toggle--film"
        :class="{ 'material-toggle--active': material === 'film' }"
        :aria-pressed="material === 'film'"
        @click="selectMaterial('film')"
      >
        Film
      </button>
    </div>
    <div class="sheet-controls">
      <button type="button" :disabled="!canCycle" @click="goPrevSheet">Prev</button>
      <span>{{ sheetLabel }}</span>
      <button type="button" :disabled="!canCycle" @click="goNextSheet">Next</button>
    </div>
    <p v-if="loading" class="nesting-status">Loading sheets…</p>
    <p v-else-if="error" class="nesting-status nesting-status--error">{{ error }}</p>
    <p v-else-if="!parsedDxf" class="nesting-status">No sheets for this material.</p>
    <NestingDxfViewer
      v-else-if="viewerMounted"
      :dxf="parsedDxf"
      :hidden-layers="hiddenLayers"
      @update:hidden-layers="hiddenLayers = $event"
    />
  </section>
</template>

<style scoped>
.nesting-curve-preview {
  flex: 0 0 50%;
  min-height: 0;
  position: relative;
  flex-direction: column;
  background: #fff;
  border-top: 1px solid #ddd;
  overflow: hidden;
}

.nesting-curve-preview--fill {
  flex: 1 1 auto;
  display: flex;
  width: 100%;
  height: 100%;
  border-top: none;
}

.material-toggle-group {
  position: absolute;
  top: 0.5rem;
  right: 0.65rem;
  z-index: 3;
  display: flex;
}

.material-toggle {
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--color-neutral-edited-accent);
  background: var(--color-neutral-bg);
  color: var(--color-result-text);
}

.material-toggle--kiefer {
  border-radius: 4px 0 0 4px;
  border-right: none;
}

.material-toggle--film {
  border-radius: 0 4px 4px 0;
}

.material-toggle:not(.material-toggle--active):hover {
  background: var(--color-neutral-bg-hover);
}

.material-toggle--active {
  background: var(--color-neutral-selected);
  border-color: var(--color-neutral-edited-accent);
  color: var(--color-result-text);
}

.sheet-controls {
  position: absolute;
  top: 0.5rem;
  left: 0.65rem;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-result-text);
}

.sheet-controls button {
  padding: 0.25rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--color-neutral-edited-accent);
  border-radius: 4px;
  background: var(--color-neutral-bg);
  color: var(--color-result-text);
}

.sheet-controls button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.nesting-status {
  margin: auto;
  padding: 1rem;
  font-size: 0.85rem;
  color: var(--color-result-text);
}

.nesting-status--error {
  color: #b45309;
}
</style>
