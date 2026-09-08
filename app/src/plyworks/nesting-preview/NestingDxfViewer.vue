<script setup>
import { computed, ref, watch } from 'vue'
import {
  DXFViewer as DxfViewer,
  LayerPanel,
  ACI_PALETTE,
  resolveAci7Hex,
  rgbNumberToHex,
} from 'dxf-vuer'
import * as THREE from 'three'
import 'dxf-vuer/style.css'

const props = defineProps({
  dxf: { type: Object, required: true },
  hiddenLayers: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:hiddenLayers'])

const viewerRef = ref(null)

function layerTableColorHex(layer) {
  if (!layer) return '#888888'
  const idx = Number(layer.colorIndex)
  if (Number.isFinite(idx) && idx >= 1 && idx <= 255) {
    if (idx === 7 || idx === 255) return resolveAci7Hex(false)
    const rgb = ACI_PALETTE[idx]
    if (rgb != null) return `#${Number(rgb).toString(16).padStart(6, '0')}`
  }
  if (layer.color != null && layer.color !== 0) {
    try {
      return rgbNumberToHex(layer.color)
    } catch {
      /* fall through */
    }
  }
  return '#888888'
}

const layers = computed(() => {
  const tableLayers = props.dxf?.tables?.layer?.layers ?? {}
  const counts = {}
  for (const entity of props.dxf?.entities ?? []) {
    const name = entity.layer ?? '0'
    counts[name] = (counts[name] || 0) + 1
  }
  const hidden = props.hiddenLayers
  return Object.keys(counts)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const table = tableLayers[name]
      return {
        name,
        visible: !hidden.includes(name),
        frozen: Boolean(table?.frozen),
        locked: Boolean(table?.locked),
        color: layerTableColorHex(table),
        entityCount: counts[name],
      }
    })
})

function onToggleLayer(name) {
  const hidden = [...props.hiddenLayers]
  const idx = hidden.indexOf(name)
  if (idx >= 0) hidden.splice(idx, 1)
  else hidden.push(name)
  emit('update:hiddenLayers', hidden)
}

function onLoaded(success) {
  if (success === false) return
  const controls = viewerRef.value?.getControls?.()
  if (!controls) return
  controls.mouseButtons = {
    LEFT: -1,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  }
}

watch(
  () => props.dxf,
  () => {
    emit('update:hiddenLayers', [])
  },
)
</script>

<template>
  <div class="nesting-dxf-viewer">
    <DxfViewer
      ref="viewerRef"
      :hidden-layers="hiddenLayers"
      :dxf-data="dxf"
      :show-layer-panel="false"
      toolbar-position="bottom-right"
      :picking-enabled="false"
      :highlight-on-hover="false"
      :highlight-associated="false"
      style="width: 100%; height: 100%"
      @dxf-loaded="onLoaded"
      @update:hidden-layers="emit('update:hiddenLayers', $event)"
    />
    <div v-if="layers.length" class="nesting-dxf-viewer__layers">
      <LayerPanel
        :layers="layers"
        @toggle-layer="onToggleLayer"
        @show-all="emit('update:hiddenLayers', [])"
        @hide-all="emit('update:hiddenLayers', layers.map((layer) => layer.name))"
      />
    </div>
  </div>
</template>

<style scoped>
.nesting-dxf-viewer {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.nesting-dxf-viewer__layers {
  position: absolute;
  top: 2.75rem;
  left: 0.5rem;
  z-index: 2;
}
</style>
