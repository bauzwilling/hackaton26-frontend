/**
 * Three.js orthographic viewer for Rhino File3dm meshes.
 * No compute API — receives decoded docs from compute.js via the Vue viewer.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EdgesGeometry } from 'three'
import { loadRhino } from './compute.js'

const VIEW_SIZE = 2000
const FIT_PADDING = 1.2
const MIN_FRUSTUM_SIZE = 1
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(-1390, 640, 2060).normalize()

const DATAB_FUNCTION_KEY = 'DATAB_FUNCTION'
const FILM_FUNCTIONS = new Set(['S', 'T', 'R'])

const MATERIAL_COLORS = {
  film: 0x332b0f,
  kiefer: 0xf6f3d7,
}

/** @param {HTMLElement} el */
function viewerBackgroundFromEl(el) {
  return getComputedStyle(el).getPropertyValue('--color-viewer-background').trim() || '#333333'
}

/** @param {object} rhinoObject - rhino3dm RhinoObject */
function getDatabFunction(rhinoObject) {
  const fromAttrs = rhinoObject.attributes()?.getUserString(DATAB_FUNCTION_KEY)
  if (fromAttrs) return fromAttrs.trim()
  const geom = rhinoObject.geometry()
  return geom?.getUserString?.(DATAB_FUNCTION_KEY)?.trim() ?? ''
}

/** @param {object} rhinoObject - rhino3dm RhinoObject */
function isFilmPiece(rhinoObject) {
  return FILM_FUNCTIONS.has(getDatabFunction(rhinoObject))
}

/**
 * Create a WebGL scene bound to a DOM container.
 * @param {HTMLElement} containerEl - Element that hosts the canvas
 * @returns {{ showDoc: Function, resize: Function, dispose: Function, getAspect: Function }}
 */
