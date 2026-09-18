import type { ChatMessage, InputLists, SolveState } from "./types";
import { createSolveState } from "./lib/solveState.js";

type Normalized = {
  inputLists: InputLists;
  variationNames: string[];
  quantities: number[];
  variationCount: number;
  emptyCellKeys?: Set<string>;
};

type PendingImport = {
  fileName: string;
  normalized: Normalized;
  parseSource: string;
};

/** Serializable-enough live Boxouts UI state for one Studio window.
 * WAITING DATABASE: chat.session.appState.boxouts — replace Map with persisted session payload. */
export type BoxoutsSessionSnapshot = {
  inputLists: InputLists | null;
  sourceLists: InputLists | null;
  emptyCellKeys: string[];
  names: string[];
  quantities: number[];
  selectedIndex: number;
  solveRequestId: number;
  messages: ChatMessage[];
  busy: boolean;
  pendingImport: PendingImport | null;
  solve: SolveState;
  nestingPreviewOpen: boolean;
  sendResultsPhase: "confirm" | "sent" | null;
};

const byNodeId = new Map<string, BoxoutsSessionSnapshot>();

function cloneLists(lists: InputLists | null): InputLists | null {
  if (!lists) return null;
  return {
    BoxDepth: [...lists.BoxDepth],
    BoxHeight: [...lists.BoxHeight],
    BoxWidth: [...lists.BoxWidth],
  };
}

function cloneSolve(solve: SolveState): SolveState {
  return {
    ...createSolveState(),
    ...solve,
    rowErrors: new Map(solve.rowErrors),
    warnings: [...(solve.warnings ?? [])],
    variationStatuses: [...(solve.variationStatuses ?? [])],
    sentParamNames: [...(solve.sentParamNames ?? [])],
    computeProgress: { ...solve.computeProgress },
    perBoxNesting: { ...solve.perBoxNesting },
    fullSetNesting: { ...solve.fullSetNesting },
  };
}

function clonePending(pending: PendingImport | null): PendingImport | null {
  if (!pending) return null;
  return {
    fileName: pending.fileName,
    parseSource: pending.parseSource,
    normalized: {
      ...pending.normalized,
      inputLists: cloneLists(pending.normalized.inputLists)!,
      variationNames: [...pending.normalized.variationNames],
      quantities: [...pending.normalized.quantities],
      emptyCellKeys: pending.normalized.emptyCellKeys
        ? new Set(pending.normalized.emptyCellKeys)
        : undefined,
    },
  };
}

export function emptyBoxoutsSession(): BoxoutsSessionSnapshot {
  return {
    inputLists: null,
    sourceLists: null,
    emptyCellKeys: [],
    names: [],
    quantities: [],
    selectedIndex: 0,
    solveRequestId: 0,
    messages: [],
    busy: false,
    pendingImport: null,
    solve: createSolveState(),
    nestingPreviewOpen: false,
    sendResultsPhase: null,
  };
}

export function getBoxoutsSession(nodeId: string | null | undefined): BoxoutsSessionSnapshot | null {
  if (!nodeId) return null;
  const snap = byNodeId.get(nodeId);
  if (!snap) return null;
  return {
    ...snap,
    inputLists: cloneLists(snap.inputLists),
    sourceLists: cloneLists(snap.sourceLists),
    emptyCellKeys: [...snap.emptyCellKeys],
    names: [...snap.names],
    quantities: [...snap.quantities],
    messages: snap.messages.map((m) => ({ ...m, meta: m.meta ? { ...m.meta, choices: m.meta.choices ? [...m.meta.choices] : undefined } : undefined })),
    pendingImport: clonePending(snap.pendingImport),
    solve: cloneSolve(snap.solve),
  };
}

export function publishBoxoutsSession(nodeId: string, snapshot: BoxoutsSessionSnapshot) {
  byNodeId.set(nodeId, {
    ...snapshot,
    inputLists: cloneLists(snapshot.inputLists),
    sourceLists: cloneLists(snapshot.sourceLists),
    emptyCellKeys: [...snapshot.emptyCellKeys],
    names: [...snapshot.names],
    quantities: [...snapshot.quantities],
    messages: snapshot.messages.map((m) => ({ ...m, meta: m.meta ? { ...m.meta, choices: m.meta.choices ? [...m.meta.choices] : undefined } : undefined })),
    pendingImport: clonePending(snapshot.pendingImport),
    solve: cloneSolve(snapshot.solve),
  });
}

export function dropBoxoutsSession(nodeId: string) {
  byNodeId.delete(nodeId);
}
