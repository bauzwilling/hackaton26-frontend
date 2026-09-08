<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { loadRhino } from '../lib/compute.js'

const props = defineProps({
  geometryPayload: { type: Object, default: null },
})

const material = ref('kiefer')
const containerRef = ref(null)
const paths = ref([])
const svgSize = ref({ w: 100, h: 100 })
const viewBox = ref({ x: 0, y: 0, w: 100, h: 100 })

const isDragging = ref(false)
let dragStart = null
let viewTransformed = false
let redrawGeneration = 0

const OUTPUTS = {
  kiefer: { sheet: 'K_Sheet', nested: 'K_Nested', text: 'K_Text' },
  film: { sheet: 'F_Sheet', nested: 'F_Nested', text: 'F_Text' },
}

const STROKE = { sheet: '#c4bfb8', nested: '#57534e', text: '#a8a29e' }
const SHEET_DASH = '6 4'

let resizeObserver = null

function payloadOutputs(payload) {
  return payload.values ?? payload.Values ?? []
}

function innerTreeOf(output) {
  const tree = output.InnerTree ?? output.innerTree
  if (!tree || typeof tree !== 'object') return {}
  return tree
}

function decodeLeaf(leaf, rhino) {
  const raw = leaf.data
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  return rhino.CommonObject.decode(data)
}

function xyz(p) {
  if (Array.isArray(p)) return { x: p[0], y: p[1], z: p[2] ?? 0 }
  return { x: p.x, y: p.y, z: p.z ?? 0 }
}

function collect3dPoints(geom) {
  if (geom.pointCount > 0 && typeof geom.point === 'function') {
    const pts = []
    for (let i = 0; i < geom.pointCount; i++) pts.push(geom.point(i))
    return pts
  }

  if (geom.line?.from && geom.line?.to) {
    return [geom.line.from, geom.line.to]
  }

  if (geom.segmentCount > 0 && typeof geom.segmentCurve === 'function') {
    const pts = []
    for (let i = 0; i < geom.segmentCount; i++) {
      const segPts = collect3dPoints(geom.segmentCurve(i))
      if (!segPts.length) continue
      if (!pts.length) {
        pts.push(...segPts)
        continue
      }
      const a = xyz(pts[pts.length - 1])
      const b = xyz(segPts[0])
      const same =
        Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) < 1e-6
      pts.push(...(same ? segPts.slice(1) : segPts))
    }
    return pts
  }

  const polyline = geom.tryGetPolyline?.()?.[1] ?? geom.ToPolyline?.()
  if (polyline?.count > 0) {
    const pts = []
    for (let i = 0; i < polyline.count; i++) pts.push(polyline.get(i))
    return pts
  }

  if (typeof geom.divideByCount === 'function') {
    const divided = geom.divideByCount(64)
    const pts = []
    const n = divided?.length ?? divided?.count ?? 0
    for (let i = 0; i < n; i++) pts.push(divided[i] ?? divided.get(i))
    return pts
  }

  if (geom.domain && typeof geom.pointAt === 'function') {
    const t0 = geom.domain[0]
    const t1 = geom.domain[1]
    const pts = []
    for (let i = 0; i <= 64; i++) {
      const t = t0 + ((t1 - t0) * i) / 64
      pts.push(geom.pointAt(t))
    }
    return pts
  }

  return []
}

function geomToLines(geom, rhino) {
  if (!geom) return []

  if (geom instanceof rhino.Brep) {
    const lines = []
    const edges = geom.edges()
    for (let i = 0; i < edges.count; i++) {
      lines.push(...geomToLines(edges.get(i).edgeCurve(), rhino))
    }
    return lines
  }

  const pts = collect3dPoints(geom)
  return pts.length >= 2 ? [pts] : []
}

function linesForParam(payload, paramName, rhino) {
  const lines = []
  for (const output of payloadOutputs(payload)) {
    const name = output.ParamName ?? output.paramName
    if (name !== paramName) continue
    for (const branch of Object.values(innerTreeOf(output))) {
      for (const leaf of branch) {
        if (!String(leaf.type ?? '').includes('Geometry')) continue
        lines.push(...geomToLines(decodeLeaf(leaf, rhino), rhino))
      }
    }
  }
  return lines
}

