import { useEffect, useRef, useCallback } from "react";
import { HOST_LOOK } from "../lib/look";
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
  storeRef.current = store;
  const ctxRef = useRef(opts?.onContextMenu);
  ctxRef.current = opts?.onContextMenu;

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
    const onLook = () => engine.syncBackground();
    window.addEventListener("resize", onResize);
    window.addEventListener(HOST_LOOK, onLook);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener(HOST_LOOK, onLook);
      engine.dispose();
      engineRef.current = null;
    };
  }, []); // mount-only

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
