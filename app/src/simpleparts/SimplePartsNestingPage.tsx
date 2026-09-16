import { useSyncExternalStore } from "react";
import NestingResultModalComponent from "./components/NestingResultModalComponent";
import {
  getSimplePartsNesting,
  subscribeSimplePartsNesting,
} from "./nestingResultStore";
import "./simpleparts.css";
import "./simpleparts-react.css";

/**
 * Studio window for a Simple Parts nesting result.
 *
 * WAITING BFF: `jobId` is a temporary stand-in for the platform run/artifact id
 * (msd-simple-parts-ui: Mill shows WorkflowRun + milling-package artifact). Sheet
 * DXFs must eventually come from GET /api/artifacts/{artifactId}/download via the
 * Platform BFF — never from Simple Parts Flask. Until then the page only mounts
 * the in-session snapshot and the modal's marked stand-in fetches.
 */
export function SimplePartsNestingPage({ jobId }: { jobId?: string }) {
  const snapshot = useSyncExternalStore(
    subscribeSimplePartsNesting,
    () => getSimplePartsNesting(jobId),
    () => getSimplePartsNesting(jobId),
  );

  if (!jobId) {
    return <div className="simpleparts-preview-notice">No nesting result selected.</div>;
  }
  if (!snapshot) {
    return (
      <div className="simpleparts-preview-notice">
        Nesting result for this run is not available in this session. Run Nest again from Simple Parts.
      </div>
    );
  }

  return (
    <NestingResultModalComponent
      open
      variant="page"
      jobId={snapshot.jobId}
      partCount={snapshot.partCount}
      nestedCount={snapshot.nestedCount}
      unassignedCount={snapshot.unassignedCount}
      unassignedIds={snapshot.unassignedIds}
      unassignedReasons={snapshot.unassignedReasons}
      hasUnassignedDxf={snapshot.hasUnassignedDxf}
      dxfText={snapshot.dxfText}
      boundaries={snapshot.boundaries}
      blockInserts={snapshot.blockInserts}
      sheetCount={snapshot.sheetCount}
      sheetX={snapshot.sheetX}
      sheetY={snapshot.sheetY}
      sheetThickness={snapshot.sheetThickness}
      defaultMaterial={snapshot.defaultMaterial}
      leftoverDefaultMaterial={snapshot.leftoverDefaultMaterial}
      leftoverJobId={snapshot.leftoverJobId}
      leftoverDxfText={snapshot.leftoverDxfText}
      leftoverBoundaries={snapshot.leftoverBoundaries}
      leftoverBlockInserts={snapshot.leftoverBlockInserts}
      leftoverSheetCount={snapshot.leftoverSheetCount}
      leftoverSheetX={snapshot.leftoverSheetX}
      leftoverSheetY={snapshot.leftoverSheetY}
      leftoverSheetThickness={snapshot.leftoverSheetThickness}
      nestingMetrics={snapshot.nestingMetrics}
      leftoverNestingMetrics={snapshot.leftoverNestingMetrics}
      onNestUnassigned={snapshot.onNestUnassigned}
    />
  );
}
