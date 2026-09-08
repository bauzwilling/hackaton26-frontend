<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import JSZip from 'jszip'
import DownloadFileNamingPanel from './DownloadFileNamingPanelComponent.vue'
import EditLayerNamesPanel from './EditLayerNamesPanelComponent.vue'
import DXFViewer from './DXFViewerComponent.vue'
import { formatUnassignedIdsDisplay } from '../features/shared/unassignedDisplay.js'
import {
  defaultExportLayerNames,
  serializeLayerRenameMap,
  toCanonicalLayerNames,
} from '../boundaryDetection.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  jobId: { type: String, default: null },
  partCount: { type: Number, default: 0 },
  nestedCount: { type: Number, default: 0 },
  unassignedCount: { type: Number, default: 0 },
  unassignedIds: { type: Array, default: () => [] },
  unassignedReasons: { type: Array, default: () => [] },
  hasUnassignedDxf: { type: Boolean, default: false },
  dxfText: { type: String, default: '' },
  boundaries: { type: Array, default: () => [] },
  blockInserts: { type: Array, default: () => [] },
  sheetCount: { type: Number, default: 1 },
  sheetX: { type: Number, default: null },
  sheetY: { type: Number, default: null },
  sheetThickness: { type: Number, default: null },
  defaultMaterial: { type: String, default: '' },
  leftoverDefaultMaterial: { type: String, default: '' },
  leftoverJobId: { type: String, default: null },
  leftoverDxfText: { type: String, default: '' },
  leftoverBoundaries: { type: Array, default: () => [] },
  leftoverBlockInserts: { type: Array, default: () => [] },
  leftoverSheetCount: { type: Number, default: 1 },
  leftoverSheetX: { type: Number, default: null },
  leftoverSheetY: { type: Number, default: null },
  leftoverSheetThickness: { type: Number, default: null },
  nestingMetrics: { type: Object, default: null },
  leftoverNestingMetrics: { type: Object, default: null },
})

const emit = defineEmits(['close', 'nest-unassigned'])
const viewerRef = ref(null)
const activeTab = ref('assigned')
const sheetViewMode = ref('all')
const sheetIndex = ref(0)
const sheetCache = ref(new Map())
const zipSheetCounts = ref(new Map())
const sheetLoading = ref(false)
const sheetError = ref(null)
let sheetFetchToken = 0

const unassignedPartsDxfText = ref('')
const unassignedPartsLoading = ref(false)
const unassignedPartsError = ref(null)
const unassignedPartsJobId = ref(null)
let unassignedPartsFetchToken = 0

const hasLeftoverNest = computed(() => Boolean(props.leftoverJobId && props.leftoverDxfText))
const showUnassignedTab = computed(() => props.unassignedCount > 0 || hasLeftoverNest.value)
const showingLeftover = computed(() => hasLeftoverNest.value && activeTab.value === 'unassigned')
const showingUnassignedParts = computed(
  () => activeTab.value === 'unassigned' && !hasLeftoverNest.value,
)
const unassignedTabLabel = computed(() =>
  hasLeftoverNest.value ? 'Unassigned parts nesting (B)' : 'Unassigned parts (B)',
)
const isPerSheet = computed(() => !showingUnassignedParts.value && sheetViewMode.value === 'per')
const showSheetControls = computed(() => !showingUnassignedParts.value)

const downloadZipLabel = computed(() => {
  if (!showUnassignedTab.value || !hasLeftoverNest.value) return 'Download ZIP'
  return activeTab.value === 'unassigned' ? 'Download ZIP (B)' : 'Download ZIP (A)'
})

