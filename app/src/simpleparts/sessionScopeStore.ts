import { useApp as createSimplePartsApp } from "./features/useApp.js";
import { createReactiveScope } from "./reactivity.js";

type SimplePartsScope = ReturnType<typeof createReactiveScope>;

/**
 * Keep Simple Parts app scopes alive across Studio window unmount
 * (chat close / session switch). Nesting already does this via nestingResultStore;
 * the main window previously disposed on unmount like Plyworks.
 *
 * WAITING DATABASE: chat.session.appState.simpleparts — replace Map with persisted session payload.
 */
const byNodeId = new Map<string, SimplePartsScope>();

export function getOrCreateSimplePartsScope(nodeId: string): SimplePartsScope {
  const existing = byNodeId.get(nodeId);
  if (existing) return existing;
  const scope = createReactiveScope(createSimplePartsApp);
  byNodeId.set(nodeId, scope);
  return scope;
}

export function dropSimplePartsScope(nodeId: string) {
  const scope = byNodeId.get(nodeId);
  if (!scope) return;
  byNodeId.delete(nodeId);
  scope.dispose();
}
