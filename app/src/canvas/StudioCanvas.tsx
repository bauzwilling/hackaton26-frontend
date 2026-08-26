import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as PE } from "react";
import { Window } from "../components/kit";
import { useSession } from "../context/session";
import { useWorkspace, type WorkspaceNode } from "../context/workspace";
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

export function StudioCanvas() {
  const {
    nodes, edges, pan, zoom, setPan, setZoom,
    focus, move, resize, fit, close, hide,
  } = useWorkspace();
  const { showWires, showGrid } = useSession();
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const size = useRef<{ id: string; ox: number; oy: number; w: number; h: number } | null>(null);
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [panning, setPanning] = useState(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });

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
    if (!el) return;
    if (drag.current && e.buttons) {
      const pt = clientToCanvas(el, e.clientX, e.clientY, pan, zoom);
      move(drag.current.id, pt.x - drag.current.dx, pt.y - drag.current.dy);
    }
    if (size.current && e.buttons) {
      const pt = clientToCanvas(el, e.clientX, e.clientY, pan, zoom);
      const s = size.current;
      resize(s.id, s.w + (pt.x - s.ox), s.h + (pt.y - s.oy));
    }
  }

  function endGesture() {
    drag.current = null;
    size.current = null;
    panDrag.current = null;
    setPanning(false);
  }

  function startDrag(node: WorkspaceNode, e: PE<HTMLDivElement>) {
    const el = layer.current;
    if (!el || e.button !== 0) return;
    const pt = clientToCanvas(el, e.clientX, e.clientY, pan, zoom);
    drag.current = { id: node.id, dx: pt.x - node.x, dy: pt.y - node.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function startResize(node: WorkspaceNode, e: PE<HTMLDivElement>) {
    const el = layer.current;
    if (!el) return;
    e.stopPropagation();
    const pt = clientToCanvas(el, e.clientX, e.clientY, pan, zoom);
    size.current = { id: node.id, ox: pt.x, oy: pt.y, w: node.w, h: node.h };
    e.currentTarget.setPointerCapture(e.pointerId);
    focus(node.id);
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
        {showWires && <WireLayer nodes={nodes} edges={edges} />}
        {nodes.map((n) => (
          <Window
            key={n.id}
            title={n.title}
            code={n.code}
            z={n.z}
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            kind={n.kind}
            hidden={n.hidden}
            autoSize={n.autoSize !== false}
            onFocus={() => focus(n.id)}
            onClose={() => close(n.id)}
            onHide={() => hide(n.id)}
            onDrag={(e) => startDrag(n, e)}
            onResize={(e) => startResize(n, e)}
            onFit={(w, h) => fit(n.id, w, h)}
          >
            <NodeBody node={n} viewport={viewport} />
          </Window>
        ))}
      </div>
    </div>
  );
}
