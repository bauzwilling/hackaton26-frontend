import { useCallback, useLayoutEffect, useRef } from "react";
import ThreeMeshViewer, { type ThreeMeshViewerHandle } from "./components/ThreeMeshViewer";
import NestingResultModalComponent from "./components/NestingResultModalComponent";
import ModifiedPartsToggle from "./components/ModifiedPartsToggle";
import { useSimplePartsApp } from "./hooks/useSimplePartsApp";
import { useWorkspace } from "../context/workspace";
import type { AppChatAction } from "../lib/appChat";
import "./simpleparts.css";
import "./simpleparts-react.css";

export function SimplePartsPage({ nodeId }: { nodeId?: string }) {
  const { registerAppIntake, registerAppChatActions, relayAppChatReply, focusTargets, openApp, placeOrder } = useWorkspace();
  const app = useSimplePartsApp();
  const appRef = useRef(app);
  appRef.current = app;
  const preview = app.summonedPreview.value;
  const leftover = app.leftoverNestPreview.value;
  const activeViewer = app.activeViewer.value;
  const setMeshViewer = useCallback((viewer: ThreeMeshViewerHandle | null) => {
    app.meshViewerRef.value = viewer;
  }, [app]);

  useLayoutEffect(() => {
    if (!nodeId) {
      console.warn("simpleparts: mounted without nodeId — Concierge cannot forward");
      return;
    }
    appRef.current.studioNodeId.value = nodeId;
    // Prefer React-context relay so Vite chunk splits cannot drop module sinks.
    appRef.current.relayToConcierge.value = (content: string, prompt?: Parameters<typeof relayAppChatReply>[2]) => {
      relayAppChatReply(nodeId, content, prompt);
    };
    appRef.current.openNestingWindow.value = (jobId: string) => {
      const opened = openApp("simpleparts-nesting", { parentId: nodeId, query: jobId });
      if (opened) focusTargets([opened.id]);
    };
    // WAITING BFF: SuggestedAction accept will own this handoff
    const unregisterIntake = registerAppIntake("simpleparts", nodeId, async (intake, file) => {
      if (intake.kind === "text") {
        console.log(`simpleparts text: ${intake.text}`);
        await appRef.current.onSendText(intake.text);
        return;
      }
      if (!file) {
        console.warn(`simpleparts: missing file for ${intake.name}`);
        return;
      }
      console.log(`simpleparts ingest: ${file.name}`);
      await appRef.current.onAttachFile(file);
    });
    // WAITING BFF: SuggestedAction accept replaces questionnaire callbacks
    const unregisterActions = registerAppChatActions("simpleparts", nodeId, (action: AppChatAction) => {
      const live = appRef.current;
      if (action.type === "material") {
        live.activeMaterialSelectId.value = action.messageId;
        live.onMaterialChoice(action.material);
        return;
      }
      if (action.type === "sheet-size") {
        live.activeSheetSizeSelectId.value = action.messageId;
        live.onSheetSizeChoice({
          sheetX: action.sheetX,
          sheetY: action.sheetY,
          sheetThickness: action.sheetThickness,
        });
        return;
      }
      if (action.type === "confirm") {
        live.onConfirmChoice({ choice: action.choice, messageId: action.messageId });
        return;
      }
      if (action.type === "nest") {
        relayAppChatReply(nodeId, "Nesting… Simple Parts is placing parts on the sheet.");
        live.onStartNesting();
        return;
      }
      if (action.type === "show-nesting-result") {
        live.openNestingModal();
      }
    });
    return () => {
      unregisterIntake();
      unregisterActions();
      if (appRef.current.studioNodeId.value === nodeId) {
        appRef.current.studioNodeId.value = null;
      }
      appRef.current.relayToConcierge.value = null;
      appRef.current.openNestingWindow.value = null;
    };
  }, [nodeId, registerAppIntake, registerAppChatActions, relayAppChatReply, openApp, focusTargets]);

  return (
    <div className="simpleparts-app">
      <main className="simpleparts-main">
        <div className="simpleparts-view">
          {app.viewerBusy.value && (
            <div className="simpleparts-viewer-busy" aria-busy="true" aria-label="Computing preview" />
          )}
          {activeViewer === "nestingMesh" && (
            <ThreeMeshViewer
              ref={setMeshViewer}
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
              ref={setMeshViewer}
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
        onPlaceOrder={(data) => Boolean(placeOrder("simpleparts", {
          kind: "simpleparts-nesting",
          nodeId: nodeId ?? "simpleparts",
          data,
        }))}
      />
    </div>
  );
}
