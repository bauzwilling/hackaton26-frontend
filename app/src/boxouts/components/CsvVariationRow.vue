<script setup>
/**
 * Single row in the variation parameter table: status icon, name, three numeric params.
 */

import {
  CSV_CELL_EMPTY,
  CSV_CELL_MISSING,
  CSV_CELL_OUT_OF_RANGE,
  CSV_GH_INPUT_NAMES,
  CSV_GH_PARAM_BOUNDS,
  coerceQuantity,
  formatVariationCellDisplay,
  isParamValueValid,
} from '../lib/csv.js'

const props = defineProps({
  row: Object,
  selected: Boolean,
  activeCellKey: { type: String, default: null },
  editedParams: Object,
  emptyCellKeys: { type: Object, default: () => new Set() },
  status: { type: String, default: 'pending' },
  errorMessage: { type: String, default: null },
})

const emit = defineEmits(['select', 'update:cell', 'edit-cell', 'close-cell', 'delete'])

function cellKey(param) {
  return `${props.row.index}:${param}`
}

function isCellActive(param) {
  return props.activeCellKey === cellKey(param)
}

function isEdited(param) {
  return props.editedParams.has(cellKey(param))
}

function nameDisplay() {
  return formatVariationCellDisplay(props.row.name, { isName: true })
}

function paramDisplay(param) {
  if (isQuantityParam(param)) return String(props.row.Quantity ?? 1)
  if (props.row[param] == null && props.emptyCellKeys.has(cellKey(param))) {
    return CSV_CELL_EMPTY
  }
  return formatVariationCellDisplay(props.row[param], { param })
}

function cellClass(param) {
  const text = paramDisplay(param)
  if (text === CSV_CELL_EMPTY) return 'cell-empty'
  if (text === CSV_CELL_MISSING) return 'cell-missing'
  if (text === CSV_CELL_OUT_OF_RANGE) return 'cell-out-of-range'
  if (!isCellActive(param) && isEdited(param)) return 'cell-edited'
  return null
}

function nameCellClass() {
  const text = nameDisplay()
  if (text === CSV_CELL_MISSING) return 'cell-missing'
  return null
}

function isQuantityParam(param) {
  return param === 'Quantity'
}

function openCell(param) {
  emit('edit-cell', { index: props.row.index, param })
}

function commitCell(param, event) {
  if (isQuantityParam(param)) {
    const value = coerceQuantity(event.target.value)
    if (value < 1) return
    emit('update:cell', { index: props.row.index, param, value })
    return
  }
  const value = Number.parseInt(event.target.value, 10)
  if (!Number.isFinite(value) || !isParamValueValid(value, param)) return
  emit('update:cell', { index: props.row.index, param, value })
}

function onCellBlur(param) {
  const key = cellKey(param)
  setTimeout(() => {
    if (props.activeCellKey === key) emit('close-cell')
  }, 0)
}

function onEnter(param, event) {
  commitCell(param, event)
  if (isQuantityParam(param) || Number.isFinite(Number.parseInt(event.target.value, 10))) {
    event.target.blur()
  }
}

function cellInputSize(param) {
  if (isQuantityParam(param)) {
    return Math.max(2, String(props.row.Quantity ?? 1).length)
  }
  const raw = props.row[param]
  return Math.max(2, raw == null ? 2 : String(raw).length)
}
</script>

