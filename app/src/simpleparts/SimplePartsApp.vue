<script setup>
import ThreeMeshViewer from './components/ThreeMeshViewer.vue'
import NestingResultModal from './components/NestingResultModalComponent.vue'
import ModifiedPartsToggle from './components/ModifiedPartsToggle.vue'
import SidebarComponent from './components/SidebarComponent.vue'
import { useApp } from './features/useApp.js'
import './simpleparts.css'

const version = '0.1.18'

console.log('Simple Parts version:', version)

const {
  messages,
  busy,
  busyMessage,
  viewerBusy,
  hasBoxes,
  meshViewerRef,
  metadataOverrides,
  viewerClickForProperties,
  modifiedHandles,
  showModifiedPartsGreen,
  markModified,
  canStopNesting,
  showNestingButton,
  showLeftoverNestingButton,
  nestingButtonPrompt,
  leftoverNestingButtonPrompt,
  nestingNeedsRerun,
  nestRevealPaused,
  nestingViewerKey,
  activeSheetSizeSelectId,
  activeSheetSizeConfirmId,
  activeMaterialSelectId,
  activeMaterialConfirmId,
  activeLeftoverMaterialReuseId,
  pendingSheetMaterial,
  pendingLeftoverSheetMaterial,
  materials,
  showNestingModal,
  summonedPreview,
  leftoverNestPreview,
  meshPreview,
  meshPartDescriptors,
  nestingMeshPartDescriptors,
  unassignedPartIdsForViewer,
  previewNotice,
  annotationOverlayDxf,
  activeViewer,
  showMeshPreview,
  onAttachFile,
  onAttachError,
  onSendText,
  onClearAll,
  onStartNesting,
  onStopNesting,
  onSheetSizeChoice,
  onModifySheetSize,
  onMaterialChoice,
  onModifyMaterial,
  onConfirmChoice,
  closeNestingModal,
  openNestingModal,
  onNestUnassignedParts,
  inputRequirementsOpenTick,
} = useApp()
</script>

