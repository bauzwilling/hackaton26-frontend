import { useEffect, useRef, useCallback } from "react";
import { ThreeEngine } from "../lib/ThreeEngine";
import type { ConfiguratorStore } from "./useConfiguratorState";

/**
 * Binds a ThreeEngine to a container ref and a ConfiguratorStore.
 *
 * Returns a ref you attach to the container div. The engine is created
 * when the ref mounts and disposed on unmount. State changes trigger
 * engine.rebuild() via the effect.
 */
export function useThreeEngine(
  store: ConfiguratorStore,
  opts?: { onContextMenu?: (info: { x: number; y: number; id: number | null }) => void },
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ThreeEngine | null>(null);

  // Stable callbacks — these close over the latest store via ref
  const storeRef = useRef(store);
  const ctxRef = useRef(opts?.onContextMenu);

  useEffect(() => {
    storeRef.current = store;
    ctxRef.current = opts?.onContextMenu;
  }, [opts?.onContextMenu, store]);

  const onSelect = useCallback((id: number | null, additive?: boolean) => {
    storeRef.current.select(id, additive);
  }, []);

  const onMoveBoard = useCallback((id: number, axis: "x" | "y" | "z", value: number) => {
    storeRef.current.moveBoard(id, axis, value);
  }, []);

  const onResizeBoard = useCallback((id: number, field: "w" | "h" | "d", value: number) => {
    storeRef.current.resizeBoard(id, field, value);
  }, []);

  const onLog = useCallback((msg: string) => {
    storeRef.current.dispatch({ type: "LOG", msg });
  }, []);

  const onContextMenu = useCallback((info: { x: number; y: number; id: number | null }) => {
    ctxRef.current?.(info);
  }, []);

  // Create engine on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const engine = new ThreeEngine(el, { onSelect, onMoveBoard, onResizeBoard, onLog, onContextMenu });
    engineRef.current = engine;

    const onResize = () => engine.resize();
    const lookObserver = new MutationObserver(() => engine.syncBackground());
    lookObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      lookObserver.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [onContextMenu, onLog, onMoveBoard, onResizeBoard, onSelect]);

  // Rebuild scene on state change
  useEffect(() => {
    engineRef.current?.rebuild(
      store.boards,
      store.selIds,
      store.mode,
      store.dims
    );
  }, [store.boards, store.selIds, store.mode, store.dims]);

  // Reset view helper
  const resetView = useCallback(() => {
    engineRef.current?.resetView(store.bbox);
  }, [store.bbox]);

  return { containerRef, resetView };
}