const activeJobId = computed(() => {
  if (showingUnassignedParts.value) return null
  return showingLeftover.value ? props.leftoverJobId : props.jobId
})
const activeMergedDxfText = computed(() => {
  if (showingUnassignedParts.value) return unassignedPartsDxfText.value
  return showingLeftover.value ? props.leftoverDxfText : props.dxfText
})
const activeBoundaries = computed(() => {
  if (showingUnassignedParts.value || isPerSheet.value) return []
  return showingLeftover.value ? props.leftoverBoundaries : props.boundaries
})
const activeBlockInserts = computed(() => {
  if (showingUnassignedParts.value || isPerSheet.value) return []
  return showingLeftover.value ? props.leftoverBlockInserts : props.blockInserts
})
const activeSheetCount = computed(() => {
  if (showingUnassignedParts.value) return 1
  const jobId = activeJobId.value
  if (jobId && zipSheetCounts.value.has(jobId)) {
    return Math.max(1, zipSheetCounts.value.get(jobId))
  }
  const count = showingLeftover.value ? props.leftoverSheetCount : props.sheetCount
  return Math.max(1, Number(count) || 1)
})
const activeSheetX = computed(() =>
  showingLeftover.value ? props.leftoverSheetX : props.sheetX,
)
const activeSheetY = computed(() =>
  showingLeftover.value ? props.leftoverSheetY : props.sheetY,
)
const activeSheetThickness = computed(() =>
  showingLeftover.value ? props.leftoverSheetThickness : props.sheetThickness,
)
const activeDefaultMaterial = computed(() =>
  showingLeftover.value ? props.leftoverDefaultMaterial : props.defaultMaterial,
)

const cachedSheetDxf = computed(() => {
  const jobId = activeJobId.value
  if (!jobId) return ''
  return sheetCache.value.get(`${jobId}:${sheetIndex.value}`) ?? ''
})

const viewerDxfText = computed(() => {
  if (showingUnassignedParts.value) return unassignedPartsDxfText.value
  if (isPerSheet.value) return cachedSheetDxf.value
  return activeMergedDxfText.value
})

const canCycleSheets = computed(() => showSheetControls.value && activeSheetCount.value > 1)
const sheetLabel = computed(() => `Sheet ${sheetIndex.value + 1}/${activeSheetCount.value}`)

const effectiveNestedCount = computed(() => props.nestedCount || props.partCount)

function goPrevSheet() {
  if (!canCycleSheets.value) return
  const count = activeSheetCount.value
  sheetIndex.value = (sheetIndex.value - 1 + count) % count
}

function goNextSheet() {
  if (!canCycleSheets.value) return
  sheetIndex.value = (sheetIndex.value + 1) % activeSheetCount.value
}

const modalTitle = computed(() => {
  if (hasLeftoverNest.value) {
    const previouslyUnassigned = props.unassignedCount
    const previouslyLabel = previouslyUnassigned === 1 ? 'part' : 'parts'
    return `Nesting complete — ${effectiveNestedCount.value} nested + ${previouslyUnassigned} previously unassigned ${previouslyLabel} nested`
  }
  if (props.unassignedCount > 0) {
    return `Nesting complete — ${effectiveNestedCount.value} nested, ${props.unassignedCount} not nested`
  }
  return `Nesting complete — ${props.partCount} part${props.partCount === 1 ? '' : 's'}`
})

const unassignedIdsText = computed(() => formatUnassignedIdsDisplay(props.unassignedIds))

const METRICS_ROWS = [
  { key: 'sheetAmount', label: 'Sheet quantity', kind: 'int' },
  { key: 'cutLength', label: 'Cutting length', kind: 'float', unit: 'mm' },
  { key: 'boreCount', label: 'Number of drill holes', kind: 'int' },
  { key: 'grossArea', label: 'Gross area', kind: 'float', unit: 'm²' },
  { key: 'netArea', label: 'Net area', kind: 'float', unit: 'm²' },
]

const activeNestingMetrics = computed(() => {
  if (showingLeftover.value) return props.leftoverNestingMetrics
  return props.nestingMetrics
})

const showUnassignedInfoPanel = computed(
  () => props.unassignedCount > 0 && !hasLeftoverNest.value,
)

function formatMetricValue(value, kind, unit) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const num = Number(value)
  let formatted
  if (kind === 'int') {
    formatted = Math.round(num).toLocaleString('de-DE')
  } else {
    formatted = num.toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    })
  }
  return unit ? `${formatted} ${unit}` : formatted
}

const metricsRows = computed(() => {
  const metrics = activeNestingMetrics.value
  return METRICS_ROWS.map(({ key, label, kind, unit }) => ({
    key,
    label,
    display: formatMetricValue(metrics?.[key], kind, unit),
  }))
})

const showMetricsPanel = computed(() => !showingUnassignedParts.value)

const DOWNLOAD_DXF_HINT =
  'Configure layer visibility in the viewer to determine the content of each DXF and the merged PDF inside the downloaded ZIP.'

