<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import {
  useCamera,
  useControls,
  createThreeObjectsFromDXF,
  resolveSelectionMode,
  SCENE_BG_COLOR,
  CAMERA_INITIAL_Z_POSITION,
  CAMERA_NEAR_PLANE,
  CAMERA_FAR_PLANE,
} from 'dxf-vuer'
import { readPartColor } from '../partColors.js'
import PartMetadataPanel from './PartMetadataPanel.vue'
import {
  applyMetadataUpdate,
  panelMetaForDescriptor,
} from '../features/metadata/meshMetadataSelection.js'

const MESH_COLOR = 0x9aa7b4
const FALLBACK_UNASSIGNED_COLOR = 0xdc2626
const DRAG_THRESHOLD_PX = 4
const MIN_RECT_SELECT_PX = 10

const props = defineProps({
  meshes: { type: Array, default: () => [] },
  unassignedMeshes: { type: Array, default: () => [] },
  annotationDxf: { type: Object, default: null },
  partDescriptors: { type: Array, default: () => [] },
  clickForProperties: { type: Boolean, default: false },
  showPropertiesPanel: { type: Boolean, default: false },
  modifiedHandles: { type: Array, default: () => [] },
  showModifiedPartsGreen: { type: Boolean, default: false },
  unassignedPartIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['mark-modified'])

const metadataOverrides = defineModel('metadataOverrides', { default: () => ({}) })

const containerRef = ref(null)
const selectedPartIds = ref([])
const panelWorldPoint = ref(null)
const selectionRect = ref(null)
const cameraTick = ref(0)

const { fitCameraToBox, handleResize } = useCamera()
const { initControls, getControls, cleanup: cleanupControls } = useControls()

const geometryLoader = new THREE.BufferGeometryLoader()
const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()

let renderer = null
let scene = null
let camera = null
let meshGroup = null
let unassignedGroup = null
let annotGroup = null
let annotMaterials = null
let resizeObserver = null
let leftPointerDown = false
let pointerDownStart = { x: 0, y: 0 }
let pointerDragged = false

const _boxCorner = new THREE.Vector3()
const _projected = new THREE.Vector3()

const propertiesPanelEnabled = computed(
  () => props.clickForProperties || props.showPropertiesPanel,
)

const descriptorById = computed(() => {
  const map = new Map()
  for (const d of props.partDescriptors) map.set(d.id, d)
  return map
})

const selectionPanelMeta = computed(() => {
  const ids = selectedPartIds.value
  if (!ids.length) {
    return { nr: '', mat: '', anz: '' }
  }
  const metas = ids.map((id) => {
    const descriptor = descriptorById.value.get(id)
    if (!descriptor) return { nr: '', mat: '', anz: '' }
    const panel = panelMetaForDescriptor(descriptor, metadataOverrides.value)
    return { nr: panel.nr, mat: panel.mat, anz: panel.anz }
  })
  const agg = (key) => {
    const vals = metas.map((m) => m[key])
    return vals.every((v) => v === vals[0]) ? vals[0] : '<varies>'
  }
  return {
    nr: agg('nr'),
    mat: agg('mat'),
    anz: agg('anz'),
  }
})

const panelScreenPos = computed(() => {
  cameraTick.value
  if (!panelWorldPoint.value || !camera || !containerRef.value) return null
  const rect = containerRef.value.getBoundingClientRect()
  const v = new THREE.Vector3(
    panelWorldPoint.value.x,
    panelWorldPoint.value.y,
    panelWorldPoint.value.z ?? 0,
  )
  v.project(camera)
  return {
    left: (v.x + 1) * 0.5 * rect.width,
    top: (-v.y + 1) * 0.5 * rect.height,
  }
})

const showMetadataPanel = computed(
  () => propertiesPanelEnabled.value
    && selectedPartIds.value.length > 0
    && panelScreenPos.value != null,
)

const metadataPanelStyle = computed(() => {
  const pos = panelScreenPos.value
  if (!pos) return undefined
  return { left: `${pos.left}px`, top: `${pos.top}px` }
})

function render() {
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function disposeGroup(group) {
  group?.traverse((node) => {
    node.geometry?.dispose()
    node.material?.dispose()
  })
}

function meshBaseColor(partId) {
  if (props.showModifiedPartsGreen && props.modifiedHandles.includes(partId)) {
    return readPartColor('green') || MESH_COLOR
  }
  if (props.unassignedPartIds.includes(partId)) {
    return readPartColor('red') || FALLBACK_UNASSIGNED_COLOR
  }
  return MESH_COLOR
}

function buildMeshes(meshes, baseColor, { tagParts = true } = {}) {
  const group = new THREE.Group()
  for (let i = 0; i < meshes.length; i++) {
    const json = meshes[i]
    let geometry
    try {
      geometry = geometryLoader.parse(json)
    } catch {
      continue
    }
    if (!geometry) continue
    geometry.computeVertexNormals()

    const descriptor = props.partDescriptors[i]
    const partId = descriptor?.id ?? `mesh:${i}`
    const color = tagParts ? meshBaseColor(partId) : baseColor

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.05,
      roughness: 0.85,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    if (tagParts) {
      mesh.userData.partId = partId
      mesh.userData.meshIndex = i
      mesh.userData.baseColor = color
    }
    group.add(mesh)
  }
  return group
}

function refreshMeshBaseColors() {
  if (!meshGroup) return
  for (const mesh of meshGroup.children) {
    if (!mesh.isMesh) continue
    const partId = mesh.userData.partId
    const color = meshBaseColor(partId)
    mesh.userData.baseColor = color
    if (!selectedPartIds.value.includes(partId)) {
      mesh.material?.color?.set(color)
    }
  }
  render()
}

function applyHighlight(selectedIds) {
  if (!meshGroup) return
  const selected = new Set(selectedIds)
  const highlightColor = new THREE.Color(readPartColor('orange'))
  for (const mesh of meshGroup.children) {
    if (!mesh.isMesh) continue
    const partId = mesh.userData.partId
    const mat = mesh.material
    if (!mat?.color) continue
    if (selected.has(partId)) mat.color.copy(highlightColor)
    else mat.color.set(mesh.userData.baseColor)
  }
  render()
}

function meshWorldCenter(partId) {
  if (!meshGroup) return null
  for (const mesh of meshGroup.children) {
    if (!mesh.isMesh || mesh.userData.partId !== partId) continue
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const bb = mesh.geometry.boundingBox
    if (!bb) return null
    const center = new THREE.Vector3()
    bb.getCenter(center)
    mesh.localToWorld(center)
    return { x: center.x, y: center.y, z: center.z }
  }
  return null
}

function fitToContent() {
  if (!camera) return
  const box = new THREE.Box3()
  if (meshGroup?.children.length) box.expandByObject(meshGroup)
  if (unassignedGroup?.children.length) box.expandByObject(unassignedGroup)
  if (annotGroup) box.expandByObject(annotGroup)
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const controls = getControls()
  controls?.target.set(center.x, center.y, center.z)
  fitCameraToBox(box, camera)
  controls?.update()
  render()
}

async function rebuild(meshes, unassignedMeshes, annotationDxf) {
  if (!scene) return

  if (meshGroup) {
    scene.remove(meshGroup)
    disposeGroup(meshGroup)
    meshGroup = null
  }
  if (unassignedGroup) {
    scene.remove(unassignedGroup)
    disposeGroup(unassignedGroup)
    unassignedGroup = null
  }
  if (annotGroup) {
    scene.remove(annotGroup)
    disposeGroup(annotGroup)
    annotGroup = null
  }
  annotMaterials?.disposeAll?.()
  annotMaterials = null

  meshGroup = buildMeshes(meshes, MESH_COLOR, { tagParts: true })
  if (meshGroup.children.length) scene.add(meshGroup)

  const unassignedColor = readPartColor('red') || FALLBACK_UNASSIGNED_COLOR
  unassignedGroup = buildMeshes(unassignedMeshes, unassignedColor, { tagParts: false })
  if (unassignedGroup.children.length) scene.add(unassignedGroup)

  if (annotationDxf) {
    try {
      const { group, materials, originOffset } = await createThreeObjectsFromDXF(annotationDxf)
      annotMaterials = materials
      annotGroup = group
      annotGroup.position.set(
        originOffset?.x ?? 0,
        originOffset?.y ?? 0,
        originOffset?.z ?? 0,
      )
      annotGroup.renderOrder = 1
      scene.add(annotGroup)
    } catch {
      annotMaterials?.disposeAll?.()
      annotMaterials = null
      annotGroup = null
    }
  }

  applyHighlight(selectedPartIds.value)
  fitToContent()
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.65))
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9)
  keyLight.position.set(-0.5, 0.7, 1)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
  fillLight.position.set(0.6, -0.7, 0.8)
  scene.add(fillLight)

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
  controls.addEventListener('change', () => {
    cameraTick.value++
    render()
  })

  resizeObserver = new ResizeObserver(() => {
    handleResize(el, camera, renderer, scene, render)
  })
  resizeObserver.observe(el)
}

