import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { parseDxf, createThreeObjectsFromDXF, type DxfData } from 'dxf-render'
import { createViewerScene, disposeObject, type ThreeSceneState } from './viewerCore'
import { nestingLog, nestingMark } from './nestingPerfLog'

/** Sentinel index for the unassigned-parts viewport on the shared canvas. */
export const UNASSIGNED_SHEET_INDEX = -1

/** Thumbnail pixel size (CSS cards are ~220–440 wide; 2× keeps previews sharp). */
const THUMB_W = 480
const THUMB_H = 300

export type NestingSheetPayload = {
  index: number
  dxfText: string
  kind?: 'sheet' | 'unassigned'
  /** Optional card/detail label (defaults to Sheet N). */
  label?: string
}

export interface NestingSheetsViewerHandle {
  resize(): void
  getHiddenLayers(): string[]
  getLayerNames(): string[]
}

interface NestingSheetsViewerProps {
  sheets: NestingSheetPayload[]
  mode: 'overview' | 'detail'
  activeIndex: number
  /** Expected assigned sheet count (pending placeholders). Unassigned is separate. */
  sheetCount?: number
  loading?: boolean
  unassignedLoading?: boolean
  /** Reserve the first-row unassigned viewport even before DXF is ready. */
  showUnassigned?: boolean
  /** When false, keep meshes/context but skip painting. */
  active?: boolean
  /** Detail mode: cannot zoom out past fit. */
  clampZoomToFit?: boolean
  onSheetActivate?: (index: number) => void
}

type SheetNode = {
  index: number
  wrapper: THREE.Group
  mesh: THREE.Object3D
  materials: { disposeAll?: () => void } | null
  size: THREE.Vector3
}

function isUnassignedPayload(sheet: NestingSheetPayload) {
  return sheet.kind === 'unassigned' || sheet.index === UNASSIGNED_SHEET_INDEX
}

/** Fit orthographic camera to a sheet group for a given pixel viewport size. */
function fitCameraToSheet(
  state: ThreeSceneState,
  group: THREE.Object3D,
  pixelWidth: number,
  pixelHeight: number,
) {
  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const aspect = pixelWidth / Math.max(pixelHeight, 1)
  const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect), 1) * 1.08
  state.camera.left = -halfHeight * aspect
  state.camera.right = halfHeight * aspect
  state.camera.top = halfHeight
  state.camera.bottom = -halfHeight
  state.camera.zoom = 1
  state.camera.position.set(center.x, center.y, 1000)
  state.controls.target.set(center.x, center.y, 0)
  state.camera.updateProjectionMatrix()
  state.controls.update()
}

/**
 * One WebGL context.
 * Overview = static JPEG thumbnails (captured once per sheet) — cheap to scroll/paint.
 * Detail = live interactive view; zoom-to-cursor; clamp zoom-out to fit.
 */
