import { useEffect, useState, useSyncExternalStore } from "react";
import { useApp as createSimplePartsApp } from "../features/useApp.js";
import { createReactiveScope } from "../reactivity.js";
import { getOrCreateSimplePartsScope } from "../sessionScopeStore";

export function useSimplePartsApp(nodeId?: string) {
  const [scope] = useState(() => (
    nodeId
      ? getOrCreateSimplePartsScope(nodeId)
      : createReactiveScope(createSimplePartsApp)
  ));
  useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
  useEffect(() => {
    // Node-scoped apps survive chat close / session switch (like nestingResultStore).
    if (nodeId) return;
    return () => scope.dispose();
  }, [scope, nodeId]);
  return scope.value as any;
}