const namingPanelOpen = ref(false)
const pendingDownloadKind = ref('nesting')
const pendingHiddenLayers = ref([])
const editLayersPanelOpen = ref(false)
const exportLayerNames = ref(defaultExportLayerNames())
const exportLayerNamesKey = computed(
  () => serializeLayerRenameMap(exportLayerNames.value) || 'identity',
)

function sheetIndexFromZipName(name) {
  const base = String(name || '').split('/').pop() || ''
  const match = base.match(/_(\d+)\.dxf$/i)
  if (match) {
    // Download sheet ids are 1-based and zero-padded (001, 022, …).
    return Math.max(0, Number(match[1]) - 1)
  }
  if (/^\d+\.dxf$/i.test(base)) return Number(base.slice(0, -4))
  return null
}

function jobSheetsLoaded(jobId) {
  return zipSheetCounts.value.has(jobId)
}

function resetSheetView() {
  sheetViewMode.value = 'all'
  sheetIndex.value = 0
  sheetLoading.value = false
  sheetError.value = null
  sheetFetchToken += 1
}

function resetSheetIndexForTabSwitch() {
  sheetIndex.value = 0
  sheetLoading.value = false
  sheetError.value = null
  sheetFetchToken += 1
}

function setSheetViewMode(mode) {
  if (!showSheetControls.value) return
  if (mode !== 'all' && mode !== 'per') return
  sheetViewMode.value = mode
  if (mode === 'per') {
    sheetIndex.value = Math.min(sheetIndex.value, activeSheetCount.value - 1)
  }
}

async function ensureJobSheetsLoaded(jobId) {
  if (!jobId) return
  if (jobSheetsLoaded(jobId) && sheetCache.value.has(`${jobId}:0`)) {
    sheetError.value = null
    sheetLoading.value = false
    return
  }
  const token = ++sheetFetchToken
  sheetLoading.value = true
  sheetError.value = null
  try {
    // WAITING BFF: GET /api/jobs/:id/download — Simple Parts Flask stand-in
    const res = await fetch(
      `/api/jobs/${encodeURIComponent(jobId)}/download?filename=${encodeURIComponent('nesting.zip')}`,
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Failed to load sheets')
    }
    const zip = await JSZip.loadAsync(await res.arrayBuffer())
    const dxfEntries = []
    zip.forEach((relativePath, file) => {
      if (file.dir) return
      if (!/\.dxf$/i.test(relativePath)) return
      const index = sheetIndexFromZipName(relativePath)
      if (index == null) return
      dxfEntries.push({ index, file })
    })
    dxfEntries.sort((a, b) => a.index - b.index)
    if (!dxfEntries.length) {
      throw new Error('No sheet DXFs found in nesting result')
    }
    const next = new Map(sheetCache.value)
    await Promise.all(
      dxfEntries.map(async ({ index, file }) => {
        next.set(`${jobId}:${index}`, await file.async('string'))
      }),
    )
    if (token !== sheetFetchToken) return
    sheetCache.value = next
    const counts = new Map(zipSheetCounts.value)
    counts.set(jobId, dxfEntries.length)
    zipSheetCounts.value = counts
    if (sheetIndex.value >= dxfEntries.length) {
      sheetIndex.value = dxfEntries.length - 1
    }
  } catch (err) {
    if (token !== sheetFetchToken) return
    sheetError.value = err?.message || 'Failed to load sheets'
  } finally {
    if (token === sheetFetchToken) {
      sheetLoading.value = false
    }
  }
}

