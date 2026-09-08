<script setup>
import { computed, ref, watch } from 'vue'
import { DXFViewer as DxfViewer, LayerPanel } from 'dxf-vuer'
import * as THREE from 'three'
import { isHiddenLayerTableName, buildLayerPanelLayers } from '../boundaryDetection.js'

const props = defineProps({
  dxf: { type: Object, required: true },
  cameraStateToRestore: { type: Object, default: null },
  hiddenLayers: { type: Array, default: () => [] },
  showLayerPanel: { type: Boolean, default: false },
  showEditLayers: { type: Boolean, default: false },
  highlightColor: { type: Number, required: true },
  selectedHandles: { type: Array, default: () => [] },
  highlightSafeHandles: { type: Function, required: true },
  pickingEnabled: { type: Boolean, default: true },
})

const emit = defineEmits(['update:hiddenLayers', 'ready', 'entity-click', 'edit-layers'])

const viewerRef = ref(null)
let controlsChangeHandler = null

const layers = computed(() => buildLayerPanelLayers(props.dxf, props.hiddenLayers))

function onToggleLayer(name) {
  const hidden = [...props.hiddenLayers]
  const idx = hidden.indexOf(name)
  if (idx >= 0) hidden.splice(idx, 1)
  else hidden.push(name)
  emit('update:hiddenLayers', hidden)
}

function onShowAllLayers() {
  emit('update:hiddenLayers', [])
}

function onHideAllLayers() {
  emit('update:hiddenLayers', layers.value.map((l) => l.name))
}

function getCamera() {
  return viewerRef.value?.getCamera?.() ?? null
}

function getCanvas() {
  return viewerRef.value?.getRenderer?.()?.domElement ?? null
}

function getOriginOffset() {
  return viewerRef.value?.getOriginOffset?.() ?? { x: 0, y: 0, z: 0 }
}

function captureCameraState() {
  const camera = getCamera()
  const controls = viewerRef.value?.getControls?.()
  if (!camera || !controls) return null
  const origin = getOriginOffset()
  return {
    zoom: camera.zoom,
    worldTargetX: controls.target.x + origin.x,
    worldTargetY: controls.target.y + origin.y,
  }
}

function restoreCameraState(state) {
  const camera = getCamera()
  const controls = viewerRef.value?.getControls?.()
  if (!camera || !controls || !state) return
  const origin = getOriginOffset()
  camera.zoom = state.zoom
  controls.target.x = state.worldTargetX - origin.x
  controls.target.y = state.worldTargetY - origin.y
  camera.position.x = controls.target.x
  camera.position.y = controls.target.y
  camera.updateProjectionMatrix()
  controls.update()
}

function applyHighlight(handles) {
  const viewer = viewerRef.value
  if (!viewer) return
  const dxfHandles = props.highlightSafeHandles(handles)
  if (dxfHandles.length) viewer.highlight(dxfHandles)
  else viewer.clearHighlight()
}

function clearHighlight() {
  viewerRef.value?.clearHighlight()
}

function zoomToEntity(handles) {
  viewerRef.value?.zoomToEntity(handles)
}

function setControlsChangeListener(fn) {
  const controls = viewerRef.value?.getControls?.()
  if (controlsChangeHandler && controls) {
    controls.removeEventListener('change', controlsChangeHandler)
  }
  controlsChangeHandler = fn ?? null
  if (fn && controls) controls.addEventListener('change', fn)
}

function onLoaded(success) {
  if (success === false) return
  const controls = viewerRef.value?.getControls?.()
  if (controls) {
    controls.mouseButtons = {
      LEFT: -1,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    }
  }
  if (props.cameraStateToRestore) {
    restoreCameraState(props.cameraStateToRestore)
  }
  applyHighlight(props.selectedHandles)
  emit('ready')
}

watch(() => props.selectedHandles, (handles) => {
  applyHighlight(handles)
}, { deep: true })

function getControls() {
  return viewerRef.value?.getControls?.() ?? null
}

function resize() {
  viewerRef.value?.resize?.()
}

defineExpose({
  getContainerEl: () => viewerRef.value?.$el ?? null,
  getCamera,
  getControls,
  getCanvas,
  getOriginOffset,
  captureCameraState,
  restoreCameraState,
  applyHighlight,
  clearHighlight,
  zoomToEntity,
  setControlsChangeListener,
  resize,
})
</script>

<template>
  <div class="dxf-2d-viewer">
    <DxfViewer
      ref="viewerRef"
      :hidden-layers="hiddenLayers"
      :dxf-data="dxf"
      :show-layer-panel="false"
      :picking-enabled="pickingEnabled"
      :highlight-on-hover="false"
      :highlight-associated="false"
      :highlight-color="highlightColor"
      style="width: 100%; height: 100%"
      @dxf-loaded="onLoaded"
      @entity-click="emit('entity-click', $event)"
      @update:hidden-layers="emit('update:hiddenLayers', $event)"
    />
    <div
      v-if="showLayerPanel && layers.length"
      class="dxf-2d-viewer__layers viewer-layer-stack"
    >
      <LayerPanel
        :layers="layers"
        @toggle-layer="onToggleLayer"
        @show-all="onShowAllLayers"
        @hide-all="onHideAllLayers"
      />
      <button
        v-if="showEditLayers"
        type="button"
        class="viewer-layer-stack__edit"
        @click="emit('edit-layers')"
      >
        Edit layers
      </button>
    </div>
  </div>
</template>

<style scoped>
.dxf-2d-viewer {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.dxf-2d-viewer__layers {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
  max-height: calc(100% - 16px);
}

.viewer-layer-stack__edit {
  padding: 0.35rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  color: var(--color-text-summary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.viewer-layer-stack__edit:hover {
  background: var(--color-surface-hover);
}
</style>
