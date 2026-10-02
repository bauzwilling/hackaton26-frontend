import { useEffect, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { TOUCH_PINCH_GAIN, ZOOM_PINCH_MULTIPLIER, ZOOM_WHEEL_MULTIPLIER } from "./constants";

/** xyflow / d3-zoom defaults (see @xyflow/system wheelDelta). */
const DEFAULT_PIXEL = 0.002;
const DEFAULT_LINE = 0.05;

/** Pixel |deltaY| at or above this (with no ctrl) is treated as a mouse-wheel notch. */
const MOUSE_WHEEL_PIXEL_FLOOR = 40;

function wheelDelta(event: WheelEvent) {
  const base = event.deltaMode === 1
    ? DEFAULT_LINE
    : event.deltaMode
      ? 1
      : DEFAULT_PIXEL;
  const pinch = event.ctrlKey || event.metaKey;
  const multiplier = pinch ? ZOOM_PINCH_MULTIPLIER : ZOOM_WHEEL_MULTIPLIER;
  return -event.deltaY * base * multiplier;
}

/** Pinch / ctrl+wheel, or discrete mouse wheel — not smooth trackpad slide. */
function shouldZoom(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) return true;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE || event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  // DOM_DELTA_PIXEL: large notch-like steps → mouse wheel; small continuous → trackpad pan.
  return Math.abs(event.deltaY) >= MOUSE_WHEEL_PIXEL_FLOOR && Math.abs(event.deltaX) < MOUSE_WHEEL_PIXEL_FLOOR;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Mouse wheel → zoom; smooth trackpad slide → pan; trackpad/touch pinch → snappier zoom.
 * Owns touch pinch (set React Flow `zoomOnPinch={false}`) so sensitivity stays tunable.
 */
export function useFineWheelZoom(
  paneRef: RefObject<HTMLElement | null>,
  opts: { minZoom: number; maxZoom: number; enabled?: boolean },
) {
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const root = paneRef.current;
    if (!root || opts.enabled === false) return;
    const pane = (root.querySelector(".react-flow") as HTMLElement | null) ?? root;

    const onWheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      const far = root.classList.contains("is-far");
      // Far zoom: treat windows as absent — ignore nowheel/nopan on chrome so scroll/zoom hit the canvas.
      if (far) {
        if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      } else if (target?.closest(".nowheel, .nopan, input, textarea, select, [contenteditable=true]")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const { x, y, zoom } = getViewport();
      if (zoom <= 0) return;

      if (!shouldZoom(event)) {
        void setViewport({
          x: x - event.deltaX,
          y: y - event.deltaY,
          zoom,
        }, { duration: 0 });
        return;
      }

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

    const tips = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const target = event.target as Element | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      tips.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (tips.size === 2) {
        const [a, b] = [...tips.values()];
        lastPinchDist = dist(a, b);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !tips.has(event.pointerId)) return;
      tips.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (tips.size !== 2 || lastPinchDist <= 0) return;

      const [a, b] = [...tips.values()];
      const nextDist = dist(a, b);
      if (nextDist <= 0) return;

      const rawScale = nextDist / lastPinchDist;
      lastPinchDist = nextDist;
      // Amplify small pinch deltas so touch zoom feels as snappy as trackpad pinch.
      const scale = Math.pow(rawScale, TOUCH_PINCH_GAIN);

      const { x, y, zoom } = getViewport();
      if (zoom <= 0) return;
      const nextZoom = Math.min(opts.maxZoom, Math.max(opts.minZoom, zoom * scale));
      if (nextZoom === zoom) return;

      const box = pane.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - box.left;
      const midY = (a.y + b.y) / 2 - box.top;
      event.preventDefault();
      void setViewport({
        x: midX - ((midX - x) * nextZoom) / zoom,
        y: midY - ((midY - y) * nextZoom) / zoom,
        zoom: nextZoom,
      }, { duration: 0 });
    };

    const onPointerUp = (event: PointerEvent) => {
      tips.delete(event.pointerId);
      if (tips.size < 2) lastPinchDist = 0;
    };

    pane.addEventListener("wheel", onWheel, { passive: false, capture: true });
    pane.addEventListener("pointerdown", onPointerDown, { capture: true });
    pane.addEventListener("pointermove", onPointerMove, { passive: false, capture: true });
    pane.addEventListener("pointerup", onPointerUp, { capture: true });
    pane.addEventListener("pointercancel", onPointerUp, { capture: true });
    return () => {
      pane.removeEventListener("wheel", onWheel, true);
      pane.removeEventListener("pointerdown", onPointerDown, true);
      pane.removeEventListener("pointermove", onPointerMove, true);
      pane.removeEventListener("pointerup", onPointerUp, true);
      pane.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, [paneRef, opts.enabled, opts.minZoom, opts.maxZoom, getViewport, setViewport]);
}
