<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import {
  createThreeObjectsFromDXF,
  LayerPanel,
  ACI_PALETTE,
  buildPickingIndex,
  getZoomBox,
  SCENE_BG_COLOR,
  CAMERA_INITIAL_Z_POSITION,
  CAMERA_NEAR_PLANE,
  CAMERA_FAR_PLANE,
  useCamera,
  useControls,
} from 'dxf-vuer'
import { buildLayerPanelLayers, normalizeHandle } from '../boundaryDetection.js'
import { buildAnnotationOverlayDxf } from '../boundaryViewCore.js'

const SHADED_GROUP = 'simple-parts-shaded-plan'

const props = defineProps({
  dxf: { type: Object, required: true },
  cameraStateToRestore: { type: Object, default: null },
  hiddenLayers: { type: Array, default: () => [] },
  showLayerPanel: { type: Boolean, default: false },
  showEditLayers: { type: Boolean, default: false },
  highlightColor: { type: Number, required: true },
  selectedHandles: { type: Array, default: () => [] },
  shadedHandlesFromSelection: { type: Function, required: true },
})

const emit = defineEmits(['update:hiddenLayers', 'ready', 'edit-layers'])

const containerRef = ref(null)
const { fitCameraToBox, handleResize } = useCamera()
const { initControls, getControls, cleanup: cleanupControls } = useControls()

let renderer = null
let scene = null
let camera = null
let originOffset = { x: 0, y: 0, z: 0 }
let dxfMaterials = null
let dxfGroup = null
let shadedGroup = null
let controlsChangeHandler = null
let resizeObserver = null
let fitZoom = 1
const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()

const layers = computed(() => buildLayerPanelLayers(props.dxf, props.hiddenLayers))

function entityColor(entity) {
  if (entity.color != null) return entity.color
  return ACI_PALETTE[entity.colorIndex ?? 7] ?? 0xffffff
}

function isLayerVisible(layer) {
  return !props.hiddenLayers.includes(layer ?? '0')
}

function addShadedMeshes(dxf, group, ox, oy) {
  let count = 0
  for (const entity of dxf.entities) {
    const layer = entity.layer ?? '0'
    const visible = isLayerVisible(layer)
    const color = entityColor(entity)
    const handle = normalizeHandle(entity.handle)

    if (entity.type === 'POLYLINE' && (
      entity.isPolyfaceMesh === true
      || entity.vertices?.some((v) => v.faceA !== undefined)
    )) {
      const pts = []
      const tris = []
      for (const v of entity.vertices) {
        if (v.faceA !== undefined) {
          const idx = [v.faceA, v.faceB, v.faceC, v.faceD]
            .filter((i) => i > 0)
            .map((i) => Math.abs(i) - 1)
          if (idx.length === 3) tris.push(idx[0], idx[1], idx[2])
          else if (idx.length >= 4) tris.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3])
        } else {
          pts.push(v.x - ox, v.y - oy, 0)
        }
      }
      if (!tris.length || pts.length < 9) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      geo.setIndex(tris)
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
      mesh.visible = visible
      mesh.userData.polyfaceHandle = handle
      mesh.userData.baseColor = color
      mesh.userData.layerName = layer
      group.add(mesh)
      count++
      continue
    }

    if (entity.type !== '3DFACE' && entity.type !== 'SOLID') continue
    const corners = entity.vertices?.length >= 3
      ? entity.vertices
      : [entity.firstCorner, entity.secondCorner, entity.thirdCorner, entity.fourthCorner].filter(Boolean)
    if (corners.length < 3) continue
    const pts = []
    for (let i = 0; i < Math.min(corners.length, 4); i++) {
      const c = corners[i]
      pts.push((c.x ?? 0) - ox, (c.y ?? 0) - oy, 0)
    }
    const tris = pts.length >= 12 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]
    if (pts.length < 9) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    geo.setIndex(tris)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
    mesh.visible = visible
    mesh.userData.polyfaceHandle = handle
    mesh.userData.baseColor = color
    mesh.userData.layerName = layer
    group.add(mesh)
    count++
  }
  return count
}

function disposeGroup(group) {
  group?.traverse((node) => {
    node.geometry?.dispose()
    node.material?.dispose()
  })
}

function applyLayerVisibility() {
  const hidden = new Set(props.hiddenLayers)
  const apply = (node) => {
    const layer = node.userData?.layerName
    if (layer != null) node.visible = !hidden.has(layer)
  }
  dxfGroup?.traverse((node) => {
    if (node.userData?.layerName != null) apply(node)
  })
  shadedGroup?.traverse(apply)
}

