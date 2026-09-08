import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadRhino } from "./loadRhino";

const VIEW_SIZE = 2000;
const FIT_PADDING = 1.2;
const MIN_FRUSTUM_SIZE = 1;
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(-1390, 640, 2060).normalize();

const DATAB_FUNCTION_KEY = "DATAB_FUNCTION";
const DATAB_PART_NAME_KEY = "DATAB_PART_NAME";
const FILM_FUNCTIONS = new Set(["S", "T", "R"]);

const MATERIAL_COLORS = {
  film: 0x332b0f,
  kiefer: 0xf6f3d7,
};

function viewerBackgroundFromEl(el: HTMLElement): string {
  return (
    getComputedStyle(el).getPropertyValue("--color-viewer-background").trim() ||
    "#333333"
  );
}

function userString(rhinoObject: { attributes?: () => { getUserString?: (key: string) => string }; geometry?: () => { getUserString?: (key: string) => string } }, key: string): string {
  const fromAttrs = rhinoObject.attributes?.()?.getUserString?.(key);
  if (fromAttrs) return fromAttrs.trim();
  return rhinoObject.geometry?.()?.getUserString?.(key)?.trim() ?? "";
}

function isFilmPiece(rhinoObject: {
  attributes?: () => { getUserString?: (key: string) => string };
  geometry?: () => { getUserString?: (key: string) => string };
}): boolean {
  const partName = userString(rhinoObject, DATAB_PART_NAME_KEY);
  if (partName) return partName.toLowerCase() === "film";
  const param = userString(rhinoObject, "ghParamName");
  if (/-F-JW(?:-preview)?$/i.test(param) || /Geometry-F$/i.test(param)) return true;
  if (/-K-JW(?:-preview)?$/i.test(param) || /Geometry-K$/i.test(param)) return false;
  return FILM_FUNCTIONS.has(userString(rhinoObject, DATAB_FUNCTION_KEY));
}

