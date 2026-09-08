<script setup>
/**
 * Variation parameter table; row click syncs selection with plot and viewer.
 * Parallel coordinates chart is rendered by App.vue above this component.
 */

import { computed, ref } from 'vue'
import {
  CSV_GH_INPUT_NAMES,
  CSV_GH_PARAM_LABELS,
  CSV_QUANTITY_COLUMN,
  CSV_VARIATION_COLUMN,
  getEditedCellKeys,
  getVariationRowCount,
  inputListsToVariationRows,
} from '../lib/csv.js'
import CsvVariationRow from './CsvVariationRow.vue'

const props = defineProps({
  inputLists: Object,
  csvSourceLists: Object,
  emptyCellKeys: { type: Object, default: () => new Set() },
  variationNames: Array,
  quantities: { type: Array, default: () => [] },
  /** Shared solve state from App (isSolving, variationStatuses, rowErrors) */
  solve: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['applyLists', 'deleteRow'])

const activeVariationIndex = defineModel('activeVariationIndex', { default: 0 })
const activeCellKey = ref(null)
const pendingDeleteIndex = ref(null)

const headers = [
  '',
  CSV_VARIATION_COLUMN,
  ...CSV_GH_INPUT_NAMES.map((p) => CSV_GH_PARAM_LABELS[p]),
  CSV_QUANTITY_COLUMN,
  '',
]

const rows = computed(() => {
  if (!props.inputLists) return null
  const count = getVariationRowCount(props.inputLists, props.variationNames, props.quantities)
  return count > 0
    ? inputListsToVariationRows(props.inputLists, props.variationNames, props.quantities)
    : null
})

const editedCellKeys = computed(() => {
  if (!props.csvSourceLists || !props.inputLists) return new Set()
  return getEditedCellKeys(
    props.csvSourceLists,
    props.inputLists,
    props.variationNames,
  )
})

function onRowSelect(index) {
  activeVariationIndex.value = index
}

function onEditCell({ index, param }) {
  activeCellKey.value = `${index}:${param}`
}

function onCellUpdate({ index, param, value }) {
  if (param === 'Quantity') {
    const nextQuantities = [...props.quantities]
    nextQuantities[index] = value
    emit('applyLists', { inputLists: props.inputLists, quantities: nextQuantities })
  } else {
    props.inputLists[param][index] = value
    emit('applyLists', { inputLists: props.inputLists, quantities: props.quantities })
  }
  activeCellKey.value = null
}

function onDeleteRequest(index) {
  if ((props.quantities[index] ?? 1) > 1) {
    pendingDeleteIndex.value = index
  } else {
    emit('deleteRow', index)
  }
}

function confirmDelete() {
  if (pendingDeleteIndex.value == null) return
  emit('deleteRow', pendingDeleteIndex.value)
  pendingDeleteIndex.value = null
}
</script>

<template>
  <section class="csv-preview">
    <div class="table-slot">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="(header, i) in headers" :key="i">{{ header }}</th>
          </tr>
        </thead>
        <tbody v-if="rows">
          <CsvVariationRow
            v-for="row in rows"
            :key="row.index"
            :row="row"
            :selected="row.index === activeVariationIndex"
            :active-cell-key="activeCellKey ?? null"
            :edited-params="editedCellKeys"
            :empty-cell-keys="emptyCellKeys"
            :status="solve.variationStatuses[row.index] ?? 'pending'"
            :error-message="solve.rowErrors.get(row.index) ?? null"
            @select="onRowSelect"
            @edit-cell="onEditCell"
            @update:cell="onCellUpdate"
            @close-cell="activeCellKey = null"
            @delete="onDeleteRequest(row.index)"
          />
        </tbody>
      </table>
    </div>
    <div v-if="pendingDeleteIndex != null" class="delete-overlay">
      <div class="delete-dialog">
        <p>This action will delete all same-size boxes. Modify quantity value to apply a specific count. Proceed with deletion?</p>
        <div class="delete-dialog__actions">
          <button type="button" @click="confirmDelete">Yes</button>
          <button type="button" @click="pendingDeleteIndex = null">Discard</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.csv-preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-slot {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.5rem 0.65rem;
  text-align: left;
  font-weight: 600;
  background: #f0f0f0;
  border-bottom: 1px solid #ccc;
  white-space: nowrap;
}

.delete-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(51, 51, 51, 0.75);
}

.delete-dialog {
  background: var(--color-surface, #fff);
  border-radius: 6px;
  padding: 1rem 1.25rem;
  max-width: 20rem;
  text-align: center;
}

.delete-dialog p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-summary, #444);
}

.delete-dialog__actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.delete-dialog__actions button {
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  background: var(--color-surface, #fff);
}
</style>
