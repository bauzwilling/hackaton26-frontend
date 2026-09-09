import { useEffect, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { ZOOM_WHEEL_MULTIPLIER } from "./constants";

/** xyflow / d3-zoom defaults (see @xyflow/system wheelDelta). */
const DEFAULT_PIXEL = 0.002;
const DEFAULT_LINE = 0.05;

function wheelDelta(event: WheelEvent) {
  const base = event.deltaMode === 1
    ? DEFAULT_LINE
    : event.deltaMode
      ? 1
      : DEFAULT_PIXEL;
  // Trackpad pinch sets ctrlKey; keep a bit more bite than plain wheel.
  const pinchBoost = event.ctrlKey ? 1.5 : 1;
  return -event.deltaY * base * ZOOM_WHEEL_MULTIPLIER * pinchBoost;
}

/**
 * Finer wheel zoom than React Flow's built-in steps.
 * Tune {@link ZOOM_WHEEL_MULTIPLIER}: 1 ≈ default RF step size, lower = more steps.
 */
export function useFineWheelZoom(
  paneRef: RefObject<HTMLElement | null>,
  opts: { minZoom: number; maxZoom: number },
) {
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const root = paneRef.current;
    if (!root) return;
    const pane = (root.querySelector(".react-flow") as HTMLElement | null) ?? root;

    const onWheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".nowheel, .nopan, input, textarea, select, [contenteditable=true]")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const { x, y, zoom } = getViewport();
      if (zoom <= 0) return;

      const box = pane.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const nextZoom = Math.min(
        opts.maxZoom,
        Math.max(opts.minZoom, zoom * Math.pow(2, wheelDelta(event))),
      );
      if (nextZoom === zoom) return;

      void setViewport({
        x: px - ((px - x) * nextZoom) / zoom,
        y: py - ((py - y) * nextZoom) / zoom,
        zoom: nextZoom,
      }, { duration: 0 });
    };

    pane.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => pane.removeEventListener("wheel", onWheel, true);
  }, [paneRef, opts.minZoom, opts.maxZoom, getViewport, setViewport]);
}
