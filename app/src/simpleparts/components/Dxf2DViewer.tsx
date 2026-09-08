import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createThreeObjectsFromDXF, type DxfData } from 'dxf-render'
import { buildLayerPanelLayers } from '../boundaryDetection.js'
import type { CameraState, UnknownRecord, ViewerHandle } from '../types'
import { createViewerScene, disposeObject, entityHandle, entityLayer, fitGroup, resizeViewer, type ThreeSceneState } from './viewerCore'

interface Dxf2DViewerProps {
  dxf: UnknownRecord
  cameraStateToRestore?: CameraState | null
  hiddenLayers?: string[]
  showLayerPanel?: boolean
  showEditLayers?: boolean
  highlightColor: number
  selectedHandles?: string[]
  highlightSafeHandles: (handles: string[]) => string[]
  pickingEnabled?: boolean
  rectangleCrossingMode?: 'intersect' | 'center'
  onHiddenLayersChange?: (layers: string[]) => void
  onReady?: () => void
  onEntityClick?: (event: UnknownRecord) => void
  onEditLayers?: () => void
}

const Dxf2DViewer = forwardRef<ViewerHandle, Dxf2DViewerProps>(function Dxf2DViewer({
  dxf,
  cameraStateToRestore = null,
  hiddenLayers = [],
  showLayerPanel = false,
  showEditLayers = false,
  highlightColor,
  selectedHandles = [],
  highlightSafeHandles,
  pickingEnabled = true,
  rectangleCrossingMode = 'intersect',
  onHiddenLayersChange,
  onReady,
  onEntityClick,
  onEditLayers,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ThreeSceneState | null>(null)
  const groupRef = useRef<THREE.Object3D | null>(null)
  const materialsRef = useRef<any>(null)
  const originRef = useRef({ x: 0, y: 0, z: 0 })
  const controlsListenerRef = useRef<(() => void) | null>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const [readyTick, setReadyTick] = useState(0)
  const layers = useMemo(() => buildLayerPanelLayers(dxf, hiddenLayers) as { name: string; visible?: boolean }[], [dxf, hiddenLayers])

  const render = () => {
    const state = stateRef.current
    if (state) state.renderer.render(state.scene, state.camera)
  }
  const applyVisibility = () => {
    const hidden = new Set(hiddenLayers)
    groupRef.current?.traverse((node) => {
      if (node === groupRef.current) return
      node.visible = !hidden.has(entityLayer(node))
    })
    render()
  }
  const applyHighlight = (handles: string[]) => {
    const selected = new Set(highlightSafeHandles(handles).map(String))
    groupRef.current?.traverse((node: any) => {
      if (!node.material?.color) return
      if (node.userData.__baseColor == null) node.userData.__baseColor = node.material.color.getHex()
      node.material.color.set(selected.has(entityHandle(node)) ? highlightColor : node.userData.__baseColor)
    })
    render()
  }
  const captureCameraState = (): CameraState | null => {
    const state = stateRef.current
    if (!state) return null
    return {
      zoom: state.camera.zoom,
      worldTargetX: state.controls.target.x + originRef.current.x,
      worldTargetY: state.controls.target.y + originRef.current.y,
    }
  }
  const restoreCameraState = (cameraState: CameraState | null) => {
    const state = stateRef.current
    if (!state || !cameraState) return
    state.camera.zoom = cameraState.zoom
    state.controls.target.set(cameraState.worldTargetX - originRef.current.x, cameraState.worldTargetY - originRef.current.y, 0)
    state.camera.position.x = state.controls.target.x
    state.camera.position.y = state.controls.target.y
    state.camera.updateProjectionMatrix()
    state.controls.update()
  }

  useImperativeHandle(ref, () => ({
    getContainerEl: () => containerRef.current,
    getCamera: () => stateRef.current?.camera ?? null,
    getControls: () => stateRef.current?.controls ?? null,
    getCanvas: () => stateRef.current?.renderer.domElement ?? null,
    getOriginOffset: () => originRef.current,
    captureCameraState,
    restoreCameraState,
    applyHighlight,
    clearHighlight: () => applyHighlight([]),
    zoomToEntity(handles) {
      const selected = new Set(handles.map(String))
      const box = new THREE.Box3()
      groupRef.current?.traverse((node) => {
        if (selected.has(entityHandle(node))) box.expandByObject(node)
      })
      if (!box.isEmpty() && stateRef.current) {
        const temporary = new THREE.Group()
        const helper = new THREE.Box3Helper(box)
        temporary.add(helper)
        fitGroup(stateRef.current, temporary)
        helper.geometry.dispose()
      }
    },
    setControlsChangeListener(listener) {
      const controls = stateRef.current?.controls
      if (!controls) return
      if (controlsListenerRef.current) controls.removeEventListener('change', controlsListenerRef.current)
      controlsListenerRef.current = listener
      if (listener) controls.addEventListener('change', listener)
    },
    resize() {
      if (containerRef.current && stateRef.current) resizeViewer(containerRef.current, stateRef.current)
    },
    pickAtClient(clientX, clientY) {
      const state = stateRef.current
      const group = groupRef.current
      if (!state || !group) return null
      const rect = state.renderer.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, state.camera)
      const hit = raycaster.intersectObject(group, true).find((candidate) => entityHandle(candidate.object))
      return hit ? { handle: entityHandle(hit.object), layer: entityLayer(hit.object) } : null
    },
    pickInRect(worldRect, mode) {
      const group = groupRef.current
      if (!group) return []
      const rect = worldRect as { minX: number; minY: number; maxX: number; maxY: number }
      const handles: string[] = []
      const seen = new Set<string>()
      group.traverse((node: any) => {
        const handle = entityHandle(node)
        if (!handle || seen.has(handle) || !node.visible || !node.geometry) return
        const box = new THREE.Box3().setFromObject(node)
        if (box.isEmpty()) return
        box.min.x += originRef.current.x
        box.max.x += originRef.current.x
        box.min.y += originRef.current.y
        box.max.y += originRef.current.y
        const centerX = (box.min.x + box.max.x) / 2
        const centerY = (box.min.y + box.max.y) / 2
        const matches = mode === 'window'
          ? box.min.x >= rect.minX && box.max.x <= rect.maxX
            && box.min.y >= rect.minY && box.max.y <= rect.maxY
          : rectangleCrossingMode === 'center'
            ? centerX >= rect.minX && centerX <= rect.maxX
              && centerY >= rect.minY && centerY <= rect.maxY
            : box.max.x >= rect.minX && box.min.x <= rect.maxX
              && box.max.y >= rect.minY && box.min.y <= rect.maxY
        if (!matches) return
        seen.add(handle)
        handles.push(handle)
      })
      return handles
    },
    partWorldCenter(handle) {
      const box = new THREE.Box3()
      groupRef.current?.traverse((node) => {
        if (entityHandle(node) === String(handle)) box.expandByObject(node)
      })
      if (box.isEmpty()) return null
      const center = box.getCenter(new THREE.Vector3())
      return { minX: box.min.x, minY: box.min.y, maxX: box.max.x, maxY: box.max.y, centerX: center.x, centerY: center.y }
    },
  }), [highlightColor, highlightSafeHandles, hiddenLayers, readyTick, rectangleCrossingMode])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const state = createViewerScene(element)
    stateRef.current = state
    const observer = new ResizeObserver(() => resizeViewer(element, state))
    observer.observe(element)
    setReadyTick((tick) => tick + 1)
    return () => {
      observer.disconnect()
      disposeObject(groupRef.current)
      materialsRef.current?.disposeAll?.()
      state.controls.dispose()
      state.renderer.dispose()
      state.renderer.domElement.remove()
      stateRef.current = null
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    let cancelled = false
    void createThreeObjectsFromDXF(dxf as DxfData).then(({ group, materials, originOffset }: any) => {
      if (cancelled) {
        disposeObject(group)
        materials?.disposeAll?.()
        return
      }
      if (groupRef.current) state.scene.remove(groupRef.current)
      disposeObject(groupRef.current)
      materialsRef.current?.disposeAll?.()
      groupRef.current = group
      materialsRef.current = materials
      originRef.current = originOffset ?? { x: 0, y: 0, z: 0 }
      state.scene.add(group)
      if (cameraStateToRestore) restoreCameraState(cameraStateToRestore)
      else fitGroup(state, group)
      applyVisibility()
      applyHighlight(selectedHandles)
      onReady?.()
    })
    return () => { cancelled = true }
  }, [dxf])

  useEffect(applyVisibility, [hiddenLayers])
  useEffect(() => applyHighlight(selectedHandles), [selectedHandles])

  const onClick = (event: React.MouseEvent) => {
    const state = stateRef.current
    const group = groupRef.current
    if (!pickingEnabled || !state || !group) return
    const rect = state.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, state.camera)
    const hit = raycaster.intersectObject(group, true).find((candidate) => entityHandle(candidate.object))
    if (hit) onEntityClick?.({ handle: entityHandle(hit.object), entity: hit.object.userData.entity })
  }
  const toggleLayer = (name: string) => onHiddenLayersChange?.(hiddenLayers.includes(name) ? hiddenLayers.filter((layer) => layer !== name) : [...hiddenLayers, name])

  return (
    <div ref={containerRef} className="dxf-2d-viewer" onClick={onClick}>
      {showLayerPanel && layers.length > 0 && (
        <div className="dxf-2d-viewer__layers viewer-layer-stack" onClick={(event) => event.stopPropagation()}>
          <div className="simpleparts-layer-panel">
            <div className="simpleparts-layer-panel__actions"><button type="button" onClick={() => onHiddenLayersChange?.([])}>Show all</button><button type="button" onClick={() => onHiddenLayersChange?.(layers.map((layer) => layer.name))}>Hide all</button></div>
            {layers.map((layer) => <label key={layer.name}><input type="checkbox" checked={!hiddenLayers.includes(layer.name)} onChange={() => toggleLayer(layer.name)} />{layer.name}</label>)}
          </div>
          {showEditLayers && <button type="button" className="viewer-layer-stack__edit" onClick={onEditLayers}>Edit layers</button>}
        </div>
      )}
    </div>
  )
})

export default Dxf2DViewer