function meshToGeometry(mesh: { toThreejsJSON: () => { data?: { attributes?: { position?: { array?: number[] } }; index?: { array?: number[] } } } }): THREE.BufferGeometry | null {
  const json = mesh.toThreejsJSON();
  const positions = json.data?.attributes?.position?.array;
  if (!positions?.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const indices = json.data?.index?.array;
  if (indices?.length) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createViewerScene(containerEl: HTMLElement) {
  let scene: THREE.Scene;
  let camera: THREE.OrthographicCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let rafId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let modelRoot: THREE.Group | null = null;
  const sceneObjects: THREE.Object3D[] = [];
  let sharedMeshMaterials: THREE.MeshBasicMaterial[] = [];

  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  const center = new THREE.Vector3();
  const corner = new THREE.Vector3();

  function disposeObject3D(obj: THREE.Object3D) {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    } else if (obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }

  function clearSceneMeshes() {
    if (!scene) return;
    for (const obj of sceneObjects) disposeObject3D(obj);
    sceneObjects.length = 0;
    for (const material of sharedMeshMaterials) material.dispose();
    sharedMeshMaterials = [];
    if (modelRoot) {
      scene.remove(modelRoot);
      modelRoot = null;
    }
  }

  function applyFallbackFrustum(aspect: number) {
    camera.left = -VIEW_SIZE * aspect;
    camera.right = VIEW_SIZE * aspect;
    camera.top = VIEW_SIZE;
    camera.bottom = -VIEW_SIZE;
    camera.updateProjectionMatrix();
  }

  function fitOrthoToModel(root: THREE.Object3D, viewportAspect: number, options?: { reposition?: boolean }) {
    if (!camera || !controls) return;
    root.updateWorldMatrix(true, true);
    box.setFromObject(root);
    if (box.isEmpty()) return;
    box.getCenter(center);

    if (options?.reposition) {
      controls.target.copy(center);
      box.getBoundingSphere(sphere);
      const distance = Math.max(sphere.radius * 4, MIN_FRUSTUM_SIZE * 4);
      camera.position.copy(center).addScaledVector(DEFAULT_VIEW_DIRECTION, distance);
      camera.lookAt(center);
    }

    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const { min, max } = box;
    for (let xi = 0; xi < 2; xi++) {
      for (let yi = 0; yi < 2; yi++) {
        for (let zi = 0; zi < 2; zi++) {
          corner.set(xi ? max.x : min.x, yi ? max.y : min.y, zi ? max.z : min.z);
          corner.applyMatrix4(inv);
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y);
          maxY = Math.max(maxY, corner.y);
        }
      }
    }

    let width = Math.max((maxX - minX) * FIT_PADDING, MIN_FRUSTUM_SIZE);
    let height = Math.max((maxY - minY) * FIT_PADDING, MIN_FRUSTUM_SIZE);
    if (width / height > viewportAspect) height = width / viewportAspect;
    else width = height * viewportAspect;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    camera.left = cx - width / 2;
    camera.right = cx + width / 2;
    camera.top = cy + height / 2;
    camera.bottom = cy - height / 2;
    camera.near = 0.1;
    camera.far = 100000;
    if (options?.reposition) camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function getAspect() {
    if (!containerEl || containerEl.clientHeight === 0) return 1;
    return containerEl.clientWidth / containerEl.clientHeight;
  }

  function resize() {
    if (!containerEl || !renderer || !camera) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === 0 || h === 0) return;
    if (modelRoot && sceneObjects.length > 0) {
      fitOrthoToModel(modelRoot, w / h, { reposition: false });
    } else {
      applyFallbackFrustum(w / h);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
  }

  async function showDoc(doc: { objects: () => { count: number; get: (i: number) => any } }) {
    const rhino = await loadRhino();
    clearSceneMeshes();

    const modelGroup = new THREE.Group();
    modelGroup.rotation.x = -Math.PI / 2;
    scene.add(modelGroup);
    modelRoot = modelGroup;

    const meshMaterialOptions = {
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    };
    const filmMaterial = new THREE.MeshBasicMaterial({
      ...meshMaterialOptions,
      color: MATERIAL_COLORS.film,
    });
    const kieferMaterial = new THREE.MeshBasicMaterial({
      ...meshMaterialOptions,
      color: MATERIAL_COLORS.kiefer,
    });
    sharedMeshMaterials = [filmMaterial, kieferMaterial];

    const objects = doc.objects();
    for (let i = 0; i < objects.count; i++) {
      const rhinoObject = objects.get(i);
      const geom = rhinoObject.geometry();
      if (!(geom instanceof rhino.Mesh)) continue;
      const geometry = meshToGeometry(geom);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(
        geometry,
        isFilmPiece(rhinoObject) ? filmMaterial : kieferMaterial
      );
      modelGroup.add(mesh);
      sceneObjects.push(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 30),
        new THREE.LineBasicMaterial({ color: 0x000000 })
      );
      mesh.add(edges);
      sceneObjects.push(edges);
    }

    if (sceneObjects.length > 0 && modelRoot) {
      requestAnimationFrame(() => {
        if (modelRoot && sceneObjects.length > 0) {
          fitOrthoToModel(modelRoot, getAspect(), { reposition: true });
        }
      });
    }
  }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(viewerBackgroundFromEl(containerEl));

    const w = containerEl.clientWidth || 400;
    const h = containerEl.clientHeight || 300;
    const aspect = w / h;
    camera = new THREE.OrthographicCamera(
      -VIEW_SIZE * aspect,
      VIEW_SIZE * aspect,
      VIEW_SIZE,
      -VIEW_SIZE,
      0.1,
      100000
    );
    camera.position.set(-775, 1375, 1550);
    camera.lookAt(615, 735, -510);
    camera.updateProjectionMatrix();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    containerEl.appendChild(renderer.domElement);
    resize();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();

    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(containerEl);

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
  }

  function dispose() {
    cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    resizeObserver = null;
    clearSceneMeshes();
    controls?.dispose();
    renderer?.dispose();
    if (renderer.domElement.parentNode === containerEl) {
      containerEl.removeChild(renderer.domElement);
    }
  }

  init();

  return {
    showDoc,
    clearSceneMeshes,
    resize,
    dispose,
    getAspect,
  };
}