function pickAtClient(clientX, clientY) {
  if (!meshGroup || !camera || !renderer) return null
  const canvas = renderer.domElement
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)

  const hits = raycaster.intersectObjects(meshGroup.children, true)
  for (const hit of hits) {
    const mesh = hit.object
    if (!mesh.isMesh || !mesh.visible) continue
    const partId = mesh.userData.partId
    if (!partId) continue
    return { partId, point: hit.point.clone() }
  }
  return null
}

function isAdditiveModifier(e) {
  return e.shiftKey || e.ctrlKey || e.metaKey
}

function mergePartIds(existing, added) {
  const seen = new Set(existing)
  const out = [...existing]
  for (const id of added) {
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function meshScreenBbox(mesh) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  const worldBox = new THREE.Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
  const container = containerRef.value
  if (!container || !camera) return null
  const containerRect = container.getBoundingClientRect()
  if (!containerRect.width || !containerRect.height) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const { min, max } = worldBox
  const xs = [min.x, max.x]
  const ys = [min.y, max.y]
  const zs = [min.z, max.z]

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        _boxCorner.set(x, y, z)
        _projected.copy(_boxCorner).project(camera)
        const left = (_projected.x + 1) * 0.5 * containerRect.width
        const top = (-_projected.y + 1) * 0.5 * containerRect.height
        minX = Math.min(minX, left)
        minY = Math.min(minY, top)
        maxX = Math.max(maxX, left)
        maxY = Math.max(maxY, top)
      }
    }
  }

  if (!Number.isFinite(minX)) return null
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

