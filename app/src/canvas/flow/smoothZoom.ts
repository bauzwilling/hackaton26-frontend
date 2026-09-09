import { useEffect, useRef, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";

/** Softer than xyflow's default 0.002 / 0.05 so wheel ticks feel less jumpy. */
const PIXEL_SENSITIVITY = 0.0012;
const LINE_SENSITIVITY = 0.035;
const LERP = 0.2;
const EPS = 0.00035;

function wheelFactor(event: WheelEvent) {
  if (event.deltaMode === 1) return LINE_SENSITIVITY;
  if (event.deltaMode) return 1;
  return PIXEL_SENSITIVITY;
}

/**
 * Replaces React Flow's discrete wheel zoom with a short lerp toward the
 * target scale, always pivoting under the cursor.
 */
export function useSmoothWheelZoom(
  paneRef: RefObject<HTMLElement | null>,
  opts: { minZoom: number; maxZoom: number },
) {
  const { getViewport, setViewport } = useReactFlow();
  const targetZoom = useRef<number | null>(null);
  const pivot = useRef({ x: 0, y: 0 });
  const raf = useRef(0);

  useEffect(() => {
    const root = paneRef.current;
    if (!root) return;
    const pane = (root.querySelector(".react-flow") as HTMLElement | null) ?? root;

    const stop = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };

    const tick = () => {
      raf.current = 0;
      const target = targetZoom.current;
      if (target == null) return;

      const { x, y, zoom } = getViewport();
      if (zoom <= 0) return;

      const blended = zoom + (target - zoom) * LERP;
      const done = Math.abs(target - blended) < EPS;
      const nextZoom = done ? target : blended;
      const { x: px, y: py } = pivot.current;
      void setViewport({
        x: px - ((px - x) * nextZoom) / zoom,
        y: py - ((py - y) * nextZoom) / zoom,
        zoom: nextZoom,
      }, { duration: 0 });

      if (done) {
        targetZoom.current = null;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".nowheel, .nopan, input, textarea, select, [contenteditable=true]")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const box = pane.getBoundingClientRect();
      pivot.current = {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      };

      const current = targetZoom.current ?? getViewport().zoom;
      const pinchBoost = event.ctrlKey ? 1.5 : 1;
      const delta = -event.deltaY * wheelFactor(event) * pinchBoost;
      targetZoom.current = Math.min(
        opts.maxZoom,
        Math.max(opts.minZoom, current * Math.pow(2, delta)),
      );
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    };

    pane.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      pane.removeEventListener("wheel", onWheel, true);
      stop();
    };
  }, [paneRef, opts.minZoom, opts.maxZoom, getViewport, setViewport]);
}
