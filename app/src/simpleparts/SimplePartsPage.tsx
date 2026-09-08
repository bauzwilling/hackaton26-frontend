import SidebarComponent from "./components/SidebarComponent";
import ThreeMeshViewer, { type ThreeMeshViewerHandle } from "./components/ThreeMeshViewer";
import NestingResultModalComponent from "./components/NestingResultModalComponent";
import ModifiedPartsToggle from "./components/ModifiedPartsToggle";
import { useSimplePartsApp } from "./hooks/useSimplePartsApp";
import "./simpleparts.css";
import "./simpleparts-react.css";

export function SimplePartsPage() {
  const app = useSimplePartsApp();
  const preview = app.summonedPreview.value;
  const leftover = app.leftoverNestPreview.value;
  const activeViewer = app.activeViewer.value;

  return (
    <div className="simpleparts-app">
      <SidebarComponent
        messages={app.messages.value}
        busy={app.busy.value}
        busyMessage={app.busyMessage.value}
        hasBoxes={app.hasBoxes.value}
        canStartNesting={app.showNestingButton.value}
        canStopNesting={app.canStopNesting.value}
        nestRevealPaused={app.nestRevealPaused.value}
        canStartLeftoverNesting={app.showLeftoverNestingButton.value}
        nestingButtonPrompt={app.nestingButtonPrompt.value}
        leftoverNestingButtonPrompt={app.leftoverNestingButtonPrompt.value}
        nestingNeedsRerun={app.nestingNeedsRerun.value}
        activeSheetSizeSelectId={app.activeSheetSizeSelectId.value}
        activeSheetSizeConfirmId={app.activeSheetSizeConfirmId.value}
        activeMaterialSelectId={app.activeMaterialSelectId.value}
        activeMaterialConfirmId={app.activeMaterialConfirmId.value}
        activeConfirmId={app.activeLeftoverMaterialReuseId.value}
        materials={app.materials.value}
        inputRequirementsOpenTick={app.inputRequirementsOpenTick.value}
        onAttachFile={app.onAttachFile}
        onAttachError={app.onAttachError}
        onSendText={app.onSendText}
        onClearAll={app.onClearAll}
        onStartNesting={app.onStartNesting}
        onStopNesting={app.onStopNesting}
        onSheetSizeChoice={app.onSheetSizeChoice}
        onModifySheetSize={app.onModifySheetSize}
        onMaterialChoice={app.onMaterialChoice}
        onModifyMaterial={app.onModifyMaterial}
        onConfirmChoice={app.onConfirmChoice}
        onShowNestingResult={app.openNestingModal}
      />

      <main className="simpleparts-main">
        <div className="simpleparts-view">
          {app.viewerBusy.value && (
            <div className="simpleparts-viewer-busy" aria-busy="true" aria-label="Computing preview" />
          )}
          {activeViewer === "nestingMesh" && (
            <ThreeMeshViewer
              ref={(viewer: ThreeMeshViewerHandle | null) => { app.meshViewerRef.value = viewer; }}
              key={preview?.jobId ?? app.nestingViewerKey.value}
              meshes={preview?.assignedMeshes3d ?? []}
              unassignedMeshes={preview?.unassignedMeshes3d ?? []}
              annotationDxf={preview?.inputTextDxf ?? null}
              partDescriptors={app.nestingMeshPartDescriptors.value}
              metadataOverrides={app.metadataOverrides.value}
              clickForProperties={app.viewerClickForProperties.value}
              showPropertiesPanel={app.viewerClickForProperties.value}
              modifiedHandles={app.modifiedHandles.value}
              showModifiedPartsGreen={app.showModifiedPartsGreen.value}
              onMetadataOverridesChange={(value) => { app.metadataOverrides.value = value; }}
              onMarkModified={app.markModified}
            />
          )}
          {activeViewer === "inputMesh" && (
            <ThreeMeshViewer
              ref={(viewer: ThreeMeshViewerHandle | null) => { app.meshViewerRef.value = viewer; }}
              key={`input-preview-${app.nestingViewerKey.value}`}
              meshes={app.meshPreview.value ?? []}
              annotationDxf={app.annotationOverlayDxf.value}
              partDescriptors={app.meshPartDescriptors.value}
              metadataOverrides={app.metadataOverrides.value}
              clickForProperties={app.viewerClickForProperties.value}
              showPropertiesPanel={app.viewerClickForProperties.value}
              modifiedHandles={app.modifiedHandles.value}
              showModifiedPartsGreen={app.showModifiedPartsGreen.value}
              unassignedPartIds={app.unassignedPartIdsForViewer.value}
              onMetadataOverridesChange={(value) => { app.metadataOverrides.value = value; }}
              onMarkModified={app.markModified}
            />
          )}
          {activeViewer === "notice" && (
            <div className="simpleparts-preview-notice">{app.previewNotice.value}</div>
          )}
        </div>
        {app.showMeshPreview.value && app.hasBoxes.value && (
          <div className="simpleparts-viewer-toggles">
            <ModifiedPartsToggle
              showModifiedPartsGreen={app.showModifiedPartsGreen.value}
              onShowModifiedPartsGreenChange={(value) => { app.showModifiedPartsGreen.value = value; }}
            />
          </div>
        )}
      </main>

      <NestingResultModalComponent
        open={app.showNestingModal.value}
        jobId={preview?.jobId}
        partCount={preview?.partCount ?? 0}
        nestedCount={preview?.nestedCount ?? preview?.partCount ?? 0}
        unassignedCount={preview?.unassignedCount ?? 0}
        unassignedIds={preview?.unassignedIds ?? []}
        unassignedReasons={preview?.unassignedReasons ?? []}
        dxfText={preview?.dxfText ?? ""}
        boundaries={preview?.boundaries ?? []}
        blockInserts={preview?.blockInserts ?? []}
        sheetCount={preview?.sheetCount ?? 1}
        hasUnassignedDxf={preview?.hasUnassignedDxf ?? false}
        sheetX={preview?.sheetX ?? null}
        sheetY={preview?.sheetY ?? null}
        sheetThickness={preview?.sheetThickness ?? null}
        nestingMetrics={preview?.nestingMetrics ?? null}
        defaultMaterial={app.pendingSheetMaterial.value?.label ?? ""}
        leftoverDefaultMaterial={leftover?.materialLabel ?? app.pendingLeftoverSheetMaterial.value?.label ?? ""}
        leftoverJobId={leftover?.jobId ?? null}
        leftoverDxfText={leftover?.dxfText ?? ""}
        leftoverBoundaries={leftover?.boundaries ?? []}
        leftoverBlockInserts={leftover?.blockInserts ?? []}
        leftoverSheetCount={leftover?.sheetCount ?? 1}
        leftoverSheetX={leftover?.sheetX ?? null}
        leftoverSheetY={leftover?.sheetY ?? null}
        leftoverSheetThickness={leftover?.sheetThickness ?? null}
        leftoverNestingMetrics={leftover?.nestingMetrics ?? null}
        onClose={app.closeNestingModal}
        onNestUnassigned={app.onNestUnassignedParts}
      />
    </div>
  );
}
