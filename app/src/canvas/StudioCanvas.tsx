import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as PE } from "react";
import { Window } from "../components/kit";
import { useSession } from "../context/session";
import { useWorkspace, type WorkspaceNode } from "../context/workspace";
import { type BubbleBody } from "./bubbles";
import { NodeBody } from "./NodeBody";
import { WireLayer } from "./WireLayer";

function clientToCanvas(
  layer: HTMLDivElement,
  clientX: number,
  clientY: number,
  pan: { x: number; y: number },
  zoom: number,
) {
  const box = layer.getBoundingClientRect();
  return {
    x: (clientX - box.left - pan.x) / zoom,
    y: (clientY - box.top - pan.y) / zoom,
  };
}

type DragState = {
  id: string;
  dx: number;
  dy: number;
  bubble: boolean;
};

export function StudioCanvas() {
  const {
    nodes, edges, pan, zoom, setPan, setZoom,
    focus, move, fit, close, hide,
  } = useWorkspace();
  const { showWires, showGrid, bubbleMode } = useSession();
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const moveRef = useRef(move);
  const bodiesRef = useRef(new Map<string, BubbleBody>());
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { moveRef.current = move; }, [move]);
  const [panning, setPanning] = useState(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });
  const [, setBubbleTick] = useState(0);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      setViewport({ width: box.width, height: box.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = zoomRef.current;
      const p = panRef.current;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(2, Math.max(0.4, z * factor));
      const box = el.getBoundingClientRect();
      const cx = e.clientX - box.left;
      const cy = e.clientY - box.top;
      const wx = (cx - p.x) / z;
      const wy = (cy - p.y) / z;
      setZoom(next);
      setPan({ x: cx - wx * next, y: cy - wy * next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [setPan, setZoom]);

  useEffect(() => {
    if (!bubbleMode) {
      bodiesRef.current.clear();
      return;
    }
    if (drag.current?.bubble) return;
    const bodies = bodiesRef.current;
    const live = new Set<string>();
    for (const n of nodes) {
      if (n.hidden) continue;
      live.add(n.id);
      const b = bodies.get(n.id);
      if (!b) {
        bodies.set(n.id, { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h });
      } else {
        b.w = n.w;
        b.h = n.h;
        b.x = n.x;
        b.y = n.y;
      }
    }
    for (const id of [...bodies.keys()]) {
      if (!live.has(id)) bodies.delete(id);
    }
  }, [bubbleMode, nodes]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.code === "Space" && e.target === e.currentTarget) e.preventDefault();
  }

  function beginPan(e: PE<HTMLDivElement>) {
    panDrag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
  }

  function onPointerDown(e: PE<HTMLDivElement>) {
    if (e.button === 1) {
      e.preventDefault();
      beginPan(e);
      return;
    }
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".win, .overview, .ctx-ask, .ctx-backdrop, .request-log")) return;
    beginPan(e);
  }

  function onMove(e: PE<HTMLDivElement>) {
    const el = layer.current;
    if (panDrag.current && e.buttons) {
      const d = panDrag.current;
      setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
      return;
    }
    if (!el || !drag.current || !e.buttons) return;
    const pt = clientToCanvas(el, e.clientX, e.clientY, panRef.current, zoomRef.current);
    const d = drag.current;
    const x = pt.x - d.dx;
    const y = pt.y - d.dy;
    if (d.bubble) {
      const body = bodiesRef.current.get(d.id);
      if (body) {
        body.x = x;
        body.y = y;
        setBubbleTick((n) => n + 1);
      }
    } else {
      move(d.id, x, y);
    }
  }

  function endGesture() {
    const d = drag.current;
    if (d?.bubble) {
      const body = bodiesRef.current.get(d.id);
      if (body) moveRef.current(body.id, body.x, body.y);
    }
    drag.current = null;
    panDrag.current = null;
    setPanning(false);
  }

  function startDrag(node: WorkspaceNode, e: PE<HTMLDivElement>) {
    const el = layer.current;
    if (!el || e.button !== 0) return;
    const pt = clientToCanvas(el, e.clientX, e.clientY, panRef.current, zoomRef.current);
    const body = bubbleMode ? bodiesRef.current.get(node.id) : undefined;
    const x = body?.x ?? node.x;
    const y = body?.y ?? node.y;
    drag.current = {
      id: node.id,
      dx: pt.x - x,
      dy: pt.y - y,
      bubble: !!bubbleMode,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  const grid = 34 * zoom;

  return (
    <div
      className={`studio-layer${panning ? " is-panning" : ""}`}
      ref={layer}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onMove}
      onPointerUp={endGesture}
      onLostPointerCapture={endGesture}
    >
      {showGrid && (
        <div
          className="studio-grid"
          style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
        />
      )}
      <div className="studio-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {showWires && (
          <WireLayer
            nodes={nodes.map((n) => {
              const b = bodiesRef.current.get(n.id);
              return b ? { ...n, x: b.x, y: b.y } : n;
            })}
            edges={edges}
          />
        )}
        {nodes.map((n) => {
          const b = bodiesRef.current.get(n.id);
          return (
            <Window
              key={n.id}
              title={n.title}
              code={n.code}
              z={n.z}
              x={b?.x ?? n.x}
              y={b?.y ?? n.y}
              width={n.w}
              height={n.h}
              kind={n.kind}
              hidden={n.hidden}
              autoSize
              onFocus={() => focus(n.id)}
              onClose={() => close(n.id)}
              onHide={() => hide(n.id)}
              onDrag={(e) => { if (!bubbleMode) startDrag(n, e); }}
              onGrab={bubbleMode ? (e) => startDrag(n, e) : undefined}
              onFit={(w, h) => fit(n.id, w, h)}
            >
              <NodeBody node={n} viewport={viewport} />
            </Window>
          );
        })}
      </div>
    </div>
  );
}
