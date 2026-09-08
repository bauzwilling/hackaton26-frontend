import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ACI_PALETTE,
  createThreeObjectsFromDXF,
  resolveAci7Hex,
  rgbNumberToHex,
  type DxfData,
  type DxfLayer,
} from "dxf-render";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./nesting-preview.css";

export interface NestingDxfViewerProps {
  dxf: DxfData;
  hiddenLayers?: string[];
  onHiddenLayersChange?: (layers: string[]) => void;
}

interface ViewerState {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
}

interface LayerRow {
  name: string;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
  color: string;
  entityCount: number;
}

function layerColor(layer: DxfLayer | undefined): string {
  if (!layer) return "#888888";
  const index = Number(layer.colorIndex);
  if (Number.isFinite(index) && index >= 1 && index <= 255) {
    if (index === 7 || index === 255) return resolveAci7Hex(false);
    const rgb = ACI_PALETTE[index];
    if (rgb != null) return `#${Number(rgb).toString(16).padStart(6, "0")}`;
  }
  if (layer.color != null && layer.color !== 0) {
    try {
      return rgbNumberToHex(layer.color);
    } catch {
      // Fall back to the neutral layer swatch.
    }
  }
  return "#888888";
}

function objectLayer(node: THREE.Object3D): string {
  const data = node.userData;
  return String(data.layerName ?? data.layer ?? data.entity?.layer ?? "0");
}

function disposeObject(object: THREE.Object3D | null): void {
  object?.traverse((node) => {
    const renderable = node as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose();
    if (Array.isArray(renderable.material)) {
      renderable.material.forEach((material) => material.dispose());
    } else {
      renderable.material?.dispose();
    }
  });
}

function fitDrawing(state: ViewerState, group: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const element = state.renderer.domElement;
  const aspect = element.clientWidth / Math.max(element.clientHeight, 1);
  const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect), 1) * 1.08;
  state.camera.left = -halfHeight * aspect;
  state.camera.right = halfHeight * aspect;
  state.camera.top = halfHeight;
  state.camera.bottom = -halfHeight;
  state.camera.position.set(center.x, center.y, 1000);
  state.controls.target.set(center.x, center.y, 0);
  state.camera.updateProjectionMatrix();
  state.controls.update();
}

export default function NestingDxfViewer({
  dxf,
  hiddenLayers = [],
  onHiddenLayersChange,
}: NestingDxfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ViewerState | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const materialsRef = useRef<{ disposeAll?: () => void } | null>(null);
  const hiddenLayersRef = useRef(hiddenLayers);

  useEffect(() => {
    hiddenLayersRef.current = hiddenLayers;
  }, [hiddenLayers]);

  const layers = useMemo<LayerRow[]>(() => {
    const tableLayers = dxf.tables?.layer?.layers ?? {};
    const counts = new Map<string, number>();
    for (const entity of dxf.entities ?? []) {
      const name = entity.layer ?? "0";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        visible: !hiddenLayers.includes(name),
        frozen: Boolean(tableLayers[name]?.frozen),
        locked: Boolean(tableLayers[name]?.locked),
        color: layerColor(tableLayers[name]),
        entityCount: counts.get(name) ?? 0,
      }));
  }, [dxf, hiddenLayers]);

  const render = useCallback(() => {
    const state = stateRef.current;
    if (state) state.renderer.render(state.scene, state.camera);
  }, []);

  const applyVisibility = useCallback(() => {
    const hidden = new Set(hiddenLayers);
    groupRef.current?.traverse((node) => {
      if (node !== groupRef.current) node.visible = !hidden.has(objectLayer(node));
    });
    render();
  }, [hiddenLayers, render]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    const aspect = element.clientWidth / Math.max(element.clientHeight, 1);
    const camera = new THREE.OrthographicCamera(
      -50 * aspect,
      50 * aspect,
      50,
      -50,
      -100000,
      100000,
    );
    camera.position.set(0, 0, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(element.clientWidth, element.clientHeight);
    element.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.addEventListener("change", render);
    stateRef.current = { scene, camera, renderer, controls };

    const resize = () => {
      const state = stateRef.current;
      if (!state) return;
      const nextAspect = element.clientWidth / Math.max(element.clientHeight, 1);
      const halfHeight = (state.camera.top - state.camera.bottom) / 2;
      const centerX = (state.camera.left + state.camera.right) / 2;
      state.camera.left = centerX - halfHeight * nextAspect;
      state.camera.right = centerX + halfHeight * nextAspect;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(element.clientWidth, element.clientHeight);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    render();

    return () => {
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      disposeObject(groupRef.current);
      materialsRef.current?.disposeAll?.();
      renderer.dispose();
      renderer.domElement.remove();
      groupRef.current = null;
      stateRef.current = null;
    };
  }, [render]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const controller = new AbortController();

    void createThreeObjectsFromDXF(dxf, { signal: controller.signal })
      .then(({ group, materials }) => {
        if (controller.signal.aborted) {
          disposeObject(group);
          materials.disposeAll();
          return;
        }
        if (groupRef.current) state.scene.remove(groupRef.current);
        disposeObject(groupRef.current);
        materialsRef.current?.disposeAll?.();
        groupRef.current = group;
        materialsRef.current = materials;
        state.scene.add(group);
        fitDrawing(state, group);
        const hidden = new Set(hiddenLayersRef.current);
        group.traverse((node) => {
          if (node !== group) node.visible = !hidden.has(objectLayer(node));
        });
        render();
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Failed to render nesting DXF", error);
      });

    return () => controller.abort();
  }, [dxf, render]);

  useEffect(applyVisibility, [applyVisibility]);

  const toggleLayer = (name: string) => {
    onHiddenLayersChange?.(
      hiddenLayers.includes(name)
        ? hiddenLayers.filter((layer) => layer !== name)
        : [...hiddenLayers, name],
    );
  };

  const zoom = (factor: number) => {
    const state = stateRef.current;
    if (!state) return;
    state.camera.zoom = THREE.MathUtils.clamp(state.camera.zoom * factor, 0.01, 100);
    state.camera.updateProjectionMatrix();
    state.controls.update();
  };

  return (
    <div className="nesting-dxf-viewer">
      <div ref={containerRef} className="nesting-dxf-viewer__canvas" />
      <div className="nesting-dxf-viewer__toolbar" aria-label="Drawing controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
        <button
          type="button"
          aria-label="Fit drawing"
          onClick={() => {
            if (stateRef.current && groupRef.current) fitDrawing(stateRef.current, groupRef.current);
          }}
        >
          Fit
        </button>
      </div>
      {layers.length > 0 && (
        <div className="nesting-dxf-viewer__layers">
          <div className="nesting-layer-panel">
            <div className="nesting-layer-panel__actions">
              <button type="button" onClick={() => onHiddenLayersChange?.([])}>Show all</button>
              <button
                type="button"
                onClick={() => onHiddenLayersChange?.(layers.map((layer) => layer.name))}
              >
                Hide all
              </button>
            </div>
            {layers.map((layer) => (
              <label
                key={layer.name}
                className="nesting-layer-panel__layer"
                title={[
                  `${layer.entityCount} ${layer.entityCount === 1 ? "entity" : "entities"}`,
                  layer.frozen ? "frozen" : "",
                  layer.locked ? "locked" : "",
                ].filter(Boolean).join(", ")}
              >
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleLayer(layer.name)}
                />
                <span
                  className="nesting-layer-panel__swatch"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="nesting-layer-panel__name">{layer.name}</span>
                <span className="nesting-layer-panel__count">{layer.entityCount}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
