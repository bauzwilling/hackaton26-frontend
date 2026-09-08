import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { createThreeObjectsFromDXF, type DxfData } from 'dxf-render'
import { readPartColor } from '../partColors.js'
import { applyMetadataUpdate, panelMetaForDescriptor } from '../features/metadata/meshMetadataSelection.js'
import type { MetadataOverrides, UnknownRecord } from '../types'
import PartMetadataPanel from './PartMetadataPanel'
import { createViewerScene, disposeObject, fitGroup, resizeViewer, type ThreeSceneState } from './viewerCore'

export interface ThreeMeshViewerHandle {
  pickAtClient(clientX: number, clientY: number): { partId: string; point: THREE.Vector3 } | null
  getCamera(): THREE.OrthographicCamera | null
  getCanvas(): HTMLCanvasElement | null
  getOriginOffset(): { x: number; y: number; z: number }
  selectPartByHandle(partId: string): boolean
  resize(): void
}

interface ThreeMeshViewerProps {
  meshes?: UnknownRecord[]
  unassignedMeshes?: UnknownRecord[]
  annotationDxf?: UnknownRecord | null
  partDescriptors?: UnknownRecord[]
  clickForProperties?: boolean
  showPropertiesPanel?: boolean
  modifiedHandles?: string[]
  showModifiedPartsGreen?: boolean
  unassignedPartIds?: string[]
  metadataOverrides?: MetadataOverrides
  onMetadataOverridesChange?: (overrides: MetadataOverrides) => void
  onMarkModified?: (id: string) => void
}

const MESH_COLOR = 0x9aa7b4
const FALLBACK_UNASSIGNED_COLOR = 0xdc2626
const DRAG_THRESHOLD_PX = 4
const MIN_RECT_SELECT_PX = 10

