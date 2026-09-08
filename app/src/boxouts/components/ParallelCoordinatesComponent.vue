<script setup>
/**
 * D3 parallel coordinates chart: one polyline per CSV variation across BoxDepth/Height/Width.
 * Selection is synced with the table and 3D viewer via v-model selectedIndex.
 */

import { nextTick, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import {
  CSV_GH_INPUT_NAMES,
  CSV_GH_PARAM_BOUNDS,
  CSV_GH_PARAM_LABELS,
  formatDefaultBoxName,
  getVariationRowCount,
  isParamValueValid,
} from '../lib/csv.js'

const LINE_COLOR = '#3498db'

const props = defineProps({
  inputLists: Object,
  variationNames: { type: Array, default: () => [] },
})

// Synced with table/viewer — which variation is selected (-1 = none)
const selectedIndex = defineModel('selectedIndex', { default: -1 })

const svgContainer = ref(null)
const errorMsg = ref('')

let resizeObserver = null
let observedContainer = null
let layoutRetryId = 0
let isRendering = false
let pendingRender = false

const AXIS_TICK_COUNT = 5

/** Evenly spaced tick values along a parameter axis */
function referenceTickValues(min, max) {
  if (AXIS_TICK_COUNT <= 1) return [min]
  return Array.from({ length: AXIS_TICK_COUNT }, (_, i) => min + ((max - min) * i) / (AXIS_TICK_COUNT - 1))
}

function formatAxisValue(value) {
  return String(Math.round(value))
}

/** Turn inputLists into D3-ready row objects with __rowIndex (skips incomplete rows) */
function buildPlotData(lists) {
  const count = getVariationRowCount(lists)
  const data = []

  for (let i = 0; i < count; i++) {
    const row = { __rowIndex: i }
    let valid = true
    for (const col of CSV_GH_INPUT_NAMES) {
      const value = lists[col]?.[i]
      if (!isParamValueValid(value, col)) {
        valid = false
        break
      }
      row[col] = value
    }
    if (valid) data.push(row)
  }

  return { columns: CSV_GH_INPUT_NAMES, data }
}

function onLineClick(rowIndex) {
  selectedIndex.value = selectedIndex.value === rowIndex ? -1 : rowIndex
}

// Thicker/brighter line for selected variation
function lineStyle(rowIndex) {
  const selected = selectedIndex.value
  if (selected < 0) {
    return { strokeWidth: 1.5, opacity: 0.5 }
  }
  if (rowIndex === selected) {
    return { strokeWidth: 3, opacity: 1 }
  }
  return { strokeWidth: 1.5, opacity: 0.28 }
}

function variationNameForIndex(index) {
  const trimmed = props.variationNames[index]?.trim()
  if (trimmed) return trimmed
  return formatDefaultBoxName(index)
}

function safeMeasureText(textNode) {
  const text = textNode?.textContent ?? ''
  try {
    const bbox = textNode.getBBox()
    if (bbox.width > 0 && bbox.height > 0) {
      return { width: bbox.width, height: bbox.height }
    }
  } catch {
    // fall through to estimate
  }
  return { width: text.length * 6, height: 12 }
}

// Small label showing a parameter value on the selected line
function appendValueBadge(layer, xPos, yPos, value) {
  const padX = 6
  const padY = 3
  const badgeX = xPos + 10

  const badge = layer.append('g').attr('class', 'value-badge').style('pointer-events', 'none')

  badge
    .append('circle')
    .attr('cx', xPos)
    .attr('cy', yPos)
    .attr('r', 5)
    .attr('fill', LINE_COLOR)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)

  const text = badge
    .append('text')
    .attr('fill', LINE_COLOR)
    .attr('font-weight', '600')
    .attr('font-size', '10px')
    .text(value)

  const bbox = safeMeasureText(text.node())
  const rectWidth = bbox.width + padX * 2
  const rectHeight = bbox.height + padY * 2

  badge
    .insert('rect', 'text')
    .attr('x', badgeX)
    .attr('y', yPos - rectHeight / 2)
    .attr('width', rectWidth)
    .attr('height', rectHeight)
    .attr('rx', 5)
    .attr('ry', 5)
    .attr('fill', '#fff')
    .attr('stroke', LINE_COLOR)
    .attr('stroke-width', 0.75)

  text
    .attr('x', badgeX + rectWidth / 2)
    .attr('y', yPos)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
}