function applyHighlight(handles) {
  if (!shadedGroup) return
  const selected = new Set(props.shadedHandlesFromSelection(handles))
  const highlight = new THREE.Color(props.highlightColor)
  shadedGroup.traverse((node) => {
    if (!node.isMesh) return
    const handle = normalizeHandle(node.userData.polyfaceHandle)
    if (!handle) return
    const mat = node.material
    if (!mat?.color) return
    if (selected.has(handle)) mat.color.copy(highlight)
    else if (node.userData.baseColor != null) mat.color.set(node.userData.baseColor)
  })
  render()
}

function render() {
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function fitToDxf(dxf) {
  const pickingIndex = buildPickingIndex(dxf)
  const handles = pickingIndex.entries.map((e) => e.handle)
  const box = getZoomBox(pickingIndex, handles, { originOffset })
  if (!box || !camera) return
  const controls = getControls()
  const center = box.getCenter(new THREE.Vector3())
  controls?.target.set(center.x, center.y, 0)
  fitCameraToBox(box, camera)
  fitZoom = camera.zoom
  controls?.update()
  render()
}

async function rebuildScene(dxf, { fitCamera = true } = {}) {
  if (!scene) return

  if (dxfGroup) {
    scene.remove(dxfGroup)
    dxfGroup = null
  }
  if (shadedGroup) {
    scene.remove(shadedGroup)
    disposeGroup(shadedGroup)
    shadedGroup = null
  }
  dxfMaterials?.disposeAll?.()
  dxfMaterials = null

  const pickingIndex = buildPickingIndex(dxf)
  const handles = pickingIndex.entries.map((e) => e.handle)
  const worldBox = getZoomBox(pickingIndex, handles, { originOffset: { x: 0, y: 0, z: 0 } })
  if (worldBox && !worldBox.isEmpty()) {
    const center = worldBox.getCenter(new THREE.Vector3())
    originOffset = { x: center.x, y: center.y, z: center.z }
  } else {
    originOffset = { x: 0, y: 0, z: 0 }
  }

  const annotationDxf = buildAnnotationOverlayDxf(dxf)
  if (annotationDxf) {
    const { group, materials, originOffset: annotOrigin } = await createThreeObjectsFromDXF(annotationDxf)
    dxfMaterials = materials
    dxfGroup = group
    group.position.set(
      (annotOrigin?.x ?? 0) - originOffset.x,
      (annotOrigin?.y ?? 0) - originOffset.y,
      (annotOrigin?.z ?? 0) - originOffset.z,
    )
    scene.add(group)
  }

  shadedGroup = new THREE.Group()
  shadedGroup.name = SHADED_GROUP
  const ox = originOffset.x
  const oy = originOffset.y
  if (addShadedMeshes(dxf, shadedGroup, ox, oy)) {
    scene.add(shadedGroup)
  } else {
    shadedGroup = null
  }

  applyLayerVisibility()
  applyHighlight(props.selectedHandles)
  if (fitCamera) {
    fitToDxf(dxf)
  } else if (props.cameraStateToRestore) {
    restoreCameraState(props.cameraStateToRestore)
  }
}

function initScene() {
  const el = containerRef.value
  if (!el) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(SCENE_BG_COLOR)

  const aspect = el.clientWidth / Math.max(el.clientHeight, 1)
  const frustum = 100
  camera = new THREE.OrthographicCamera(
    -frustum * aspect / 2,
    frustum * aspect / 2,
    frustum / 2,
    -frustum / 2,
    CAMERA_NEAR_PLANE,
    CAMERA_FAR_PLANE,
  )
  camera.position.set(0, 0, CAMERA_INITIAL_Z_POSITION)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)

  const controls = initControls(camera, renderer.domElement)
  controls.mouseButtons = {
    LEFT: -1,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  }
  controls.addEventListener('change', () => render())

  resizeObserver = new ResizeObserver(() => {
    handleResize(el, camera, renderer, scene, render)
  })
  resizeObserver.observe(el)
}

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
  return camera
}

function getCanvas() {
  return renderer?.domElement ?? null
}

function getOriginOffset() {
  return originOffset
}

function captureCameraState() {
  const controls = getControls()
  if (!camera || !controls) return null
  return {
    zoom: camera.zoom,
    worldTargetX: controls.target.x + originOffset.x,
    worldTargetY: controls.target.y + originOffset.y,
  }
}

function restoreCameraState(state) {
  const controls = getControls()
  if (!camera || !controls || !state) return
  camera.zoom = state.zoom
  controls.target.x = state.worldTargetX - originOffset.x
  controls.target.y = state.worldTargetY - originOffset.y
  camera.position.x = controls.target.x
  camera.position.y = controls.target.y
  camera.updateProjectionMatrix()
  controls.update()
  render()
}

