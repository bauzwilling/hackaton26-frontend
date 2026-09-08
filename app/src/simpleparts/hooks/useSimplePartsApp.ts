import { useEffect, useState, useSyncExternalStore } from "react";
import { useApp as createSimplePartsApp } from "../features/useApp.js";
import { createReactiveScope } from "../reactivity.js";

export function useSimplePartsApp() {
  const [scope] = useState(() => createReactiveScope(createSimplePartsApp));
  useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
  useEffect(() => () => scope.dispose(), [scope]);
  return scope.value as any;
}