// Label showing the variation name at the top
function appendVariationNameBadge(layer, xPos, yPos, name) {
  const padX = 6
  const padY = 3
  const dotX = xPos + 5
  const badgeX = xPos + 10

  const badge = layer.append('g').attr('class', 'variation-name-badge').style('pointer-events', 'none')

  badge
    .append('circle')
    .attr('cx', dotX)
    .attr('cy', yPos)
    .attr('r', 5)
    .attr('fill', LINE_COLOR)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)

  const text = badge
    .append('text')
    .attr('fill', LINE_COLOR)
    .attr('font-weight', 'bold')
    .attr('font-size', '10px')
    .text(name)

  const bbox = safeMeasureText(text.node())
  const rectWidth = bbox.width + padX * 2
  const rectHeight = bbox.height + padY * 2

  badge
    .insert('rect', 'text')
    .attr('x', badgeX)
    .attr('y', yPos - rectHeight / 2)
    .attr('width', rectWidth)
    .attr('height', rectHeight)
    .attr('rx', 5)
    .attr('ry', 5)
    .attr('fill', '#fff')
    .attr('stroke', LINE_COLOR)
    .attr('stroke-width', 0.75)

  text
    .attr('x', badgeX + rectWidth / 2)
    .attr('y', yPos)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
}