export function createViewerScene(containerEl) {
  let scene
  let camera
  let renderer
  let controls
  let rafId = 0
  let resizeObserver = null
  let modelRoot = null
  const sceneObjects = []
  /** @type {THREE.MeshBasicMaterial[]} Shared materials from the current showDoc load */
  let sharedMeshMaterials = []

  const _box = new THREE.Box3()
  const _sphere = new THREE.Sphere()
  const _center = new THREE.Vector3()
  const _corner = new THREE.Vector3()

  /**
   * Convert a Rhino mesh to Three.js BufferGeometry via rhino3dm JSON.
   * @param {object} mesh - rhino3dm Mesh
   * @returns {THREE.BufferGeometry|null}
   */
  function meshToGeometry(mesh) {
    const json = mesh.toThreejsJSON()
    const positions = json.data?.attributes?.position?.array
    if (!positions?.length) return null

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    const indices = json.data?.index?.array
    if (indices?.length) {
      geometry.setIndex(indices)
    }

    geometry.computeVertexNormals()
    return geometry
  }

  /** Release GPU resources for a mesh or edge helper */
  function disposeObject3D(obj) {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
    } else if (obj instanceof THREE.LineSegments) {
      obj.geometry.dispose()
      obj.material.dispose()
    }
  }

  /** Remove all model meshes from the scene */
  function clearSceneMeshes() {
    if (!scene) return
    for (const obj of sceneObjects) {
      disposeObject3D(obj)
    }
    sceneObjects.length = 0
    for (const material of sharedMeshMaterials) {
      material.dispose()
    }
    sharedMeshMaterials = []
    if (modelRoot) {
      scene.remove(modelRoot)
      modelRoot = null
    }
  }

  /** Default orthographic frustum when no model is loaded */
  function applyFallbackFrustum(aspect) {
    camera.left = -VIEW_SIZE * aspect
    camera.right = VIEW_SIZE * aspect
    camera.top = VIEW_SIZE
    camera.bottom = -VIEW_SIZE
    camera.updateProjectionMatrix()
  }

  /**
   * Fit orthographic camera to model bounds (optionally reposition camera).
   * @param {THREE.Object3D} root - Model group root
   * @param {number} viewportAspect - width / height
   * @param {{ reposition?: boolean }} options
   */
  function fitOrthoToModel(root, viewportAspect, options) {
    if (!camera || !controls) return

    root.updateWorldMatrix(true, true)
    _box.setFromObject(root)
    if (_box.isEmpty()) return

    _box.getCenter(_center)

    if (options?.reposition) {
      controls.target.copy(_center)
      _box.getBoundingSphere(_sphere)
      const distance = Math.max(_sphere.radius * 4, MIN_FRUSTUM_SIZE * 4)
      camera.position.copy(_center).addScaledVector(DEFAULT_VIEW_DIRECTION, distance)
      camera.lookAt(_center)
    }

    camera.updateMatrixWorld()
    const inv = camera.matrixWorldInverse

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    // Project all 8 bbox corners into camera space to size the orthographic frustum
    const { min, max } = _box
    for (let xi = 0; xi < 2; xi++) {
      for (let yi = 0; yi < 2; yi++) {
        for (let zi = 0; zi < 2; zi++) {
          _corner.set(xi ? max.x : min.x, yi ? max.y : min.y, zi ? max.z : min.z)
          _corner.applyMatrix4(inv)
          minX = Math.min(minX, _corner.x)
          maxX = Math.max(maxX, _corner.x)
          minY = Math.min(minY, _corner.y)
          maxY = Math.max(maxY, _corner.y)
        }
      }
    }

    let width = Math.max((maxX - minX) * FIT_PADDING, MIN_FRUSTUM_SIZE)
    let height = Math.max((maxY - minY) * FIT_PADDING, MIN_FRUSTUM_SIZE)

    if (width / height > viewportAspect) {
      height = width / viewportAspect
    } else {
      width = height * viewportAspect
    }

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const halfW = width / 2
    const halfH = height / 2

    camera.left = cx - halfW
    camera.right = cx + halfW
    camera.top = cy + halfH
    camera.bottom = cy - halfH

    camera.near = 0.1
    camera.far = 100000

    if (options?.reposition) {
      camera.zoom = 1
    }
    camera.updateProjectionMatrix()
    controls.update()
  }

  /** Container width / height for aspect ratio */
  function getAspect() {
    if (!containerEl || containerEl.clientHeight === 0) return 1
    return containerEl.clientWidth / containerEl.clientHeight
  }

  /** Resize renderer and refit camera to model or fallback frustum */
  function resize() {
    if (!containerEl || !renderer || !camera) return

    const w = containerEl.clientWidth
    const h = containerEl.clientHeight
    if (w === 0 || h === 0) return

    const aspect = w / h
    if (modelRoot && sceneObjects.length > 0) {
      fitOrthoToModel(modelRoot, aspect, { reposition: false })
    } else {
      applyFallbackFrustum(aspect)
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false)
  }

  /**
   * Load meshes from a Rhino File3dm into the scene (Z-up → Y-up).
   * @param {object} doc - rhino3dm File3dm
   */
  async function showDoc(doc) {
    const rhino = await loadRhino()
    clearSceneMeshes()

    const modelGroup = new THREE.Group()
    modelGroup.rotation.x = -Math.PI / 2
    scene.add(modelGroup)
    modelRoot = modelGroup

    const meshMaterialOptions = {
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    }
    const filmMaterial = new THREE.MeshBasicMaterial({
      ...meshMaterialOptions,
      color: MATERIAL_COLORS.film,
    })
    const kieferMaterial = new THREE.MeshBasicMaterial({
      ...meshMaterialOptions,
      color: MATERIAL_COLORS.kiefer,
    })
    sharedMeshMaterials = [filmMaterial, kieferMaterial]

    const objects = doc.objects()
    for (let i = 0; i < objects.count; i++) {
      const rhinoObject = objects.get(i)
      const attrs = rhinoObject.attributes()
      const geom = rhinoObject.geometry()
      console.log(`mesh ${i}`, {
        attrUserStringCount: attrs.userStringCount,
        geomUserStringCount: geom.userStringCount,
        attrUserStrings: attrs.getUserStrings?.(),
        geomUserStrings: geom.getUserStrings?.(),
        DATAB_FUNCTION_attr: attrs.getUserString('DATAB_FUNCTION'),
        DATAB_FUNCTION_geom: geom.getUserString('DATAB_FUNCTION'),
        isFilm: isFilmPiece(rhinoObject),
      })
      if (!(geom instanceof rhino.Mesh)) continue

      const geometry = meshToGeometry(geom)
      if (!geometry) continue

      const material = isFilmPiece(rhinoObject) ? filmMaterial : kieferMaterial
      const mesh = new THREE.Mesh(geometry, material)
      modelGroup.add(mesh)
      sceneObjects.push(mesh)

      const edgesGeometry = new EdgesGeometry(geometry, 30)
      const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 })
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial)
      mesh.add(edges)
      sceneObjects.push(edges)
    }

    if (sceneObjects.length > 0 && modelRoot) {
      requestAnimationFrame(() => {
        if (modelRoot && sceneObjects.length > 0) {
          fitOrthoToModel(modelRoot, getAspect(), { reposition: true })
        }
      })
    }
  }

  /** Initialize scene, camera, renderer, controls, and render loop */
  function init() {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(viewerBackgroundFromEl(containerEl))

    const w = containerEl.clientWidth || 400
    const h = containerEl.clientHeight || 300
    const aspect = w / h

    camera = new THREE.OrthographicCamera(
      -VIEW_SIZE * aspect,
      VIEW_SIZE * aspect,
      VIEW_SIZE,
      -VIEW_SIZE,
      0.1,
      100000,
    )
    camera.position.set(-775, 1375, 1550)
    camera.lookAt(615, 735, -510)
    camera.updateProjectionMatrix()

    renderer = new THREE.WebGLRenderer({ antialias: true })
    containerEl.appendChild(renderer.domElement)
    resize()

    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.update()

    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(containerEl)

    const tick = () => {
      rafId = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()
  }

  /** Tear down WebGL and observers */
  function dispose() {
    cancelAnimationFrame(rafId)
    resizeObserver?.disconnect()
    resizeObserver = null
    clearSceneMeshes()
    controls?.dispose()
    renderer?.dispose()
  }

  init()

  return {
    showDoc,
    clearSceneMeshes,
    resize,
    dispose,
    getAspect,
  }
}
