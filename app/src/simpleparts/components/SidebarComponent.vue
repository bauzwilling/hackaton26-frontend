<script setup>
/**
 * Left sidebar: upload chat.
 */

import ChatPanelComponent from './ChatPanelComponent.vue'
import databLogo from '../assets/dataBLogo.png'

defineProps({
  messages: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  busyMessage: { type: String, default: '' },
  hasBoxes: { type: Boolean, default: false },
  canStartNesting: { type: Boolean, default: false },
  canStopNesting: { type: Boolean, default: false },
  nestRevealPaused: { type: String, default: null },
  canStartLeftoverNesting: { type: Boolean, default: false },
  nestingButtonPrompt: {
    type: String,
    default: 'File ready — run nesting to flatten and nest parts.',
  },
  leftoverNestingButtonPrompt: {
    type: String,
    default: 'Unassigned parts ready — run nesting to place them on the sheet.',
  },
  nestingNeedsRerun: { type: Boolean, default: false },
  activeSheetSizeSelectId: { type: String, default: null },
  activeSheetSizeConfirmId: { type: String, default: null },
  activeMaterialSelectId: { type: String, default: null },
  activeMaterialConfirmId: { type: String, default: null },
  activeConfirmId: { type: String, default: null },
  materials: { type: Array, default: () => [] },
  inputRequirementsOpenTick: { type: Number, default: 0 },
})

const emit = defineEmits([
  'send-text',
  'attach-file',
  'attach-error',
  'clear-all',
  'start-nesting',
  'stop-nesting',
  'show-nesting-result',
  'sheet-size-choice',
  'modify-sheet-size',
  'material-choice',
  'modify-material',
  'confirm-choice',
])
</script>

<template>
  <aside class="sidebar">
    <header class="brand">
      <img
        class="brand-logo"
        :src="databLogo"
        alt="datab"
        width="32"
        height="42"
      />
      <h1>Simple Parts</h1>
    </header>

    <ChatPanelComponent
      class="chat-slot"
      :messages="messages"
      :busy="busy"
      :busy-message="busyMessage"
      :has-boxes="hasBoxes"
      :can-start-nesting="canStartNesting"
      :can-stop-nesting="canStopNesting"
      :nest-reveal-paused="nestRevealPaused"
      :can-start-leftover-nesting="canStartLeftoverNesting"
      :nesting-button-prompt="nestingButtonPrompt"
      :leftover-nesting-button-prompt="leftoverNestingButtonPrompt"
      :nesting-needs-rerun="nestingNeedsRerun"
      :active-sheet-size-select-id="activeSheetSizeSelectId"
      :active-sheet-size-confirm-id="activeSheetSizeConfirmId"
      :active-material-select-id="activeMaterialSelectId"
      :active-material-confirm-id="activeMaterialConfirmId"
      :active-confirm-id="activeConfirmId"
      :materials="materials"
      :input-requirements-open-tick="inputRequirementsOpenTick"
      @send-text="emit('send-text', $event)"
      @attach-file="emit('attach-file', $event)"
      @attach-error="emit('attach-error', $event)"
      @clear-all="emit('clear-all')"
      @start-nesting="emit('start-nesting')"
      @stop-nesting="emit('stop-nesting')"
      @show-nesting-result="emit('show-nesting-result')"
      @sheet-size-choice="emit('sheet-size-choice', $event)"
      @modify-sheet-size="emit('modify-sheet-size', $event)"
      @material-choice="emit('material-choice', $event)"
      @modify-material="emit('modify-material', $event)"
      @confirm-choice="emit('confirm-choice', $event)"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  flex: 0 0 22%;
  min-width: 300px;
  padding: 1rem;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  overflow: hidden;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 0.25rem 0 0.4rem;
  min-width: 0;
}

.brand-logo {
  flex: 0 0 auto;
  width: 32px;
  height: auto;
  display: block;
  object-fit: contain;
}

h1 {
  margin: 0;
  font-size: 1.65rem;
  line-height: 1;
  letter-spacing: -0.02em;
}

.chat-slot {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