function screenBboxMatchesRect(bbox, rect, mode) {
  if (mode === 'window') {
    return bbox.minX >= rect.left && bbox.maxX <= rect.right
      && bbox.minY >= rect.top && bbox.maxY <= rect.bottom
  }
  return bbox.maxX >= rect.left && bbox.minX <= rect.right
    && bbox.maxY >= rect.top && bbox.minY <= rect.bottom
}

function pickInClientRect(x1, y1, x2, y2) {
  if (!meshGroup || !containerRef.value) return []
  const shellRect = containerRef.value.getBoundingClientRect()
  const mode = resolveSelectionMode('auto', { x: x1, y: y1 }, { x: x2, y: y2 })
  const left = Math.min(x1, x2) - shellRect.left
  const top = Math.min(y1, y2) - shellRect.top
  const right = Math.max(x1, x2) - shellRect.left
  const bottom = Math.max(y1, y2) - shellRect.top
  const rect = { left, top, right, bottom }

  const ids = []
  const seen = new Set()
  for (const mesh of meshGroup.children) {
    if (!mesh.isMesh || !mesh.visible) continue
    const partId = mesh.userData.partId
    if (!partId || seen.has(partId)) continue
    const bbox = meshScreenBbox(mesh)
    if (!bbox || !screenBboxMatchesRect(bbox, rect, mode)) continue
    seen.add(partId)
    ids.push(String(partId))
  }
  return ids
}

