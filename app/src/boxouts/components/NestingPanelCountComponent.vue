<script setup>

// Per box: PerBox_JW → Nesting (sum per row)
// Full set: MultiBox_SimpleBreps → Nesting



import { computed } from 'vue'

import NestingPreviewButtonComponent from './NestingPreviewButtonComponent.vue'
import SendResultsComponent from './SendResultsComponent.vue'



const emit = defineEmits(['toggle', 'send-results'])

const props = defineProps({

  /** { kSheetNr, fSheetNr } summed per row from solveState.perBoxNesting */

  perBoxNesting: {

    type: Object,

    default: () => ({ kSheetNr: null, fSheetNr: null }), //gets new object per component instance

  },

  /** { kSheetNr, fSheetNr } from solveState.fullSetNesting */

  fullSetNesting: {

    type: Object,

    default: () => ({ kSheetNr: null, fSheetNr: null }),

  },

  /** True while a solve job is running */

  solving: Boolean,

  previewDisabled: Boolean,

})



function formatCount(value) {

  if (value == null) return '—'

  return String(value)

}



function countLabel(value) {

  if (props.solving && value == null) return 'Computing…'

  return formatCount(value)

}



const perBoxKieferLabel = computed(() => countLabel(props.perBoxNesting?.kSheetNr))

const perBoxFilmLabel = computed(() => countLabel(props.perBoxNesting?.fSheetNr))

const fullSetKieferLabel = computed(() => countLabel(props.fullSetNesting?.kSheetNr))

const fullSetFilmLabel = computed(() => countLabel(props.fullSetNesting?.fSheetNr))

</script>



<template>

  <section class="nesting-panel-bar">

    <section class="nesting-column nesting-column--counts">

      <h2

        class="nesting-heading"

        tabindex="0"

        data-tooltip="Amount of panels required for production if each box is nested individually."

      >

        Per Box Nesting

      </h2>

      <dl class="count-list">

        <div class="count-row">

          <dt>Kiefer Plate Panel Count</dt>

          <span class="count-leader" aria-hidden="true" />

          <dd>{{ perBoxKieferLabel }}</dd>

        </div>

        <div class="count-row">

          <dt>Film Plate Panel Count</dt>

          <span class="count-leader" aria-hidden="true" />

          <dd>{{ perBoxFilmLabel }}</dd>

        </div>

      </dl>

    </section>



    <div class="nesting-divider" aria-hidden="true" />



    <section class="nesting-column nesting-column--counts">

      <h2

        class="nesting-heading"

        tabindex="0"

        data-tooltip="Amount of panels required for production if all boxes are nested simultaneously."

      >

        Full Set Nesting

      </h2>

      <dl class="count-list">

        <div class="count-row">

          <dt>Kiefer Plate Panel Count</dt>

          <span class="count-leader" aria-hidden="true" />

          <dd>{{ fullSetKieferLabel }}</dd>

        </div>

        <div class="count-row">

          <dt>Film Plate Panel Count</dt>

          <span class="count-leader" aria-hidden="true" />

          <dd>{{ fullSetFilmLabel }}</dd>

        </div>

      </dl>

    </section>



    <div class="nesting-divider" aria-hidden="true" />



    <section class="nesting-column nesting-column--action">

      <NestingPreviewButtonComponent
        :disabled="previewDisabled"
        @toggle="emit('toggle')"
      />

      <SendResultsComponent
        :disabled="previewDisabled"
        @click="emit('send-results')"
      />

    </section>

  </section>

</template>



<style scoped>

.nesting-panel-bar {

  font-size: 0.8rem;

  display: flex;

  flex-direction: row;

  align-items: stretch;

  gap: 0.75rem;

}



.nesting-column--counts {

  flex: 1;

  min-width: 0;

  display: flex;

  flex-direction: column;

  gap: 0.55rem;

}



.nesting-divider {

  flex-shrink: 0;

  width: 1px;

  align-self: stretch;

  background: #ddd;

  margin: 0 0.25rem;

}



.nesting-column--action {

  flex: 0 0 auto;

  display: flex;

  align-items: center;

  gap: 0.5rem;

  padding-left: 0;

}



.nesting-heading {

  margin: 0;

  font-size: 0.85rem;

  font-weight: 600;

  position: relative;

  width: fit-content;

  cursor: help;

}



.nesting-heading::after {

  content: attr(data-tooltip);

  position: absolute;

  left: 0;

  bottom: calc(100% + 0.35rem);

  width: max-content;

  max-width: 16rem;

  padding: 0.4rem 0.55rem;

  font-size: 0.75rem;

  font-weight: 400;

  line-height: 1.35;

  color: #fff;

  background: #333;

  border-radius: 4px;

  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);

  opacity: 0;

  visibility: hidden;

  pointer-events: none;

  z-index: 20;

  transition: opacity 0.12s ease, visibility 0.12s ease;

}



.nesting-heading:hover,

.nesting-heading:focus-visible {

  z-index: 30;

}



.nesting-heading:hover::after,

.nesting-heading:focus-visible::after {

  opacity: 1;

  visibility: visible;

}



.count-list {

  margin: 0;

  display: flex;

  flex-direction: column;

  gap: 0.5rem;

}



.count-row {

  display: flex;

  align-items: baseline;

  gap: 0.55rem;

}



.count-leader {

  flex: 1;

  min-width: 0.5rem;

  border-bottom: 1px solid #ddd;

  margin-bottom: 0.15em;

}



dt {

  margin: 0;

  color: var(--color-text-muted, #666);

  white-space: nowrap;

}



dd {

  margin: 0;

  flex-shrink: 0;

  font-variant-numeric: tabular-nums;

  font-weight: 600;

}

</style>