function fitPaths(sheetLines, nestedLines, textLines, width, height) {
  const layers = [
    { points: sheetLines, stroke: STROKE.sheet, strokeDasharray: SHEET_DASH },
    { points: nestedLines, stroke: STROKE.nested },
    { points: textLines, stroke: STROKE.text },
  ]

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const layer of layers) {
    for (const line of layer.points) {
      for (const p of line) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
  }

  if (!Number.isFinite(minX)) {
    paths.value = []
    return
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const pad = 0.08
  const scale = Math.min(width / rangeX, height / rangeY) * (1 - pad * 2)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  paths.value = layers.flatMap((layer) =>
    layer.points.map((line) => {
      const d = line
        .map((p, i) => {
          const x = width / 2 + (p.x - cx) * scale
          const y = height / 2 - (p.y - cy) * scale
          return `${i === 0 ? 'M' : 'L'}${x} ${y}`
        })
        .join(' ')
      return { d, stroke: layer.stroke, strokeDasharray: layer.strokeDasharray }
    }),
  )
  if (!viewTransformed) {
    viewBox.value = { x: 0, y: 0, w: width, h: height }
  }
}

function onWheel(event) {
  viewTransformed = true
  const { x, y, w, h } = viewBox.value
  const svg = event.currentTarget
  const rect = svg.getBoundingClientRect()
  const mx = x + ((event.clientX - rect.left) / rect.width) * w
  const my = y + ((event.clientY - rect.top) / rect.height) * h
  const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12
  const nextW = w * factor
  const nextH = h * factor
  viewBox.value = {
    x: mx - ((mx - x) * nextW) / w,
    y: my - ((my - y) * nextH) / h,
    w: nextW,
    h: nextH,
  }
}

function resetView() {
  viewTransformed = false
  viewBox.value = { x: 0, y: 0, w: svgSize.value.w, h: svgSize.value.h }
}

function onPointerDown(event) {
  if (event.button !== 0) return
  event.preventDefault()
  const svg = event.currentTarget
  isDragging.value = true
  dragStart = {
    clientX: event.clientX,
    clientY: event.clientY,
    viewBox: { ...viewBox.value },
    rect: svg.getBoundingClientRect(),
  }
  svg.setPointerCapture(event.pointerId)
}

function onPointerMove(event) {
  if (!dragStart) return
  if ((event.buttons & 1) === 0) {
    onPointerEnd(event)
    return
  }
  viewTransformed = true
  const dx =
    ((event.clientX - dragStart.clientX) / dragStart.rect.width) * dragStart.viewBox.w
  const dy =
    ((event.clientY - dragStart.clientY) / dragStart.rect.height) * dragStart.viewBox.h
  viewBox.value = {
    x: dragStart.viewBox.x - dx,
    y: dragStart.viewBox.y - dy,
    w: dragStart.viewBox.w,
    h: dragStart.viewBox.h,
  }
}

function onPointerEnd(event) {
  if (dragStart && event?.currentTarget?.releasePointerCapture) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // pointer already released
    }
  }
  isDragging.value = false
  dragStart = null
}

async function redraw() {
  const el = containerRef.value
  if (!el) return

  const width = el.clientWidth
  const height = el.clientHeight
  if (width === 0 || height === 0) return

  const gen = ++redrawGeneration
  svgSize.value = { w: width, h: height }

  if (!props.geometryPayload) {
    paths.value = []
    return
  }

  const rhino = await loadRhino()
  if (gen !== redrawGeneration) return
  const names = OUTPUTS[material.value]
  const sheet3d = linesForParam(props.geometryPayload, names.sheet, rhino)
  const nested3d = linesForParam(props.geometryPayload, names.nested, rhino)
  const text3d = linesForParam(props.geometryPayload, names.text, rhino)

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const lines of [sheet3d, nested3d, text3d]) {
    for (const line of lines) {
      for (const p of line) {
        const { x, y, z } = xyz(p)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        minZ = Math.min(minZ, z)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        maxZ = Math.max(maxZ, z)
      }
    }
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  const spanZ = maxZ - minZ
  const useXz = spanY < spanX * 1e-4 && spanY < spanZ * 1e-4

  const to2d = (lines) =>
    lines.flatMap((line) => {
      const pts = line.map((p) => {
        const { x, y, z } = xyz(p)
        return useXz ? { x, y: z } : { x, y }
      })
      return pts.length >= 2 ? [pts] : []
    })

  fitPaths(to2d(sheet3d), to2d(nested3d), to2d(text3d), width, height)
}

function selectMaterial(next) {
  if (material.value !== next) material.value = next
}

watch(
  () => [props.geometryPayload, material.value],
  () => {
    viewTransformed = false
    void redraw()
  },
  { immediate: true },
)

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    if (dragStart) return
    void redraw()
  })
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  await nextTick()
  void redraw()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <section ref="containerRef" class="nesting-curve-preview">
    <div class="material-toggle-group" role="group" aria-label="Nesting material">
      <button
        type="button"
        class="material-toggle material-toggle--kiefer"
        :class="{ 'material-toggle--active': material === 'kiefer' }"
        :aria-pressed="material === 'kiefer'"
        @click="selectMaterial('kiefer')"
      >
        Kiefer
      </button>
      <button
        type="button"
        class="material-toggle material-toggle--film"
        :class="{ 'material-toggle--active': material === 'film' }"
        :aria-pressed="material === 'film'"
        @click="selectMaterial('film')"
      >
        Film
      </button>
    </div>
    <svg
      class="curve-svg"
      :class="{ 'curve-svg--dragging': isDragging }"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      preserveAspectRatio="xMidYMid meet"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @lostpointercapture="onPointerEnd"
      @dblclick="resetView"
    >
      <path
        v-for="(path, i) in paths"
        :key="i"
        :d="path.d"
        :stroke="path.stroke"
        :stroke-dasharray="path.strokeDasharray"
        fill="none"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  </section>
</template>

<style scoped>
.nesting-curve-preview {
  flex: 0 0 50%;
  min-height: 0;
  position: relative;
  background: #fff;
  border-top: 1px solid #ddd;
  overflow: hidden;
}

.material-toggle-group {
  position: absolute;
  top: 0.5rem;
  right: 0.65rem;
  z-index: 1;
  display: flex;
}

.material-toggle {
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--color-neutral-edited-accent);
  background: var(--color-neutral-bg);
  color: var(--color-result-text);
}

.material-toggle--kiefer {
  border-radius: 4px 0 0 4px;
  border-right: none;
}

.material-toggle--film {
  border-radius: 0 4px 4px 0;
}

.material-toggle:not(.material-toggle--active):hover {
  background: var(--color-neutral-bg-hover);
}

.material-toggle--active {
  background: var(--color-neutral-selected);
  border-color: var(--color-neutral-edited-accent);
  color: var(--color-result-text);
}

.curve-svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}

.curve-svg--dragging {
  cursor: grabbing;
}

.curve-svg path {
  pointer-events: none;
}
</style>