async function ensureUnassignedPartsDxfLoaded(jobId) {
  if (!jobId || !props.hasUnassignedDxf) {
    unassignedPartsDxfText.value = ''
    unassignedPartsJobId.value = null
    unassignedPartsError.value = null
    unassignedPartsLoading.value = false
    return
  }
  if (unassignedPartsJobId.value === jobId && unassignedPartsDxfText.value) {
    unassignedPartsError.value = null
    unassignedPartsLoading.value = false
    return
  }
  const token = ++unassignedPartsFetchToken
  unassignedPartsLoading.value = true
  unassignedPartsError.value = null
  unassignedPartsDxfText.value = ''
  try {
    // WAITING BFF: GET /api/jobs/:id/download/unassigned — Simple Parts Flask stand-in
    const res = await fetch(
      `/api/jobs/${encodeURIComponent(jobId)}/download/unassigned?filename=${encodeURIComponent('unassigned.dxf')}`,
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Failed to load unassigned parts')
    }
    const text = await res.text()
    if (token !== unassignedPartsFetchToken) return
    unassignedPartsDxfText.value = text
    unassignedPartsJobId.value = jobId
  } catch (err) {
    if (token !== unassignedPartsFetchToken) return
    unassignedPartsDxfText.value = ''
    unassignedPartsJobId.value = null
    unassignedPartsError.value = err?.message || 'Failed to load unassigned parts'
  } finally {
    if (token === unassignedPartsFetchToken) {
      unassignedPartsLoading.value = false
    }
  }
}

function openEditLayersPanel() {
  editLayersPanelOpen.value = true
}

function closeEditLayersPanel() {
  editLayersPanelOpen.value = false
}

function onEditLayersConfirm(names) {
  exportLayerNames.value = { ...defaultExportLayerNames(), ...names }
  closeEditLayersPanel()
}

function openNamingPanel(kind, hiddenLayers = []) {
  pendingDownloadKind.value = kind
  pendingHiddenLayers.value = hiddenLayers
  namingPanelOpen.value = true
}

function closeNamingPanel() {
  namingPanelOpen.value = false
  pendingHiddenLayers.value = []
}

function triggerDownload(filename) {
  // WAITING DATABASE: nesting ZIP / unassigned DXF should be posted to the parent dashboard for the job/artifact API
  const hidden = toCanonicalLayerNames(pendingHiddenLayers.value, exportLayerNames.value)
  const filenameParam = `filename=${encodeURIComponent(filename)}`
  const layerNamesParam = serializeLayerRenameMap(exportLayerNames.value)
  const link = document.createElement('a')
  if (pendingDownloadKind.value === 'unassigned') {
    link.href = `/api/jobs/${props.jobId}/download/unassigned?${filenameParam}`
  } else {
    const params = [filenameParam]
    if (hidden.length) {
      params.push(`excludeLayers=${hidden.map(encodeURIComponent).join(',')}`)
    }
    if (layerNamesParam) {
      params.push(`layerNames=${encodeURIComponent(layerNamesParam)}`)
    }
    link.href = `/api/jobs/${activeJobId.value}/download?${params.join('&')}`
  }
  link.click()
}

function onNamingPanelConfirm({ filename }) {
  triggerDownload(filename)
  closeNamingPanel()
}

function onUnassignedDownloadClick() {
  openNamingPanel('unassigned')
}

function onNestUnassignedClick() {
  emit('nest-unassigned')
}

function onDownloadClick() {
  const hidden = viewerRef.value?.getHiddenLayers?.() ?? []
  const all = viewerRef.value?.getLayerNames?.() ?? []
  if (all.length && all.every((name) => hidden.includes(name))) {
    window.alert('No layers are visible. Show at least one layer to download.')
    return
  }
  openNamingPanel('nesting', hidden)
}

function onAssignedTabClick() {
  activeTab.value = 'assigned'
  resetSheetIndexForTabSwitch()
}

function onUnassignedTabClick() {
  activeTab.value = 'unassigned'
  resetSheetIndexForTabSwitch()
  if (!hasLeftoverNest.value && props.jobId) {
    ensureUnassignedPartsDxfLoaded(props.jobId)
  }
}

watch(
  () => props.jobId,
  () => {
    // New primary nest only — keep names across leftover renest / modal reopen.
    exportLayerNames.value = defaultExportLayerNames()
    editLayersPanelOpen.value = false
  },
)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      activeTab.value = 'assigned'
      resetSheetView()
      editLayersPanelOpen.value = false
      if (props.hasUnassignedDxf && props.jobId && !hasLeftoverNest.value) {
        ensureUnassignedPartsDxfLoaded(props.jobId)
      }
    } else {
      unassignedPartsFetchToken += 1
      unassignedPartsLoading.value = false
    }
  },
)

watch(
  () => [props.open, props.jobId, props.hasUnassignedDxf, hasLeftoverNest.value],
  ([isOpen, jobId, hasDxf, leftover]) => {
    if (!isOpen || leftover || !hasDxf || !jobId) return
    ensureUnassignedPartsDxfLoaded(jobId)
  },
)

