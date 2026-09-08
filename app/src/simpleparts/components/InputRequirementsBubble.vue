<script setup>
/**
 * Assistant-style bubble that opens input file requirements in a modal.
 * Shown at the top of the chat on app open. Template downloads appear first.
 */

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  /** Incremented by the app when a file error should open this modal. */
  openTick: {
    type: Number,
    default: 0,
  },
})

const EXAMPLE_FILES = [
  {
    label: '2D DXF',
    href: '/input-requirements/SimplePartsInputExample2dDXF.dxf',
    filename: 'SimplePartsInputExample2dDXF.dxf',
  },
  {
    label: '3D DXF',
    href: '/input-requirements/SimplePartsInputExample3dDXF.dxf',
    filename: 'SimplePartsInputExample3dDXF.dxf',
  },
  {
    label: '2D DWG',
    href: '/input-requirements/SimplePartsInputExampleDWG.dwg',
    filename: 'SimplePartsInputExampleDWG.dwg',
  },
  {
    label: '3DM',
    href: '/input-requirements/SimplePartsInputExample3dm.3dm',
    filename: 'SimplePartsInputExample3dm.3dm',
  },
]

const FORMAT_TEMPLATE_SRC = '/input-requirements/requirements3D.png'

const requirementsOpen = ref(false)
const previewOpen = ref(false)
const rootRef = ref(null)

function openRequirements() {
  requirementsOpen.value = true
}

function closeRequirements() {
  requirementsOpen.value = false
}

function openPreview() {
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
}

function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (previewOpen.value) {
    closePreview()
    return
  }
  if (requirementsOpen.value) closeRequirements()
}

function openAndScrollIntoView() {
  requirementsOpen.value = true
  nextTick(() => {
    rootRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

watch(
  () => props.openTick,
  (tick) => {
    if (tick > 0) openAndScrollIntoView()
  },
)

watch([requirementsOpen, previewOpen], ([reqOpen, prevOpen]) => {
  document.body.style.overflow = reqOpen || prevOpen ? 'hidden' : ''
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <article ref="rootRef" class="requirements-root">
    <div class="bubble-requirements">
      <button
        type="button"
        class="requirements-trigger"
        aria-haspopup="dialog"
        :aria-expanded="requirementsOpen"
        @click="openRequirements"
      >
        Input file requirements
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="requirementsOpen"
        class="requirements-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="requirements-modal-title"
      >
        <div class="requirements-modal__backdrop" @click="closeRequirements" />
        <div class="requirements-modal__panel">
          <header class="requirements-modal__header">
            <h2 id="requirements-modal-title" class="requirements-modal__title">
              Input file requirements
            </h2>
            <button
              type="button"
              class="requirements-modal__close"
              aria-label="Close"
              @click="closeRequirements"
            >
              ×
            </button>
          </header>

          <div class="requirements-body">
            <p class="intro">
              For the pipeline to work, the input file needs to follow these format and geometrical
              requirements.
            </p>

            <section class="req-section req-section--downloads">
              <h3 class="req-heading">Downloads</h3>
              <div class="download-stack">
                <a
                  class="download-btn download-btn--primary"
                  href="/input-requirements/input-requirements.pdf"
                  download="input-requirements.pdf"
                >
                  Requirements PDF
                </a>
                <button type="button" class="download-btn" @click="openPreview">
                  Preview template format
                </button>
              </div>

              <p class="examples-label">Example files</p>
              <div class="example-grid">
                <a
                  v-for="file in EXAMPLE_FILES"
                  :key="file.href"
                  class="download-btn"
                  :href="file.href"
                  :download="file.filename"
                >
                  {{ file.label }}
                </a>
              </div>
            </section>

            <section class="req-section">
              <h3 class="req-heading">Admitted formats</h3>
              <div class="format-badges">
                <span class="format-badge">.dxf</span>
                <span class="format-badge">.3dm</span>
                <span class="format-badge">.dwg</span>
              </div>
            </section>

            <section class="req-section">
              <h3 class="req-heading">Parts</h3>
              <p>Files can contain both 2D curves or 3D geometry.</p>
              <ul>
                <li>
                  <strong>Curves:</strong> closed polylines, flattened to Z=0, with cuts made
                  (boundaries within exterior boundaries).
                </li>
                <li><strong>3D:</strong> geometry shall be mesh or brep.</li>
              </ul>
            </section>

            <section class="req-section">
              <h3 class="req-heading">Text / information</h3>
              <p>
                Nesting uses metadata from text elements. You can also edit it in the app by clicking
                parts or via chat.
              </p>
              <p>
                Place text next to the part (above/under) or inside it. Distant annotations yield
                incorrect results.
              </p>
              <ul>
                <li>
                  <strong>Name:</strong> serial numbers/codes. Redundant text is skipped by default.
                </li>
                <li>
                  <strong>Amount:</strong> use <code>7x</code>, <code>7 Stk.</code> or <code>7 Stück</code> format. Defaults to 1 if omitted.
                </li>
                <li><strong>Material:</strong> set directly on the app.</li>
              </ul>
            </section>

            <section class="req-section">
              <h3 class="req-heading">Layers</h3>
              <p>
                Layers are ignored for computation. Prefer simple structures (e.g. boundaries layer,
                text layer) for faster processing.
              </p>
            </section>

            <section class="req-section">
              <h3 class="req-heading">Other elements</h3>
              <p>
                Annotations, dimensions and anything outside of curves, meshes, breps and
                text objects are disregarded. Blocks are not recognized: please explode any containing
                relevant geometry for processing.
              </p>
            </section>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="previewOpen"
        class="template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-modal-title"
      >
        <div class="template-modal__backdrop" @click="closePreview" />
        <div class="template-modal__panel">
          <header class="template-modal__header">
            <h2 id="template-modal-title" class="template-modal__title">Format template</h2>
            <button
              type="button"
              class="template-modal__close"
              aria-label="Close"
              @click="closePreview"
            >
              ×
            </button>
          </header>
          <div class="template-modal__body">
            <img
              class="template-modal__image"
              :src="FORMAT_TEMPLATE_SRC"
              alt="Input file format template"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </article>
</template>

<style scoped>
.requirements-root {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-self: stretch;
}

.bubble-requirements {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-summary);
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.requirements-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.7rem 0.95rem;
  cursor: pointer;
  user-select: none;
  border: none;
  background: var(--color-accent-bg);
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--color-accent);
  text-align: center;
}

.requirements-trigger:hover {
  background: var(--color-accent-bg-hover);
}

.requirements-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.requirements-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.requirements-modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(560px, 96vw);
  max-height: 92vh;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  color: var(--color-text-summary);
  font-size: 0.78rem;
  line-height: 1.45;
}

.requirements-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-accent-bg);
}

