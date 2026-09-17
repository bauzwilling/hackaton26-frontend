import type { BlockInsert, PartBoundary, UnknownRecord } from "../types";

/** Snapshot for the Simple Parts nesting Studio window.
 * WAITING BFF: keyed by legacy jobId until the BFF exposes run/artifact ids for the milling-package.
 * WAITING DATABASE: in-memory Map stands in for persisted nesting result / artifact metadata. */
export type SimplePartsNestingSnapshot = {
  jobId: string;
  partCount: number;
  nestedCount: number;
  unassignedCount: number;
  unassignedIds: unknown[];
  unassignedReasons: string[];
  hasUnassignedDxf: boolean;
  dxfText: string;
  boundaries: PartBoundary[];
  blockInserts: BlockInsert[];
  sheetCount: number;
  sheetX: number | null;
  sheetY: number | null;
  sheetThickness: number | null;
  defaultMaterial: string;
  leftoverDefaultMaterial: string;
  leftoverJobId: string | null;
  leftoverDxfText: string;
  leftoverBoundaries: PartBoundary[];
  leftoverBlockInserts: BlockInsert[];
  leftoverSheetCount: number;
  leftoverSheetX: number | null;
  leftoverSheetY: number | null;
  leftoverSheetThickness: number | null;
  nestingMetrics: UnknownRecord | null;
  leftoverNestingMetrics: UnknownRecord | null;
  onNestUnassigned?: () => void;
};

const byJobId = new Map<string, SimplePartsNestingSnapshot>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function publishSimplePartsNesting(snapshot: SimplePartsNestingSnapshot) {
  byJobId.set(snapshot.jobId, snapshot);
  emit();
}

export function getSimplePartsNesting(jobId: string | null | undefined) {
  if (!jobId) return null;
  return byJobId.get(jobId) ?? null;
}

export function subscribeSimplePartsNesting(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