<template>
  <div class="app">
    <SidebarComponent
      :messages="messages"
      :busy="busy"
      :busy-message="busyMessage"
      :has-boxes="hasBoxes"
      :can-start-nesting="showNestingButton"
      :can-stop-nesting="canStopNesting"
      :nest-reveal-paused="nestRevealPaused"
      :can-start-leftover-nesting="showLeftoverNestingButton"
      :nesting-button-prompt="nestingButtonPrompt"
      :leftover-nesting-button-prompt="leftoverNestingButtonPrompt"
      :nesting-needs-rerun="nestingNeedsRerun"
      :active-sheet-size-select-id="activeSheetSizeSelectId"
      :active-sheet-size-confirm-id="activeSheetSizeConfirmId"
      :active-material-select-id="activeMaterialSelectId"
      :active-material-confirm-id="activeMaterialConfirmId"
      :active-confirm-id="activeLeftoverMaterialReuseId"
      :materials="materials"
      :input-requirements-open-tick="inputRequirementsOpenTick"
      @attach-file="onAttachFile"
      @attach-error="onAttachError"
      @send-text="onSendText"
      @clear-all="onClearAll"
      @start-nesting="onStartNesting"
      @stop-nesting="onStopNesting"
      @sheet-size-choice="onSheetSizeChoice"
      @modify-sheet-size="onModifySheetSize"
      @material-choice="onMaterialChoice"
      @modify-material="onModifyMaterial"
      @confirm-choice="onConfirmChoice"
      @show-nesting-result="openNestingModal"
    />
    <main class="main">
      <div class="mobile-toggle">
        <input type="radio" name="mobile-pane" id="mobile-chat" />
        <label for="mobile-chat">Agent</label>
        <input type="radio" name="mobile-pane" id="mobile-viewer" checked />
        <label for="mobile-viewer">DXF</label>
      </div>
      <div class="view">
        <div v-if="viewerBusy" class="viewer-busy" aria-busy="true" aria-label="Computing preview" />
        <ThreeMeshViewer
          v-if="activeViewer === 'nestingMesh'"
          ref="meshViewerRef"
          :key="summonedPreview.jobId ?? nestingViewerKey"
          :meshes="summonedPreview.assignedMeshes3d ?? []"
          :unassigned-meshes="summonedPreview.unassignedMeshes3d ?? []"
          :annotation-dxf="summonedPreview.inputTextDxf"
          :part-descriptors="nestingMeshPartDescriptors"
          v-model:metadata-overrides="metadataOverrides"
          :click-for-properties="viewerClickForProperties"
          :show-properties-panel="viewerClickForProperties"
          :modified-handles="modifiedHandles"
          :show-modified-parts-green="showModifiedPartsGreen"
          @mark-modified="markModified"
        />
        <ThreeMeshViewer
          v-else-if="activeViewer === 'inputMesh'"
          ref="meshViewerRef"
          :key="`input-preview-${nestingViewerKey}`"
          :meshes="meshPreview"
          :annotation-dxf="annotationOverlayDxf"
          :part-descriptors="meshPartDescriptors"
          v-model:metadata-overrides="metadataOverrides"
          :click-for-properties="viewerClickForProperties"
          :show-properties-panel="viewerClickForProperties"
          :modified-handles="modifiedHandles"
          :show-modified-parts-green="showModifiedPartsGreen"
          :unassigned-part-ids="unassignedPartIdsForViewer"
          @mark-modified="markModified"
        />
        <div
          v-else-if="activeViewer === 'notice'"
          class="preview-notice"
        >
          {{ previewNotice }}
        </div>
      </div>
      <div v-if="showMeshPreview && hasBoxes" class="viewer-toggles">
        <ModifiedPartsToggle v-model:show-modified-parts-green="showModifiedPartsGreen" />
      </div>
    </main>

    <NestingResultModal
      :open="showNestingModal"
      :job-id="summonedPreview?.jobId"
      :part-count="summonedPreview?.partCount ?? 0"
      :nested-count="summonedPreview?.nestedCount ?? summonedPreview?.partCount ?? 0"
      :unassigned-count="summonedPreview?.unassignedCount ?? 0"
      :unassigned-ids="summonedPreview?.unassignedIds ?? []"
      :unassigned-reasons="summonedPreview?.unassignedReasons ?? []"
      :dxf-text="summonedPreview?.dxfText ?? ''"
      :boundaries="summonedPreview?.boundaries ?? []"
      :block-inserts="summonedPreview?.blockInserts ?? []"
      :sheet-count="summonedPreview?.sheetCount ?? 1"
      :has-unassigned-dxf="summonedPreview?.hasUnassignedDxf ?? false"
      :sheet-x="summonedPreview?.sheetX ?? null"
      :sheet-y="summonedPreview?.sheetY ?? null"
      :sheet-thickness="summonedPreview?.sheetThickness ?? null"
      :nesting-metrics="summonedPreview?.nestingMetrics ?? null"
      :default-material="pendingSheetMaterial?.label ?? ''"
      :leftover-default-material="leftoverNestPreview?.materialLabel ?? pendingLeftoverSheetMaterial?.label ?? ''"
      :leftover-job-id="leftoverNestPreview?.jobId ?? null"
      :leftover-dxf-text="leftoverNestPreview?.dxfText ?? ''"
      :leftover-boundaries="leftoverNestPreview?.boundaries ?? []"
      :leftover-block-inserts="leftoverNestPreview?.blockInserts ?? []"
      :leftover-sheet-count="leftoverNestPreview?.sheetCount ?? 1"
      :leftover-sheet-x="leftoverNestPreview?.sheetX ?? null"
      :leftover-sheet-y="leftoverNestPreview?.sheetY ?? null"
      :leftover-sheet-thickness="leftoverNestPreview?.sheetThickness ?? null"
      :leftover-nesting-metrics="leftoverNestPreview?.nestingMetrics ?? null"
      @close="closeNestingModal"
      @nest-unassigned="onNestUnassignedParts"
    />
  </div>
</template>

<style scoped>
.view {
  position: relative;
}

.viewer-busy {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: #64748b;
  font-size: 0.95rem;
  line-height: 1.5;
  background: rgba(248, 250, 252, 0.92);
}

.preview-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 2rem;
  text-align: center;
  color: #64748b;
  font-size: 0.95rem;
  line-height: 1.5;
}
</style>