watch(
  () => [props.open, isPerSheet.value, activeJobId.value],
  ([isOpen, perSheet, jobId]) => {
    if (!isOpen || !perSheet || !jobId) return
    ensureJobSheetsLoaded(jobId)
  },
)

watch(
  () => [props.open, viewerDxfText.value, activeTab.value, sheetViewMode.value, sheetIndex.value],
  async ([isOpen]) => {
    if (!isOpen || !viewerDxfText.value) return
    await nextTick()
    requestAnimationFrame(() => {
      viewerRef.value?.resize?.()
    })
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="nesting-modal" role="dialog" aria-modal="true" aria-labelledby="nesting-modal-title">
      <div class="nesting-modal__backdrop" @click="emit('close')" />
      <div class="nesting-modal__panel">
        <header class="nesting-modal__header">
          <div class="nesting-modal__header-main">
            <h2 id="nesting-modal-title" class="nesting-modal__title">
              {{ modalTitle }}
            </h2>
            <div
              class="nesting-modal__sheet-toggle"
              :class="{ 'nesting-modal__sheet-toggle--disabled': !showSheetControls }"
              role="group"
              aria-label="Sheet view mode"
              :aria-disabled="!showSheetControls"
            >
              <button
                type="button"
                class="nesting-modal__sheet-toggle-btn"
                :class="{ 'nesting-modal__sheet-toggle-btn--active': sheetViewMode === 'all' }"
                :aria-pressed="sheetViewMode === 'all'"
                :disabled="!showSheetControls"
                @click="setSheetViewMode('all')"
              >
                All Sheets
              </button>
              <button
                type="button"
                class="nesting-modal__sheet-toggle-btn"
                :class="{ 'nesting-modal__sheet-toggle-btn--active': sheetViewMode === 'per' }"
                :aria-pressed="sheetViewMode === 'per'"
                :disabled="!showSheetControls"
                @click="setSheetViewMode('per')"
              >
                Per Sheet
              </button>
            </div>
          </div>
          <button type="button" class="nesting-modal__close" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>

        <div v-if="showUnassignedTab" class="nesting-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="nesting-modal__tab"
            :class="{ 'nesting-modal__tab--active': activeTab === 'assigned' }"
            :aria-selected="activeTab === 'assigned'"
            @click="onAssignedTabClick"
          >
            Assigned parts nesting (A)
          </button>
          <button
            type="button"
            role="tab"
            class="nesting-modal__tab"
            :class="{ 'nesting-modal__tab--active': activeTab === 'unassigned' }"
            :aria-selected="activeTab === 'unassigned'"
            @click="onUnassignedTabClick"
          >
            {{ unassignedTabLabel }}
          </button>
        </div>

        <div class="nesting-modal__viewer">
          <div
            v-if="showUnassignedInfoPanel || showMetricsPanel"
            class="nesting-modal__info-stack"
          >
            <div
              v-if="showUnassignedInfoPanel"
              class="nesting-modal__unassigned-panel"
              role="status"
              aria-live="polite"
            >
              <p class="nesting-modal__unassigned-summary">
                {{ effectiveNestedCount }} nested, {{ unassignedCount }} not nested
              </p>
              <p v-if="unassignedIdsText" class="nesting-modal__unassigned-ids">
                {{ unassignedIdsText }}
              </p>
              <p
                v-for="(reason, index) in unassignedReasons"
                :key="`${reason}-${index}`"
                class="nesting-modal__unassigned-reason"
              >
                {{ reason }}
              </p>
              <p class="nesting-modal__unassigned-hint">
                Unassigned parts will now show <span class="legend-part-red">red</span> in app viewer.
              </p>
            </div>
            <div
              v-if="showMetricsPanel"
              class="nesting-modal__metrics-panel"
              role="status"
              aria-label="Nesting metrics"
            >
              <table class="nesting-modal__metrics-table">
                <tbody>
                  <tr
                    v-for="row in metricsRows"
                    :key="row.key"
                    class="nesting-modal__metrics-row"
                  >
                    <th scope="row" class="nesting-modal__metrics-label">{{ row.label }}</th>
                    <td class="nesting-modal__metrics-value">{{ row.display }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <DXFViewer
            v-if="viewerDxfText"
            ref="viewerRef"
            :key="`${viewerDxfText}::${exportLayerNamesKey}`"
            :dxf-text="viewerDxfText"
            :boundaries="activeBoundaries"
            :block-inserts="activeBlockInserts"
            view-mode="output"
            :click-for-properties="false"
            :show-properties-panel="false"
            :selection-enabled="false"
            :show-metadata-colors="false"
            :show-layer-panel="!showingUnassignedParts"
            :show-edit-layers="!showingUnassignedParts"
            :export-layer-names="exportLayerNames"
            @edit-layers="openEditLayersPanel"
          />
          <p v-else-if="showingUnassignedParts && unassignedPartsLoading" class="nesting-modal__viewer-empty">
            Loading unassigned parts…
          </p>
          <p v-else-if="showingUnassignedParts && unassignedPartsError" class="nesting-modal__viewer-empty">
            {{ unassignedPartsError }}
          </p>
          <p v-else-if="isPerSheet && sheetLoading" class="nesting-modal__viewer-empty">
            Loading sheet…
          </p>
          <p v-else-if="isPerSheet && sheetError" class="nesting-modal__viewer-empty">
            {{ sheetError }}
          </p>
          <p v-else class="nesting-modal__viewer-empty">Preview unavailable.</p>

          <div
            v-if="isPerSheet"
            class="nesting-modal__sheet-pager"
            role="navigation"
            aria-label="Sheet pager"
          >
            <button
              type="button"
              class="nesting-modal__sheet-pager-btn"
              aria-label="Previous sheet"
              :disabled="!canCycleSheets || sheetLoading"
              @click="goPrevSheet"
            >
              ‹
            </button>
            <span class="nesting-modal__sheet-pager-label">{{ sheetLabel }}</span>
            <button
              type="button"
              class="nesting-modal__sheet-pager-btn"
              aria-label="Next sheet"
              :disabled="!canCycleSheets || sheetLoading"
              @click="goNextSheet"
            >
              ›
            </button>
            <span v-if="sheetLoading" class="nesting-modal__sheet-pager-status">Loading…</span>
            <span v-else-if="sheetError" class="nesting-modal__sheet-pager-status nesting-modal__sheet-pager-status--error">
              {{ sheetError }}
            </span>
          </div>
        </div>

        <footer v-if="activeJobId || jobId" class="nesting-modal__footer">
          <button
            v-if="activeJobId"
            type="button"
            class="nesting-modal__download"
            :title="DOWNLOAD_DXF_HINT"
            @click="onDownloadClick"
          >
            {{ downloadZipLabel }}
          </button>
          <button
            v-if="unassignedCount > 0 && hasUnassignedDxf"
            type="button"
            class="nesting-modal__download nesting-modal__download--unassigned-3d"
            @click="onUnassignedDownloadClick"
          >
            Download unassigned parts (3d)
          </button>
          <button
            v-if="unassignedCount > 0 && hasUnassignedDxf && !hasLeftoverNest"
            type="button"
            class="nesting-modal__download"
            title="Reprocess unassigned parts with a different sheet size."
            @click="onNestUnassignedClick"
          >
            Nest unassigned parts
          </button>
        </footer>
      </div>
    </div>

    <DownloadFileNamingPanel
      :open="namingPanelOpen"
      :download-kind="pendingDownloadKind"
      :sheet-x="pendingDownloadKind === 'unassigned' ? sheetX : activeSheetX"
      :sheet-y="pendingDownloadKind === 'unassigned' ? sheetY : activeSheetY"
      :sheet-thickness="pendingDownloadKind === 'unassigned' ? sheetThickness : activeSheetThickness"
      :default-material="activeDefaultMaterial"
      @close="closeNamingPanel"
      @confirm="onNamingPanelConfirm"
    />
    <EditLayerNamesPanel
      :open="editLayersPanelOpen"
      :layer-names="exportLayerNames"
      @close="closeEditLayersPanel"
      @confirm="onEditLayersConfirm"
    />
  </Teleport>
</template>

<style scoped>
.nesting-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.nesting-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.nesting-modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1280px, 96vw);
  height: 92vh;
  max-height: 92vh;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.nesting-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.nesting-modal__header-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
  min-width: 0;
}

.nesting-modal__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-summary);
}