const NestingSheetsViewer = forwardRef<NestingSheetsViewerHandle, NestingSheetsViewerProps>(function NestingSheetsViewer({
  sheets,
  mode,
  activeIndex,
  sheetCount = 1,
  loading = false,
  unassignedLoading = false,
  showUnassigned = false,
  active = true,
  clampZoomToFit = true,
  onSheetActivate,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ThreeSceneState | null>(null)
  const rootRef = useRef<THREE.Group | null>(null)
  const nodesRef = useRef<Map<number, SheetNode>>(new Map())
  const buildGenRef = useRef(0)
  const thumbGenRef = useRef(0)
  const modeRef = useRef(mode)
  const activeIndexRef = useRef(activeIndex)
  const clampRef = useRef(clampZoomToFit)
  const activeRef = useRef(active)
  const rafRef = useRef(0)
  const [thumbs, setThumbs] = useState<Map<number, string>>(() => new Map())
  const thumbsRef = useRef(thumbs)

  useEffect(() => {
    thumbsRef.current = thumbs
  }, [thumbs])

  useEffect(() => {
    modeRef.current = mode
    activeIndexRef.current = activeIndex
    clampRef.current = clampZoomToFit
    activeRef.current = active
  }, [active, activeIndex, clampZoomToFit, mode])

  const setSheetVisibility = (onlyIndex: number | null) => {
    for (const node of nodesRef.current.values()) {
      node.wrapper.visible = onlyIndex == null ? false : node.index === onlyIndex
      node.wrapper.position.set(0, 0, 0)
    }
  }

  const restoreHostSize = (state: ThreeSceneState) => {
    const host = hostRef.current
    if (!host) return
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    state.renderer.setSize(width, height, false)
    state.renderer.setPixelRatio(1)
  }

  /** One-shot offscreen render → JPEG data URL for overview cards. */
  const captureThumb = (index: number) => {
    const state = stateRef.current
    const node = nodesRef.current.get(index)
    if (!state || !node || !activeRef.current) return
    const gen = thumbGenRef.current
    const resumeDetail = modeRef.current === 'detail'
    const done = nestingMark('capture-thumb')
    setSheetVisibility(index)
    state.controls.enabled = false
    state.renderer.setScissorTest(false)
    state.renderer.setPixelRatio(1)
    state.renderer.setSize(THUMB_W, THUMB_H, false)
    state.renderer.setViewport(0, 0, THUMB_W, THUMB_H)
    fitCameraToSheet(state, node.wrapper, THUMB_W, THUMB_H)
    state.renderer.setClearColor(0xf5f5f5, 1)
    state.renderer.clear(true, true, true)
    state.renderer.render(state.scene, state.camera)
    let url = ''
    try {
      url = state.renderer.domElement.toDataURL('image/jpeg', 0.72)
    } catch (error) {
      nestingLog('capture-thumb-failed', { index, error: String(error) })
    }
    if (!url || thumbGenRef.current !== gen) {
      if (resumeDetail) enterDetailCamera()
      else {
        setSheetVisibility(null)
        restoreHostSize(state)
      }
      return
    }
    setThumbs((current) => {
      if (current.get(index) === url) return current
      const next = new Map(current)
      next.set(index, url)
      return next
    })
    done({ index, bytes: url.length })
    if (resumeDetail) enterDetailCamera()
    else {
      setSheetVisibility(null)
      restoreHostSize(state)
    }
  }

  const paintDetail = () => {
    const state = stateRef.current
    const host = hostRef.current
    if (!state || !host || !activeRef.current || modeRef.current !== 'detail') return
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    state.renderer.setSize(width, height, false)
    state.renderer.setPixelRatio(1)
    state.controls.enabled = true
    state.renderer.setScissorTest(false)
    state.renderer.setViewport(0, 0, width, height)
    setSheetVisibility(activeIndexRef.current)
    state.renderer.setClearColor(0xf5f5f5, 1)
    state.renderer.clear(true, true, true)
    state.renderer.render(state.scene, state.camera)
  }

  const scheduleDetailPaint = () => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      paintDetail()
    })
  }

  const enterDetailCamera = () => {
    const state = stateRef.current
    const host = hostRef.current
    const activeNode = nodesRef.current.get(activeIndexRef.current)
    if (!state || !host || !activeNode) return
    const done = nestingMark('camera-detail')
    restoreHostSize(state)
    setSheetVisibility(activeNode.index)
    fitCameraToSheet(state, activeNode.wrapper, host.clientWidth, host.clientHeight)
    state.controls.zoomToCursor = true
    state.controls.enableZoom = true
    if (clampRef.current) {
      state.controls.minZoom = state.camera.zoom
      state.controls.maxZoom = Math.max(state.camera.zoom * 40, 40)
    } else {
      state.controls.minZoom = 0
      state.controls.maxZoom = Infinity
    }
    state.controls.enabled = true
    done({ activeIndex: activeNode.index })
    paintDetail()
  }

  useImperativeHandle(ref, () => ({
    resize: () => {
      if (modeRef.current === 'detail') enterDetailCamera()
    },
    getHiddenLayers: () => [],
    getLayerNames: () => [],
  }))

  useEffect(() => {
    const canvasHost = canvasHostRef.current
    if (!canvasHost) return
    const done = nestingMark('create-webgl-context')
    const state = createViewerScene(canvasHost, { renderOnControlChange: false })
    state.renderer.setPixelRatio(1)
    state.renderer.autoClear = false
    state.scene.background = null
    state.controls.enabled = false
    state.controls.zoomToCursor = true
    state.controls.addEventListener('change', scheduleDetailPaint)
    stateRef.current = state
    const root = new THREE.Group()
    root.name = 'nesting-sheets-root'
    rootRef.current = root
    state.scene.add(root)
    done({ note: 'single WebGLRenderer; overview uses cached thumbnails' })
    nestingLog('webgl-ready', { contexts: 1 })

    const host = hostRef.current
    const observer = host
      ? new ResizeObserver(() => {
        if (modeRef.current === 'detail') enterDetailCamera()
      })
      : null
    if (host && observer) observer.observe(host)

    return () => {
      observer?.disconnect()
      state.controls.removeEventListener('change', scheduleDetailPaint)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      buildGenRef.current += 1
      thumbGenRef.current += 1
      for (const node of nodesRef.current.values()) {
        disposeObject(node.mesh)
        node.materials?.disposeAll?.()
      }
      nodesRef.current.clear()
      disposeObject(root)
      state.controls.dispose()
      state.renderer.dispose()
      state.renderer.domElement.remove()
      stateRef.current = null
      rootRef.current = null
      nestingLog('webgl-disposed')
    }
  }, [])

  // Progressive mesh builds + one thumbnail capture each.
  useEffect(() => {
    const state = stateRef.current
    const root = rootRef.current
    if (!state || !root) return

    const gen = buildGenRef.current
    let cancelled = false
    const known = new Set(sheets.map((sheet) => sheet.index))

    for (const [index, node] of nodesRef.current) {
      if (known.has(index)) continue
      root.remove(node.wrapper)
      disposeObject(node.mesh)
      node.materials?.disposeAll?.()
      nodesRef.current.delete(index)
      setThumbs((current) => {
        if (!current.has(index)) return current
        const next = new Map(current)
        next.delete(index)
        return next
      })
      nestingLog('sheet-removed-from-scene', { index })
    }

    void (async () => {
      for (const sheet of sheets) {
        if (cancelled || buildGenRef.current !== gen) {
          nestingLog('mesh-build-aborted', { gen, sheet: sheet.index })
          return
        }
        if (nodesRef.current.has(sheet.index)) {
          if (modeRef.current === 'detail' && sheet.index === activeIndexRef.current) enterDetailCamera()
          continue
        }

        const parseDone = nestingMark('parse-dxf')
        let dxf: DxfData
        try {
          dxf = parseDxf(sheet.dxfText)
        } catch (error) {
          nestingLog('parse-dxf-failed', { index: sheet.index, error: String(error) })
          continue
        }
        parseDone({ index: sheet.index, chars: sheet.dxfText.length })

        if (cancelled || buildGenRef.current !== gen) return
        const meshDone = nestingMark('create-three-mesh')
        let group: THREE.Object3D
        let materials: { disposeAll?: () => void } | null = null
        try {
          const built = await createThreeObjectsFromDXF(dxf)
          if (cancelled || buildGenRef.current !== gen) {
            disposeObject(built.group)
            built.materials?.disposeAll?.()
            nestingLog('mesh-build-aborted', { gen, sheet: sheet.index, phase: 'after-await' })
            return
          }
          group = built.group
          materials = built.materials ?? null
        } catch (error) {
          nestingLog('create-three-mesh-failed', { index: sheet.index, error: String(error) })
          continue
        }
        meshDone({ index: sheet.index })

        const box = new THREE.Box3().setFromObject(group)
        const size = box.isEmpty() ? new THREE.Vector3(1, 1, 0) : box.getSize(new THREE.Vector3())
        const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
        group.position.sub(center)

        const wrapper = new THREE.Group()
        wrapper.userData.sheetIndex = sheet.index
        wrapper.userData.kind = isUnassignedPayload(sheet) ? 'unassigned' : 'sheet'
        wrapper.add(group)
        root.add(wrapper)
        nodesRef.current.set(sheet.index, {
          index: sheet.index,
          wrapper,
          mesh: group,
          materials,
          size,
        })
        nestingLog('sheet-added-to-scene', {
          index: sheet.index,
          kind: isUnassignedPayload(sheet) ? 'unassigned' : 'sheet',
          totalInScene: nodesRef.current.size,
          contexts: 1,
        })

        // Capture overview thumb while mesh is hot; yield so UI can paint cards.
        captureThumb(sheet.index)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

        if (modeRef.current === 'detail' && sheet.index === activeIndexRef.current) enterDetailCamera()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sheets])

  useEffect(() => {
    nestingLog('view-mode', { mode, activeIndex, active })
    if (!active) return
    const state = stateRef.current
    if (mode === 'detail') {
      enterDetailCamera()
      return
    }
    if (state) {
      state.controls.enabled = false
      state.controls.minZoom = 0
      state.controls.maxZoom = Infinity
      setSheetVisibility(null)
      restoreHostSize(state)
      state.renderer.setScissorTest(false)
      state.renderer.setClearColor(0x000000, 0)
      state.renderer.clear(true, true, true)
    }
    // Backfill any missing thumbs (e.g. captured while inactive).
    for (const node of nodesRef.current.values()) {
      if (!thumbsRef.current.has(node.index)) captureThumb(node.index)
    }
  }, [active, activeIndex, mode])

  const unassignedPayload = sheets.find(isUnassignedPayload) ?? null
  const showUnassignedSlot = showUnassigned || Boolean(unassignedPayload) || unassignedLoading
  const assignedReady = sheets.filter((sheet) => !isUnassignedPayload(sheet))
  const assignedSlotCount = Math.max(sheetCount, assignedReady.length, showUnassignedSlot ? 0 : 1)
  const assignedSlotIndexes = Array.from({ length: assignedSlotCount }, (_, index) => index)
  const unassignedReady = Boolean(unassignedPayload)
  const detailLabel = activeIndex === UNASSIGNED_SHEET_INDEX
    ? 'Unassigned parts'
    : (sheets.find((sheet) => sheet.index === activeIndex && !isUnassignedPayload(sheet))?.label
      ?? `Sheet ${activeIndex + 1}`)

  const renderCard = (
    index: number,
    ready: boolean,
    label: string,
    pendingLabel: string,
    className = '',
  ) => {
    const thumb = thumbs.get(index)
    return (
      <button
        key={index}
        type="button"
        className={`nesting-viewport-card${ready ? '' : ' nesting-viewport-card--pending'}${className ? ` ${className}` : ''}`}
        onDoubleClick={() => {
          if (!ready) return
          nestingLog('sheet-activate', { index, via: 'dblclick-viewport' })
          onSheetActivate?.(index)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (!ready) return
          onSheetActivate?.(index)
        }}
      >
        <span className="nesting-viewport-card__frame">
          {thumb ? (
            <img className="nesting-viewport-card__thumb" src={thumb} alt="" draggable={false} />
          ) : null}
        </span>
        <span className="nesting-viewport-card__label">{label}</span>
        {!ready && (
          <span className="nesting-viewport-card__status">
            <span className="nesting-handout__spinner-icon" aria-hidden />
            {pendingLabel}
          </span>
        )}
        {ready && !thumb && (
          <span className="nesting-viewport-card__status">
            <span className="nesting-handout__spinner-icon" aria-hidden />
            Preview…
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      ref={hostRef}
      className={`nesting-sheets-viewer nesting-sheets-viewer--${mode}`}
      aria-label={mode === 'detail' ? detailLabel : 'Nesting sheet viewports'}
    >
      <div
        ref={canvasHostRef}
        className="nesting-sheets-viewer__canvas-host"
        aria-hidden={mode !== 'detail'}
      />
      {mode === 'overview' && (
        <div className={`nesting-sheets-viewer__grid${showUnassignedSlot ? ' nesting-sheets-viewer__grid--with-unassigned' : ''}`}>
          {showUnassignedSlot && renderCard(
            UNASSIGNED_SHEET_INDEX,
            unassignedReady,
            'Unassigned',
            unassignedLoading ? 'Loading…' : 'Waiting…',
            'nesting-viewport-card--unassigned',
          )}
          {assignedSlotIndexes.map((index) => {
            const readySheet = assignedReady.find((sheet) => sheet.index === index)
            const ready = Boolean(readySheet)
            return renderCard(
              index,
              ready,
              readySheet?.label ?? `Sheet ${index + 1}/${assignedSlotCount}`,
              loading ? 'Loading…' : 'Waiting…',
            )
          })}
        </div>
      )}
    </div>
  )
})

export default NestingSheetsViewer