.requirements-modal__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-accent);
}

.requirements-modal__close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0.15rem 0.35rem;
}

.requirements-modal__close:hover {
  color: var(--color-text-summary);
}

.requirements-body {
  overflow-y: auto;
  padding: 0.75rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-sizing: border-box;
}

.intro {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.req-section {
  margin: 0;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-hover);
}

.req-section--downloads {
  background: var(--color-accent-bg);
  border-color: #c5d9ef;
}

.req-heading {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-accent);
}

.req-section p {
  margin: 0 0 0.35rem;
}

.req-section p:last-child {
  margin-bottom: 0;
}

.req-section ul {
  margin: 0;
  padding-left: 1.05rem;
}

.req-section li {
  margin-bottom: 0.25rem;
}

.req-section li:last-child {
  margin-bottom: 0;
}

.req-section code {
  font-size: 0.72rem;
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  background: var(--color-surface);
  padding: 0.08rem 0.28rem;
  border-radius: 3px;
  border: 1px solid var(--color-border);
}

.format-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.format-badge {
  display: inline-block;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-summary);
}

.download-stack {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.examples-label {
  margin: 0.55rem 0 0.35rem !important;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-summary);
}

.example-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-accent);
  font: inherit;
  font-size: 0.74rem;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.download-btn:hover {
  background: var(--color-accent-bg-hover);
  border-color: var(--color-accent);
}

.download-btn--primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-surface);
}

.download-btn--primary:hover {
  background: #163d6e;
  border-color: #163d6e;
  color: var(--color-surface);
}

.template-modal {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.template-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.template-modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(960px, 96vw);
  max-height: 92vh;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.template-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-accent-bg);
}

.template-modal__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-accent);
}

.template-modal__close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0.15rem 0.35rem;
}

.template-modal__close:hover {
  color: var(--color-text-summary);
}

.template-modal__body {
  overflow: auto;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-hover);
}

.template-modal__image {
  display: block;
  max-width: 100%;
  max-height: calc(92vh - 5rem);
  height: auto;
  object-fit: contain;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
</style>
