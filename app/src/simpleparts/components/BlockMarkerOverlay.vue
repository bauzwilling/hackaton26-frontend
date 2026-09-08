<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { readPartColorHex } from '../partColors.js'

const props = defineProps({
  markers: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  markerShape: { type: String, default: 'cross' },
})

const canvasRef = ref(null)
let sizePx = 8
let lastProjectFn = null
let lastMarkerSizePx = 0
let lastSelectedId = ''
let lastMarkerShape = 'cross'
let resizeObserver = null

function cssSummaryColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-text-summary').trim()
    || '#333333'
}

function resizeCanvas() {
  const canvas = canvasRef.value
  const parent = canvas?.parentElement
  if (!canvas || !parent) return null
  const rect = parent.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  return { ctx: canvas.getContext('2d'), dpr, w: rect.width, h: rect.height }
}

function paint() {
  if (!lastProjectFn) return
  const sized = resizeCanvas()
  if (!sized?.ctx) return
  const { ctx, dpr, w, h } = sized

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  sizePx = lastMarkerSizePx

  const defaultColor = cssSummaryColor()
  const selectedColor = readPartColorHex('orange') || '#ff8c00'
  const half = sizePx / 2
  const lineWidth = Math.max(1, Math.min(2, sizePx * 0.05))

  for (const marker of props.markers) {
    const { left, top } = lastProjectFn(marker.x, marker.y)
    const color = marker.id === lastSelectedId ? selectedColor : defaultColor
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    if (lastMarkerShape === 'circle') {
      ctx.beginPath()
      ctx.arc(left, top, half, 0, Math.PI * 2)
      ctx.stroke()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(left - half, top)
    ctx.lineTo(left + half, top)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(left, top - half)
    ctx.lineTo(left, top + half)
    ctx.stroke()
  }
}

function redraw(projectFn, markerSizePx, selectedId, markerShape = 'cross') {
  lastProjectFn = projectFn
  lastMarkerSizePx = markerSizePx
  lastSelectedId = selectedId
  lastMarkerShape = markerShape
  paint()
}

defineExpose({ redraw })

onMounted(() => {
  const parent = canvasRef.value?.parentElement
  if (!parent) return
  resizeObserver = new ResizeObserver(() => paint())
  resizeObserver.observe(parent)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <canvas ref="canvasRef" class="block-markers-canvas" />
</template>

<style scoped>
.block-markers-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
</style>
