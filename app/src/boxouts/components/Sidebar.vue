<script setup>
/**
 * Left sidebar: unified chat input for box specs and CSV/Excel attachments.
 */

import ChatPanelComponent from './ChatPanelComponent.vue'

defineProps({
  messages: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  awaitingConfirm: { type: Boolean, default: false },
  hasBoxes: { type: Boolean, default: false },
})

const emit = defineEmits(['send-text', 'attach-file', 'attach-error', 'confirm-choice', 'clear-all'])
</script>

<template>
  <aside class="sidebar">
    <h1>DoorBoxOut</h1>

    <ChatPanelComponent
      class="chat-slot"
      :messages="messages"
      :busy="busy"
      :awaiting-confirm="awaitingConfirm"
      :has-boxes="hasBoxes"
      @send-text="emit('send-text', $event)"
      @attach-file="emit('attach-file', $event)"
      @attach-error="emit('attach-error', $event)"
      @confirm-choice="emit('confirm-choice', $event)"
      @clear-all="emit('clear-all')"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  flex: 0 0 16.666667%;
  min-width: 240px;
  padding: 1rem;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  overflow: hidden;
}

h1 {
  margin: 0;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.chat-slot {
  flex: 1;
  min-height: 0;
}
</style>

