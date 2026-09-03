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
export function useThreeEngine(store: ConfiguratorStore) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ThreeEngine | null>(null);

  // Stable callbacks — these close over the latest store via ref
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  const onSelect = useCallback((id: number | null) => {
    storeRef.current.select(id);
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

  // Create engine on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const engine = new ThreeEngine(el, { onSelect, onMoveBoard, onResizeBoard, onLog });
    engineRef.current = engine;

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [onSelect, onMoveBoard, onResizeBoard, onLog]);

  // Rebuild scene on state change
  useEffect(() => {
    engineRef.current?.rebuild(
      store.boards,
      store.selId,
      store.mode,
      store.mat,
      store.dims
    );
  }, [store.boards, store.selId, store.mode, store.mat, store.dims]);

  // Reset view helper
  const resetView = useCallback(() => {
    engineRef.current?.resetView(store.bbox);
  }, [store.bbox]);

  return { containerRef, resetView };
}