function clearHighlight() {
  applyHighlight([])
}

function zoomToEntity(handles) {
  const pickingIndex = buildPickingIndex(props.dxf)
  const box = getZoomBox(pickingIndex, handles, { originOffset })
  if (!box || !camera) return
  const controls = getControls()
  const center = box.getCenter(new THREE.Vector3())
  controls?.target.set(center.x, center.y, 0)
  fitCameraToBox(box, camera)
  controls?.update()
  render()
}

function setControlsChangeListener(fn) {
  const controls = getControls()
  if (controlsChangeHandler && controls) {
    controls.removeEventListener('change', controlsChangeHandler)
  }
  controlsChangeHandler = fn ?? null
  if (fn && controls) controls.addEventListener('change', fn)
}

function pickAtClient(clientX, clientY) {
  if (!shadedGroup || !camera || !renderer) return null
  const canvas = renderer.domElement
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)

  const hits = raycaster.intersectObjects(shadedGroup.children, true)
  const candidates = []
  for (const hit of hits) {
    const mesh = hit.object
    if (!mesh.isMesh || !mesh.visible) continue
    const handle = normalizeHandle(mesh.userData.polyfaceHandle)
    if (!handle) continue
    candidates.push({ handle, dist: hit.distance, layer: mesh.userData.layerName ?? '0' })
  }
  if (!candidates.length) return null

  let best = candidates[0]
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].dist < best.dist) best = candidates[i]
  }

  return { handle: best.handle, layer: best.layer }
}

function meshWorldBbox(mesh) {
  const geo = mesh.geometry
  if (!geo.boundingBox) geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (!bb) return null
  const ox = originOffset.x
  const oy = originOffset.y
  return {
    minX: bb.min.x + ox,
    maxX: bb.max.x + ox,
    minY: bb.min.y + oy,
    maxY: bb.max.y + oy,
    centerX: (bb.min.x + bb.max.x) / 2 + ox,
    centerY: (bb.min.y + bb.max.y) / 2 + oy,
  }
}

function pickInRect(worldRect, mode) {
  if (!shadedGroup) return []
  const seen = new Set()
  const handles = []
  for (const mesh of shadedGroup.children) {
    if (!mesh.isMesh || !mesh.visible) continue
    const handle = normalizeHandle(mesh.userData.polyfaceHandle)
    if (!handle || seen.has(handle)) continue
    const bbox = meshWorldBbox(mesh)
    if (!bbox) continue
    const inside = mode === 'window'
      ? bbox.minX >= worldRect.minX && bbox.maxX <= worldRect.maxX
        && bbox.minY >= worldRect.minY && bbox.maxY <= worldRect.maxY
      : bbox.centerX >= worldRect.minX && bbox.centerX <= worldRect.maxX
        && bbox.centerY >= worldRect.minY && bbox.centerY <= worldRect.maxY
    if (!inside) continue
    seen.add(handle)
    handles.push(handle)
  }
  return handles
}

onMounted(async () => {
  initScene()
  await rebuildScene(props.dxf)
  emit('ready')
})

watch(() => props.dxf, async (dxf) => {
  if (!dxf || !scene) return
  const preserveCamera = props.cameraStateToRestore
  await rebuildScene(dxf, { fitCamera: !preserveCamera })
  emit('ready')
})

watch(() => props.hiddenLayers, () => {
  applyLayerVisibility()
  if (shadedGroup) applyHighlight(props.selectedHandles)
  render()
}, { deep: true })

watch(() => props.selectedHandles, (handles) => {
  applyHighlight(handles)
}, { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  const controls = getControls()
  if (controlsChangeHandler && controls) {
    controls.removeEventListener('change', controlsChangeHandler)
  }
  cleanupControls()
  if (dxfGroup) disposeGroup(dxfGroup)
  if (shadedGroup) disposeGroup(shadedGroup)
  dxfMaterials?.disposeAll?.()
  renderer?.dispose()
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
})

function partWorldCenter(handle) {
  if (!shadedGroup) return null
  const target = normalizeHandle(handle)
  if (!target) return null
  for (const mesh of shadedGroup.children) {
    if (!mesh.isMesh) continue
    if (normalizeHandle(mesh.userData.polyfaceHandle) !== target) continue
    return meshWorldBbox(mesh)
  }
  return null
}

defineExpose({
  getContainerEl: () => containerRef.value,
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
  pickAtClient,
  pickInRect,
  partWorldCenter,
})
</script>

<template>
  <div ref="containerRef" class="plan-view-3d">
    <div
      v-if="showLayerPanel && layers.length"
      class="plan-view-3d__layers viewer-layer-stack"
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
.plan-view-3d {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.plan-view-3d__layers {
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