function updateSelectionRect(clientX, clientY) {
  const shell = containerRef.value
  if (!shell) return
  const shellRect = shell.getBoundingClientRect()
  const mode = resolveSelectionMode('auto', pointerDownStart, { x: clientX, y: clientY })
  const x1 = pointerDownStart.x - shellRect.left
  const y1 = pointerDownStart.y - shellRect.top
  const x2 = clientX - shellRect.left
  const y2 = clientY - shellRect.top
  selectionRect.value = {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    mode,
  }
}

function selectionAnchorFromPartIds(partIds) {
  const centers = []
  for (const id of partIds) {
    const center = meshWorldCenter(id)
    if (center) centers.push(center)
  }
  if (!centers.length) return null
  return {
    x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
    y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
    z: centers.reduce((sum, c) => sum + (c.z ?? 0), 0) / centers.length,
  }
}

function setSelection(partIds, { panelAt, additive = false } = {}) {
  const picked = partIds.map(String)
  const next = additive ? mergePartIds(selectedPartIds.value, picked) : picked
  selectedPartIds.value = next
  if (panelAt) {
    panelWorldPoint.value = panelAt
  } else if (next.length) {
    panelWorldPoint.value = selectionAnchorFromPartIds(next) ?? meshWorldCenter(next[0])
  } else {
    panelWorldPoint.value = null
  }
  applyHighlight(selectedPartIds.value)
}

function clearSelection() {
  setSelection([])
}

function onMetadataUpdate(field, value) {
  const ids = selectedPartIds.value
  if (!ids.length) return
  const { overrides, targets } = applyMetadataUpdate({
    selectedIds: ids,
    field,
    value,
    metadataOverrides: metadataOverrides.value,
    partDescriptors: props.partDescriptors,
  })
  metadataOverrides.value = overrides
  for (const id of targets) emit('mark-modified', id)
  refreshMeshBaseColors()
  applyHighlight(selectedPartIds.value)
}

function selectPartByHandle(partId) {
  const id = String(partId)
  if (!descriptorById.value.has(id) && !meshGroup?.children.some((m) => m.userData?.partId === id)) {
    return false
  }
  const center = meshWorldCenter(id)
  setSelection([id], {
    panelAt: center ? { x: center.x, y: center.y, z: center.z } : undefined,
  })
  return true
}

function onPointerDown(e) {
  if (e.button !== 0) return
  leftPointerDown = true
  pointerDragged = false
  pointerDownStart = { x: e.clientX, y: e.clientY }
  selectionRect.value = null
  if (propertiesPanelEnabled.value) {
    e.currentTarget.setPointerCapture(e.pointerId)
  }
}

function onPointerMove(e) {
  if (!leftPointerDown || !(e.buttons & 1)) return
  if (!propertiesPanelEnabled.value) return
  if (Math.hypot(e.clientX - pointerDownStart.x, e.clientY - pointerDownStart.y) > DRAG_THRESHOLD_PX) {
    pointerDragged = true
    updateSelectionRect(e.clientX, e.clientY)
  }
}

function onPointerUp(e) {
  if (e.button !== 0 || !leftPointerDown) return
  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  leftPointerDown = false
  selectionRect.value = null

  if (!propertiesPanelEnabled.value) return

  const dragDistance = Math.hypot(e.clientX - pointerDownStart.x, e.clientY - pointerDownStart.y)
  const rectW = Math.abs(e.clientX - pointerDownStart.x)
  const rectH = Math.abs(e.clientY - pointerDownStart.y)
  if (dragDistance > DRAG_THRESHOLD_PX && Math.max(rectW, rectH) >= MIN_RECT_SELECT_PX) {
    const rectPicked = pickInClientRect(
      pointerDownStart.x,
      pointerDownStart.y,
      e.clientX,
      e.clientY,
    )
    const additive = isAdditiveModifier(e)
    setSelection(rectPicked, {
      additive,
      panelAt: rectPicked.length ? selectionAnchorFromPartIds(rectPicked) : undefined,
    })
    return
  }

  const pick = pickAtClient(e.clientX, e.clientY)
  if (!pick) {
    if (!isAdditiveModifier(e)) clearSelection()
    return
  }

  if (isAdditiveModifier(e)) {
    const current = selectedPartIds.value
    const removing = current.includes(pick.partId)
    const next = removing
      ? current.filter((id) => id !== pick.partId)
      : [...current, pick.partId]
    setSelection(next, {
      panelAt: { x: pick.point.x, y: pick.point.y, z: pick.point.z },
    })
    return
  }

  setSelection([pick.partId], {
    panelAt: { x: pick.point.x, y: pick.point.y, z: pick.point.z },
  })
}