<template>
  <tr
    class="csv-variation-row"
    :class="{ selected, computing: status === 'computing' }"
  >
    <td class="status-cell">
      <span
        v-if="status === 'computing'"
        class="status-indicator spinner"
        title="Computing…"
        aria-label="Computing"
      />
      <span
        v-else-if="status === 'done'"
        class="status-indicator done"
        title="Geometry ready"
        aria-label="Done"
      >✓</span>
      <span
        v-else-if="status === 'failed'"
        class="status-indicator failed"
        :title="errorMessage || 'Compute failed'"
        aria-label="Failed"
      >!</span>
      <span v-else class="status-indicator pending" aria-hidden="true" />
    </td>
    <td :class="nameCellClass()" class="name-cell" @click.stop="emit('select', row.index)">
      {{ nameDisplay() }}
    </td>
    <td
      v-for="param in CSV_GH_INPUT_NAMES"
      :key="param"
      :class="cellClass(param)"
      class="param-cell"
      @mousedown.prevent="openCell(param)"
    >
      <input
        v-if="isCellActive(param)"
        type="number"
        class="cell-input"
        autofocus
        :size="cellInputSize(param)"
        :value="row[param] ?? ''"
        :min="CSV_GH_PARAM_BOUNDS[param].min"
        :max="CSV_GH_PARAM_BOUNDS[param].max"
        step="1"
        @mousedown.stop
        @change="commitCell(param, $event)"
        @keydown.enter="onEnter(param, $event)"
        @blur="onCellBlur(param)"
      />
      <span v-else>{{ paramDisplay(param) }}</span>
    </td>
    <td
      class="param-cell"
      @mousedown.prevent="openCell('Quantity')"
    >
      <input
        v-if="isCellActive('Quantity')"
        type="number"
        class="cell-input"
        autofocus
        :size="cellInputSize('Quantity')"
        :value="row.Quantity ?? 1"
        min="1"
        step="1"
        @mousedown.stop
        @change="commitCell('Quantity', $event)"
        @keydown.enter="onEnter('Quantity', $event)"
        @blur="onCellBlur('Quantity')"
      />
      <span v-else>{{ paramDisplay('Quantity') }}</span>
    </td>
    <td class="delete-cell">
      <button type="button" class="delete-btn" aria-label="Delete row" @click.stop="emit('delete')">×</button>
    </td>
  </tr>
</template>

<style scoped>
.csv-variation-row {
  cursor: default;
}

.name-cell {
  cursor: pointer;
}

.param-cell {
  cursor: text;
}

.csv-variation-row.computing {
  background: var(--color-neutral-bg);
}

.csv-variation-row:nth-child(even):not(.computing):not(.selected) {
  background: var(--color-neutral-bg);
}

.csv-variation-row:hover {
  background: var(--color-neutral-bg-hover);
}

.csv-variation-row.selected {
  background: var(--color-selection-bg);
  box-shadow: inset 3px 0 0 var(--color-selection);
}

.csv-variation-row.selected:hover {
  background: var(--color-selection-bg);
}

.status-cell {
  width: 1.75rem;
  padding-left: 0.45rem;
  padding-right: 0.25rem;
  text-align: center;
}

.status-indicator {
  display: inline-block;
  width: 0.85rem;
  height: 0.85rem;
  line-height: 0.85rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-align: center;
}

.status-indicator.pending {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #ccc;
  vertical-align: middle;
}

.status-indicator.done {
  color: #2e7d32;
}

.status-indicator.failed {
  color: #c0392b;
}

.status-indicator.spinner {
  border: 2px solid #ccc;
  border-top-color: var(--color-result-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

td {
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid #e8e8e8;
}

td.cell-edited {
  background: var(--color-neutral-edited);
  box-shadow: inset 2px 0 0 var(--color-neutral-edited-accent);
}

td.cell-empty {
  background: var(--color-neutral-bg-hover);
  color: var(--color-result-text);
  font-style: italic;
}

td.cell-missing {
  background: #fdecea;
  color: #a94442;
  font-style: italic;
}

td.cell-out-of-range {
  background: #fff3e0;
  color: #b45309;
  font-style: italic;
}

.csv-variation-row.selected td.cell-edited {
  background: #d4e8f5;
}

.csv-variation-row.selected td.cell-empty {
  background: #d9edf8;
}

.csv-variation-row.selected td.cell-missing {
  background: #f5d0cd;
}

.csv-variation-row.selected td.cell-out-of-range {
  background: #ffe8c7;
}

.cell-input {
  width: auto;
  min-width: 2ch;
  max-width: 100%;
  field-sizing: content;
  padding: 0.15rem 0.25rem;
  font-size: inherit;
  font-family: inherit;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-sizing: border-box;
  -moz-appearance: textfield;
  appearance: textfield;
}

.cell-input::-webkit-outer-spin-button,
.cell-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.cell-input:focus {
  outline: none;
  border-color: var(--color-neutral-edited-accent);
}

.delete-cell {
  width: 1.75rem;
  padding: 0.45rem 0.35rem;
  text-align: center;
}

.delete-btn {
  padding: 0;
  border: none;
  background: none;
  font-size: 1rem;
  line-height: 1;
  color: #999;
  cursor: pointer;
}

.delete-btn:hover {
  color: #c0392b;
}
</style>