/** Build or rebuild the full SVG chart (axes, lines, selection badges, hit targets) */
function renderParallelCoordinates() {
  const container = svgContainer.value
  if (!container || !props.inputLists) return

  const count = getVariationRowCount(props.inputLists)
  if (count === 0) {
    errorMsg.value = 'No boxes in input'
    d3.select(container).selectAll('*').remove()
    return
  }

  const { columns, data } = buildPlotData(props.inputLists)
  const currentSelectedIndex = selectedIndex.value

  const margin = { top: 36, right: 50, bottom: 26, left: 44 }
  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight
  if (containerWidth <= 0 || containerHeight <= 0) {
    queueLayoutRetry()
    return
  }

  const width = Math.max(containerWidth - margin.left - margin.right, 80)
  const height = Math.max(containerHeight - margin.top - margin.bottom, 80)

  isRendering = true
  detachResizeObserver()

  try {
    d3.select(container).selectAll('*').remove()
    errorMsg.value = ''

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Y scales: param min/max → pixel height
    const scales = {}
    for (const col of columns) {
      const { min, max } = CSV_GH_PARAM_BOUNDS[col]
      scales[col] = d3.scaleLinear().domain([min, max]).range([height, 0])
    }

    // X scale: evenly space the 3 parameter axes
    const xScale = d3.scalePoint().domain([...columns]).range([0, width])
    const lineGenerator = d3.line()

    const pathDataByRow = []

    // Draw one polyline per variation
    for (const row of data) {
      const points = columns.map((col) => [xScale(col), scales[col](row[col])])
      const pathD = lineGenerator(points)
      if (!pathD) continue
      const style = lineStyle(row.__rowIndex)

      pathDataByRow.push({ rowIndex: row.__rowIndex, pathD })

      svg
        .append('path')
        .attr('d', pathD)
        .attr('stroke', LINE_COLOR)
        .attr('stroke-width', style.strokeWidth)
        .attr('fill', 'none')
        .attr('opacity', style.opacity)
        .attr('pointer-events', 'none')
    }

    // Draw vertical axes with tick marks
    for (const col of columns) {
      const xPos = xScale(col)
      const { min, max } = CSV_GH_PARAM_BOUNDS[col]
      const scale = scales[col]
      const ticks = referenceTickValues(min, max)

      svg
        .append('line')
        .attr('x1', xPos)
        .attr('y1', 0)
        .attr('x2', xPos)
        .attr('y2', height)
        .attr('stroke', '#ccc')
        .attr('stroke-width', 1)
        .style('pointer-events', 'none')

      const axisTicks = svg.append('g').attr('class', 'axis-ticks').style('pointer-events', 'none')

      for (const value of ticks) {
        const y = scale(value)
        axisTicks
          .append('line')
          .attr('x1', xPos - 5)
          .attr('x2', xPos)
          .attr('y1', y)
          .attr('y2', y)
          .attr('stroke', '#bbb')
          .attr('stroke-width', 1)

        axisTicks
          .append('text')
          .attr('x', xPos - 7)
          .attr('y', y)
          .attr('dy', '0.32em')
          .attr('text-anchor', 'end')
          .attr('font-size', '10px')
          .attr('fill', '#666')
          .text(formatAxisValue(value))
      }

      svg
        .append('text')
        .attr('class', 'axis-label')
        .attr('x', xPos)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .attr('fill', '#333')
        .style('pointer-events', 'none')
        .text(CSV_GH_PARAM_LABELS[col])
    }

    // Highlight selected variation with value badges
    if (currentSelectedIndex >= 0) {
      const selectedRow = data.find((row) => row.__rowIndex === currentSelectedIndex)
      if (selectedRow) {
        const markersLayer = svg
          .append('g')
          .attr('class', 'selection-markers')
          .style('pointer-events', 'none')

        for (const col of CSV_GH_INPUT_NAMES) {
          const xPos = xScale(col)
          const yPos = scales[col](selectedRow[col])
          appendValueBadge(markersLayer, xPos, yPos, formatAxisValue(selectedRow[col]))
        }

        appendVariationNameBadge(
          markersLayer,
          xScale(CSV_GH_INPUT_NAMES[0]),
          16,
          variationNameForIndex(currentSelectedIndex),
        )
      }
    }

    // Invisible thick lines on top for click detection
    const hitLayer = svg.append('g').attr('class', 'hit-layer')
    for (const { rowIndex, pathD } of pathDataByRow) {
      hitLayer
        .append('path')
        .attr('d', pathD)
        .attr('stroke', LINE_COLOR)
        .attr('stroke-opacity', 0.001)
        .attr('stroke-width', 18)
        .attr('fill', 'none')
        .style('pointer-events', 'stroke')
        .style('cursor', 'pointer')
        .on('pointerup', (event) => {
          event.preventDefault()
          event.stopPropagation()
          onLineClick(rowIndex)
        })
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to render parallel coordinates plot'
    console.error(err)
  } finally {
    isRendering = false
    if (pendingRender) {
      pendingRender = false
      requestAnimationFrame(() => renderParallelCoordinates())
    } else {
      const currentContainer = svgContainer.value
      if (currentContainer) {
        ensureResizeObserver(currentContainer)
      }
    }
  }
}

// Retry render if container has zero size (not laid out yet)
function queueLayoutRetry() {
  const attempt = ++layoutRetryId
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (attempt !== layoutRetryId) return
      scheduleRender()
    })
  })
}

function detachResizeObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
  observedContainer = null
}

function ensureResizeObserver(container) {
  if (observedContainer === container) return
  detachResizeObserver()
  observedContainer = container
  resizeObserver = new ResizeObserver(() => {
    if (isRendering) return
    renderParallelCoordinates()
  })
  resizeObserver.observe(container)
}

async function scheduleRender() {
  if (!props.inputLists) return
  await nextTick()
  const container = svgContainer.value
  if (!container) return
  ensureResizeObserver(container)
  renderParallelCoordinates()
}

onUnmounted(() => {
  layoutRetryId++
  detachResizeObserver()
})

watch(
  () => [props.inputLists, svgContainer.value],
  () => {
    void scheduleRender()
  },
  { deep: true, flush: 'post' },
)

watch(selectedIndex, () => {
  void scheduleRender()
})
</script>

<template>
  <!-- D3 chart: one line per variation, click to select -->
  <div class="parallel-coords">
    <p v-if="errorMsg" class="message error">{{ errorMsg }}</p>
    <p v-else-if="!inputLists" class="message muted">Add boxes in the chat to preview them here</p>
    <div v-else ref="svgContainer" class="svg-container"></div>
  </div>
</template>

<style scoped>
.parallel-coords {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.svg-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.message {
  margin: auto;
  font-size: 0.85rem;
}

.message.muted {
  color: #888;
}

.message.error {
  color: #a33;
}
</style>