function onPointerCancel(e) {
  if (!leftPointerDown) return
  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  leftPointerDown = false
  selectionRect.value = null
}

function onPointerLeave() {
  if (leftPointerDown) return
  selectionRect.value = null
}

function getCamera() {
  return camera
}

function getCanvas() {
  return renderer?.domElement ?? null
}

function getOriginOffset() {
  return { x: 0, y: 0, z: 0 }
}

function resize() {
  const el = containerRef.value
  if (el && camera && renderer) {
    handleResize(el, camera, renderer, scene, render)
  }
}

defineExpose({
  pickAtClient,
  getCamera,
  getCanvas,
  getOriginOffset,
  selectPartByHandle,
  resize,
})

watch(
  () => [props.meshes, props.unassignedMeshes, props.annotationDxf, props.partDescriptors],
  ([meshes, unassignedMeshes, annotationDxf]) => {
    if (!scene) return
    rebuild(meshes, unassignedMeshes, annotationDxf)
  },
  { deep: true },
)

watch(
  () => [props.modifiedHandles, props.showModifiedPartsGreen, props.unassignedPartIds],
  () => {
    refreshMeshBaseColors()
    applyHighlight(selectedPartIds.value)
  },
  { deep: true },
)

watch(() => props.clickForProperties, (on) => {
  if (!on) clearSelection()
})

watch(() => props.partDescriptors, (descriptors, prev) => {
  if (!prev?.length && descriptors.length) return
  const valid = new Set(descriptors.map((d) => d.id))
  const pruned = selectedPartIds.value.filter((id) => valid.has(id))
  if (pruned.length !== selectedPartIds.value.length) {
    setSelection(pruned)
  }
}, { deep: true })

onMounted(async () => {
  initScene()
  await rebuild(props.meshes, props.unassignedMeshes, props.annotationDxf)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cleanupControls()
  if (meshGroup) disposeGroup(meshGroup)
  if (unassignedGroup) disposeGroup(unassignedGroup)
  if (annotGroup) disposeGroup(annotGroup)
  annotMaterials?.disposeAll?.()
  renderer?.dispose()
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="three-mesh-viewer"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="onPointerLeave"
  >
    <PartMetadataPanel
      v-if="showMetadataPanel"
      :nr="selectionPanelMeta.nr"
      :mat="selectionPanelMeta.mat"
      :anz="selectionPanelMeta.anz"
      :style="metadataPanelStyle"
      @update="onMetadataUpdate"
    />
    <div
      v-if="selectionRect"
      class="selection-rect"
      :class="`selection-rect--${selectionRect.mode}`"
      :style="{
        left: selectionRect.left + 'px',
        top: selectionRect.top + 'px',
        width: selectionRect.width + 'px',
        height: selectionRect.height + 'px',
      }"
    />
  </div>
</template>

<style scoped>
.three-mesh-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.selection-rect {
  position: absolute;
  pointer-events: none;
  border: 1px solid #4a90d9;
  background: rgba(74, 144, 217, 0.12);
  z-index: 2;
}

.selection-rect--crossing {
  border-style: dashed;
  border-color: #3d9e5a;
  background: rgba(61, 158, 90, 0.12);
}
</style>