.nesting-modal__sheet-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.nesting-modal__sheet-toggle--disabled {
  opacity: 0.45;
}

.nesting-modal__sheet-toggle-btn {
  padding: 0.28rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-right: 1px solid var(--color-border);
}

.nesting-modal__sheet-toggle-btn:last-child {
  border-right: none;
}

.nesting-modal__sheet-toggle-btn:hover:not(:disabled) {
  color: var(--color-text-summary);
  background: var(--color-surface-hover);
}

.nesting-modal__sheet-toggle-btn:disabled {
  cursor: not-allowed;
}

.nesting-modal__sheet-toggle-btn--active {
  color: var(--color-text-summary);
  background: var(--color-surface-hover);
  box-shadow: inset 0 -2px 0 var(--color-accent);
}

.nesting-modal__close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  padding: 0;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
}

.nesting-modal__close:hover {
  color: var(--color-text-summary);
  background: var(--color-surface-hover);
}

.nesting-modal__tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
}

.nesting-modal__tab {
  flex: 1;
  padding: 0.55rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.nesting-modal__tab:hover {
  color: var(--color-text-summary);
  background: var(--color-surface-hover);
}

.nesting-modal__tab--active {
  color: var(--color-text-summary);
  border-bottom-color: var(--color-accent);
}

.nesting-modal__viewer {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: #fafafa;
}

.nesting-modal__info-stack {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 320px;
  min-width: 240px;
  pointer-events: none;
}

.nesting-modal__unassigned-panel {
  padding: 0.65rem 0.75rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-summary);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nesting-modal__metrics-panel {
  padding: 0.5rem 0.65rem;
  font-size: 0.8rem;
  line-height: 1.35;
  color: var(--color-text-summary);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nesting-modal__metrics-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.nesting-modal__metrics-label {
  width: 58%;
  padding: 0.2rem 0.65rem 0.2rem 0;
  font-weight: 500;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  border-bottom: 1px solid var(--color-border);
}

.nesting-modal__metrics-value {
  width: 42%;
  padding: 0.2rem 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  border-bottom: 1px solid var(--color-border);
}

.nesting-modal__metrics-row:last-child .nesting-modal__metrics-label,
.nesting-modal__metrics-row:last-child .nesting-modal__metrics-value {
  border-bottom: none;
}

.nesting-modal__unassigned-summary {
  margin: 0;
  font-weight: 600;
}

.nesting-modal__unassigned-ids {
  margin: 0.35rem 0 0;
}

.nesting-modal__unassigned-reason {
  margin: 0.35rem 0 0;
  padding: 0.3rem 0.4rem;
  font-size: 0.92em;
  color: var(--color-warning-emphasis);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-emphasis);
  border-radius: 4px;
}

.nesting-modal__unassigned-hint {
  margin: 0.45rem 0 0;
  font-size: 0.92em;
  font-style: italic;
  color: var(--color-text-muted);
}

.nesting-modal__sheet-pager {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  line-height: 1.2;
  color: var(--color-text-summary);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nesting-modal__sheet-pager-label {
  min-width: 4.5rem;
  text-align: center;
  font-weight: 600;
}

.nesting-modal__sheet-pager-btn {
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-summary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.nesting-modal__sheet-pager-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
}

.nesting-modal__sheet-pager-btn:disabled {
  cursor: default;
  opacity: 0.4;
}

.nesting-modal__sheet-pager-status {
  margin-left: 0.15rem;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.nesting-modal__sheet-pager-status--error {
  color: var(--color-warning-emphasis);
}

.nesting-modal__viewer :deep(.viewer-shell) {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.nesting-modal__viewer-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.nesting-modal__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}

.nesting-modal__download {
  display: inline-block;
  padding: 0.45rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  color: var(--color-surface);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  transition: background 0.15s ease;
}

.nesting-modal__download:hover {
  background: #163d6e;
}

.nesting-modal__download--unassigned-3d {
  background: var(--color-salmon);
  border-color: var(--color-salmon);
}

.nesting-modal__download--unassigned-3d:hover {
  background: var(--color-salmon-hover);
  border-color: var(--color-salmon-hover);
}
</style>