const ThreeMeshViewer = forwardRef<ThreeMeshViewerHandle, ThreeMeshViewerProps>(function ThreeMeshViewer({
  meshes = [],
  unassignedMeshes = [],
  annotationDxf = null,
  partDescriptors = [],
  clickForProperties = false,
  showPropertiesPanel = false,
  modifiedHandles = [],
  showModifiedPartsGreen = false,
  unassignedPartIds = [],
  metadataOverrides = {},
  onMetadataOverridesChange,
  onMarkModified,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ThreeSceneState | null>(null)
  const meshGroupRef = useRef<THREE.Group | null>(null)
  const extrasGroupRef = useRef<THREE.Group | null>(null)
  const annotationMaterialsRef = useRef<any>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [panelPoint, setPanelPoint] = useState<THREE.Vector3 | null>(null)
  const [cameraTick, setCameraTick] = useState(0)
  const [selectionRect, setSelectionRect] = useState<{
    left: number
    top: number
    width: number
    height: number
    mode: 'window' | 'crossing'
  } | null>(null)
  const pointerStart = useRef({ x: 0, y: 0 })
  const leftPointerDown = useRef(false)
  const pointerDragged = useRef(false)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const loader = useMemo(() => new THREE.BufferGeometryLoader(), [])
  const descriptorById = useMemo(() => new Map(partDescriptors.map((descriptor) => [String(descriptor.id), descriptor])), [partDescriptors])
  const propertiesEnabled = clickForProperties || showPropertiesPanel

  const baseColor = (partId: string) => {
    if (showModifiedPartsGreen && modifiedHandles.includes(partId)) return readPartColor('green') || MESH_COLOR
    if (unassignedPartIds.includes(partId)) return readPartColor('red') || FALLBACK_UNASSIGNED_COLOR
    return MESH_COLOR
  }
  const applyHighlight = (ids: string[]) => {
    const selected = new Set(ids)
    meshGroupRef.current?.children.forEach((node: any) => {
      if (!node.isMesh || !node.material?.color) return
      const color = baseColor(String(node.userData.partId))
      node.userData.baseColor = color
      node.material.color.set(selected.has(String(node.userData.partId)) ? readPartColor('orange') : color)
    })
    const state = stateRef.current
    if (state) state.renderer.render(state.scene, state.camera)
  }
  const centerFor = (partId: string) => {
    const mesh = meshGroupRef.current?.children.find((node: any) => String(node.userData.partId) === partId)
    if (!mesh) return null
    return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
  }
  const selectionAnchor = (ids: string[]) => {
    const centers = ids.map(centerFor).filter((center): center is THREE.Vector3 => center != null)
    if (!centers.length) return null
    return new THREE.Vector3(
      centers.reduce((sum, center) => sum + center.x, 0) / centers.length,
      centers.reduce((sum, center) => sum + center.y, 0) / centers.length,
      centers.reduce((sum, center) => sum + center.z, 0) / centers.length,
    )
  }
  const setSelection = (ids: string[], point?: THREE.Vector3 | null, additive = false) => {
    const next = additive ? [...new Set([...selectedIds, ...ids])] : ids
    setSelectedIds(next)
    setPanelPoint(point ?? selectionAnchor(next))
    applyHighlight(next)
  }
  const pickAtClient = (clientX: number, clientY: number) => {
    const state = stateRef.current
    const group = meshGroupRef.current
    if (!state || !group) return null
    const rect = state.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, state.camera)
    const hit = raycaster.intersectObjects(group.children, true).find((candidate: any) => candidate.object.userData.partId)
    return hit ? { partId: String(hit.object.userData.partId), point: hit.point.clone() } : null
  }
  const meshScreenBox = (mesh: THREE.Object3D) => {
    const state = stateRef.current
    const element = containerRef.current
    if (!state || !element) return null
    const box = new THREE.Box3().setFromObject(mesh)
    if (box.isEmpty()) return null
    const rect = element.getBoundingClientRect()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(state.camera)
          const left = (projected.x + 1) * rect.width / 2
          const top = (-projected.y + 1) * rect.height / 2
          minX = Math.min(minX, left)
          minY = Math.min(minY, top)
          maxX = Math.max(maxX, left)
          maxY = Math.max(maxY, top)
        }
      }
    }
    return { minX, minY, maxX, maxY }
  }
  const pickInClientRect = (startX: number, startY: number, endX: number, endY: number) => {
    const element = containerRef.current
    const group = meshGroupRef.current
    if (!element || !group) return []
    const shell = element.getBoundingClientRect()
    const rect = {
      left: Math.min(startX, endX) - shell.left,
      top: Math.min(startY, endY) - shell.top,
      right: Math.max(startX, endX) - shell.left,
      bottom: Math.max(startY, endY) - shell.top,
    }
    const mode = endX >= startX ? 'window' : 'crossing'
    return group.children.flatMap((mesh: any) => {
      const box = meshScreenBox(mesh)
      if (!box || !mesh.visible || !mesh.userData.partId) return []
      const matches = mode === 'window'
        ? box.minX >= rect.left && box.maxX <= rect.right && box.minY >= rect.top && box.maxY <= rect.bottom
        : box.maxX >= rect.left && box.minX <= rect.right && box.maxY >= rect.top && box.minY <= rect.bottom
      return matches ? [String(mesh.userData.partId)] : []
    })
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    leftPointerDown.current = true
    pointerDragged.current = false
    pointerStart.current = { x: event.clientX, y: event.clientY }
    setSelectionRect(null)
    if (propertiesEnabled) event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!propertiesEnabled || !leftPointerDown.current || !(event.buttons & 1)) return
    if (Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) <= DRAG_THRESHOLD_PX) return
    pointerDragged.current = true
    const shell = event.currentTarget.getBoundingClientRect()
    setSelectionRect({
      left: Math.min(pointerStart.current.x, event.clientX) - shell.left,
      top: Math.min(pointerStart.current.y, event.clientY) - shell.top,
      width: Math.abs(event.clientX - pointerStart.current.x),
      height: Math.abs(event.clientY - pointerStart.current.y),
      mode: event.clientX >= pointerStart.current.x ? 'window' : 'crossing',
    })
  }
  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!leftPointerDown.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    leftPointerDown.current = false
    setSelectionRect(null)
    if (!propertiesEnabled) return
    const width = Math.abs(event.clientX - pointerStart.current.x)
    const height = Math.abs(event.clientY - pointerStart.current.y)
    if (pointerDragged.current && Math.max(width, height) >= MIN_RECT_SELECT_PX) {
      const ids = pickInClientRect(pointerStart.current.x, pointerStart.current.y, event.clientX, event.clientY)
      setSelection(ids, selectionAnchor(ids), event.shiftKey || event.ctrlKey || event.metaKey)
      return
    }
    const pick = pickAtClient(event.clientX, event.clientY)
    if (!pick) {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) setSelection([])
      return
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const next = selectedIds.includes(pick.partId)
        ? selectedIds.filter((id) => id !== pick.partId)
        : [...selectedIds, pick.partId]
      setSelection(next, pick.point)
    } else {
      setSelection([pick.partId], pick.point)
    }
  }

  useImperativeHandle(ref, () => ({
    pickAtClient,
    getCamera: () => stateRef.current?.camera ?? null,
    getCanvas: () => stateRef.current?.renderer.domElement ?? null,
    getOriginOffset: () => ({ x: 0, y: 0, z: 0 }),
    selectPartByHandle(partId) {
      const id = String(partId)
      const center = centerFor(id)
      if (!center) return false
      setSelection([id], center)
      return true
    },
    resize() {
      if (containerRef.current && stateRef.current) resizeViewer(containerRef.current, stateRef.current)
    },
  }))

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const state = createViewerScene(element)
    state.controls.enableRotate = true
    state.scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    const light = new THREE.DirectionalLight(0xffffff, 1.2)
    light.position.set(-0.5, 0.7, 1)
    state.scene.add(light)
    state.controls.addEventListener('change', () => setCameraTick((tick) => tick + 1))
    stateRef.current = state
    const observer = new ResizeObserver(() => resizeViewer(element, state))
    observer.observe(element)
    return () => {
      observer.disconnect()
      disposeObject(meshGroupRef.current)
      disposeObject(extrasGroupRef.current)
      annotationMaterialsRef.current?.disposeAll?.()
      state.controls.dispose()
      state.renderer.dispose()
      state.renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    if (meshGroupRef.current) state.scene.remove(meshGroupRef.current)
    if (extrasGroupRef.current) state.scene.remove(extrasGroupRef.current)
    disposeObject(meshGroupRef.current)
    disposeObject(extrasGroupRef.current)
    const build = (source: UnknownRecord[], tagged: boolean) => {
      const group = new THREE.Group()
      source.forEach((json, index) => {
        try {
          const geometry = loader.parse(json)
          geometry.computeVertexNormals()
          const partId = String(partDescriptors[index]?.id ?? `mesh:${index}`)
          const color = tagged ? baseColor(partId) : readPartColor('red') || FALLBACK_UNASSIGNED_COLOR
          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }))
          if (tagged) mesh.userData.partId = partId
          group.add(mesh)
        } catch {
          // Invalid mesh payloads are skipped, matching the Vue viewer.
        }
      })
      return group
    }
    meshGroupRef.current = build(meshes, true)
    extrasGroupRef.current = build(unassignedMeshes, false)
    state.scene.add(meshGroupRef.current, extrasGroupRef.current)
    const finish = () => {
      const all = new THREE.Group()
      all.add(meshGroupRef.current!.clone(), extrasGroupRef.current!.clone())
      fitGroup(state, all)
      applyHighlight(selectedIds)
    }
    if (annotationDxf) {
      void createThreeObjectsFromDXF(annotationDxf as DxfData).then(({ group, materials }: any) => {
        annotationMaterialsRef.current = materials
        extrasGroupRef.current?.add(group)
        finish()
      }).catch(finish)
    } else finish()
  }, [meshes, unassignedMeshes, annotationDxf, partDescriptors])

  useEffect(() => applyHighlight(selectedIds), [modifiedHandles, showModifiedPartsGreen, unassignedPartIds])
  useEffect(() => { if (!clickForProperties) setSelection([]) }, [clickForProperties])

  const panelMeta = useMemo(() => {
    if (!selectedIds.length) return { nr: '', mat: '', anz: '' }
    const values = selectedIds.map((id) => panelMetaForDescriptor(descriptorById.get(id), metadataOverrides))
    const aggregate = (field: 'nr' | 'mat' | 'anz') => values.every((value) => value[field] === values[0][field]) ? values[0][field] : '<varies>'
    return { nr: aggregate('nr'), mat: aggregate('mat'), anz: aggregate('anz') }
  }, [descriptorById, metadataOverrides, selectedIds])
  const panelStyle = useMemo(() => {
    void cameraTick
    const state = stateRef.current
    const element = containerRef.current
    if (!panelPoint || !state || !element) return undefined
    const point = panelPoint.clone().project(state.camera)
    const rect = element.getBoundingClientRect()
    return { left: (point.x + 1) * 0.5 * rect.width, top: (-point.y + 1) * 0.5 * rect.height }
  }, [cameraTick, panelPoint])
  const updateMetadata = (field: 'nr' | 'anz', value: string) => {
    const result = applyMetadataUpdate({
      selectedIds,
      field,
      value,
      metadataOverrides,
      partDescriptors,
    } as never)
    onMetadataOverridesChange?.(result.overrides)
    result.targets.forEach((id: string) => onMarkModified?.(id))
  }

  return (
    <div
      ref={containerRef}
      className="three-mesh-viewer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        leftPointerDown.current = false
        setSelectionRect(null)
      }}
      onPointerLeave={() => { if (!leftPointerDown.current) setSelectionRect(null) }}
    >
      {propertiesEnabled && selectedIds.length > 0 && panelStyle && <PartMetadataPanel {...panelMeta} style={panelStyle} onUpdate={updateMetadata} />}
      {selectionRect && (
        <div
          className={`selection-rect selection-rect--${selectionRect.mode}`}
          style={{ left: selectionRect.left, top: selectionRect.top, width: selectionRect.width, height: selectionRect.height }}
        />
      )}
    </div>
  )
})

export default ThreeMeshViewer
