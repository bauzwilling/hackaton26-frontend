import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface ThreeSceneState {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
}

export function createViewerScene(element: HTMLElement): ThreeSceneState {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf5f5f5)
  const aspect = element.clientWidth / Math.max(element.clientHeight, 1)
  const camera = new THREE.OrthographicCamera(-50 * aspect, 50 * aspect, 50, -50, -100000, 100000)
  camera.position.set(0, 0, 1000)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(element.clientWidth, element.clientHeight)
  element.appendChild(renderer.domElement)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableRotate = false
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
  controls.addEventListener('change', () => renderer.render(scene, camera))
  return { scene, camera, renderer, controls }
}

export function resizeViewer(element: HTMLElement, state: ThreeSceneState) {
  const aspect = element.clientWidth / Math.max(element.clientHeight, 1)
  const halfHeight = (state.camera.top - state.camera.bottom) / 2
  const centerX = (state.camera.left + state.camera.right) / 2
  state.camera.left = centerX - halfHeight * aspect
  state.camera.right = centerX + halfHeight * aspect
  state.camera.updateProjectionMatrix()
  state.renderer.setSize(element.clientWidth, element.clientHeight)
  state.renderer.render(state.scene, state.camera)
}

export function fitGroup(state: ThreeSceneState, group: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const aspect = state.renderer.domElement.clientWidth / Math.max(state.renderer.domElement.clientHeight, 1)
  const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect), 1) * 1.08
  state.camera.left = -halfHeight * aspect
  state.camera.right = halfHeight * aspect
  state.camera.top = halfHeight
  state.camera.bottom = -halfHeight
  state.camera.position.set(center.x, center.y, 1000)
  state.controls.target.set(center.x, center.y, 0)
  state.camera.updateProjectionMatrix()
  state.controls.update()
}

export function disposeObject(object: THREE.Object3D | null) {
  object?.traverse((node: any) => {
    node.geometry?.dispose?.()
    if (Array.isArray(node.material)) node.material.forEach((material: any) => material.dispose?.())
    else node.material?.dispose?.()
  })
}

export function entityHandle(node: THREE.Object3D): string {
  const data = node.userData
  return String(data.handle ?? data.entity?.handle ?? data.entityHandle ?? '').trim()
}

export function entityLayer(node: THREE.Object3D): string {
  const data = node.userData
  return String(data.layerName ?? data.layer ?? data.entity?.layer ?? '0')
}
