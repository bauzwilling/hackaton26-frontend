import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ME, type PointerEvent as PE } from "react";
import { Window } from "../components/kit";
import { useSession } from "../context/session";
import { CONCIERGE_ID, useWorkspace, type WorkspaceNode } from "../context/workspace";
import {
  capSpeed,
  spawnVelocity,
  stepBubbles,
  type BubbleBody,
} from "./bubbles";
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
  lastX: number;
  lastY: number;
  lastT: number;
  bubble: boolean;
};

const FLUSH_MS = 2000;

export function StudioCanvas() {
  const {
    nodes, edges, pan, zoom, setPan, setZoom,
    focus, move, fit, close, hide, flashIds, flashKey,
  } = useWorkspace();
  const { showWires, showGrid, bubbleMode } = useSession();
  const [conciergeEnter, setConciergeEnter] = useState(false);
  const hadConcierge = useRef<boolean | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const panMoved = useRef(false);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const nodesRef = useRef(nodes);
  const moveRef = useRef(move);
  const bodiesRef = useRef(new Map<string, BubbleBody>());
  const flushedRef = useRef(new Map<string, { x: number; y: number }>());
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { moveRef.current = move; }, [move]);

  const [panning, setPanning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });
  const [, setBubbleTick] = useState(0);

  // Play the enter animation only when the concierge appears mid-session, not on reload.
  useEffect(() => {
    const has = nodes.some((n) => n.id === CONCIERGE_ID);
    const prev = hadConcierge.current;
    hadConcierge.current = has;
    if (prev === null || prev === has) return;
    setConciergeEnter(has);
  }, [nodes]);

  useEffect(() => {
    if (activeId && !nodes.some((n) => n.id === activeId && !n.hidden)) setActiveId(null);
  }, [nodes, activeId]);

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
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if (t.closest(".win.win-viewport.is-selected")) return;
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
    if (!bubbleMode) return;

    function syncBodies() {
      const list = nodesRef.current;
      const bodies = bodiesRef.current;
      const flushed = flushedRef.current;
      const live = new Set<string>();
      for (const n of list) {
        if (n.hidden) continue;
        live.add(n.id);
        let b = bodies.get(n.id);
        if (!b) {
          const v = spawnVelocity();
          b = { id: n.id, x: n.x, y: n.y, vx: v.vx, vy: v.vy, w: n.w, h: n.h, phase: Math.random() * Math.PI * 2, tilt: 0 };
          bodies.set(n.id, b);
          flushed.set(n.id, { x: n.x, y: n.y });
        } else {
          b.w = n.w;
          b.h = n.h;
          if (b.tilt == null) b.tilt = 0;
          const f = flushed.get(n.id);
          if (f && (Math.abs(n.x - f.x) > 0.5 || Math.abs(n.y - f.y) > 0.5)) {
            b.x = n.x;
            b.y = n.y;
            flushed.set(n.id, { x: n.x, y: n.y });
          }
        }
      }
      for (const id of [...bodies.keys()]) {
        if (!live.has(id)) {
          bodies.delete(id);
          flushed.delete(id);
        }
      }
    }

    function flushBodies() {
      const write = moveRef.current;
      const positions = new Map<string, { x: number; y: number }>();
      for (const b of bodiesRef.current.values()) {
        write(b.id, b.x, b.y);
        flushedRef.current.set(b.id, { x: b.x, y: b.y });
        positions.set(b.id, { x: b.x, y: b.y });
      }
      nodesRef.current = nodesRef.current.map((n) => {
        const p = positions.get(n.id);
        return p ? { ...n, x: p.x, y: p.y } : n;
      });
    }

    syncBodies();
    let raf = 0;
    let last = performance.now();
    let lastFlush = last;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      syncBodies();
      stepBubbles(
        [...bodiesRef.current.values()],
        dt,
        drag.current?.bubble ? drag.current.id : null,
      );
      if (now - lastFlush > FLUSH_MS) {
        lastFlush = now;
        flushBodies();
      }
      setBubbleTick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      flushBodies();
      bodiesRef.current.clear();
      flushedRef.current.clear();
    };
  }, [bubbleMode]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.code === "Space" && e.target === e.currentTarget) e.preventDefault();
  }

  function beginPan(e: PE<HTMLDivElement>) {
    panMoved.current = false;
    panDrag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
  }

  function skipBoardPan(t: HTMLElement) {
    if (t.closest("input, textarea, select, button, a, .composer, .overview, .windows-fab, .ctx-ask, .ctx-backdrop, .request-log")) return true;
    const win = t.closest(".win-app");
    if (!win) return false;
    if (win.classList.contains("win-viewport")) return win.classList.contains("is-selected");
    return true;
  }

  function onAuxPointerDownCapture(e: PE<HTMLDivElement>) {
    if (e.button !== 1 && e.button !== 2) return;
    const t = e.target as HTMLElement;
    if (skipBoardPan(t)) return;
    if (!t.closest(".win")) setActiveId(null);
    e.preventDefault();
    beginPan(e);
  }

  function onPointerDown(e: PE<HTMLDivElement>) {
    if (e.button === 1 || e.button === 2) return;
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".win, .overview, .ctx-ask, .ctx-backdrop, .request-log")) return;
    setActiveId(null);
    beginPan(e);
  }

  function onMove(e: PE<HTMLDivElement>) {
    const el = layer.current;
    if (panDrag.current && e.buttons) {
      const d = panDrag.current;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5) panMoved.current = true;
      setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
      return;
    }
    if (!el || !drag.current || !e.buttons) return;
    const pt = clientToCanvas(el, e.clientX, e.clientY, panRef.current, zoomRef.current);
    const d = drag.current;
    const x = pt.x - d.dx;
    const y = pt.y - d.dy;
    const now = performance.now();
    const dt = Math.max(now - d.lastT, 8) / 1000;
    if (d.bubble) {
      const body = bodiesRef.current.get(d.id);
      if (body) {
        body.vx = (x - body.x) / dt;
        body.vy = (y - body.y) / dt;
        capSpeed(body);
        body.x = x;
        body.y = y;
        setBubbleTick((n) => n + 1);
      }
    } else {
      move(d.id, x, y);
    }
    d.lastX = x;
    d.lastY = y;
    d.lastT = now;
  }

  function endGesture() {
    const d = drag.current;
    if (d?.bubble) {
      const body = bodiesRef.current.get(d.id);
      if (body) {
        body.vx *= 1.2;
        body.vy *= 1.2;
        capSpeed(body);
        moveRef.current(body.id, body.x, body.y);
        flushedRef.current.set(body.id, { x: body.x, y: body.y });
        nodesRef.current = nodesRef.current.map((n) => (
          n.id === body.id ? { ...n, x: body.x, y: body.y } : n
        ));
      }
    }
    drag.current = null;
    panDrag.current = null;
    setPanning(false);
  }

  function onContextMenu(e: ME<HTMLDivElement>) {
    if (!panMoved.current) return;
    e.preventDefault();
    e.stopPropagation();
    panMoved.current = false;
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
      lastX: x,
      lastY: y,
      lastT: performance.now(),
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
      onPointerDownCapture={onAuxPointerDownCapture}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
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
              autoSize={n.autoSize !== false}
              enter={conciergeEnter && n.id === CONCIERGE_ID}
              flash={flashIds.includes(n.id)}
              flashKey={flashKey}
              selected={activeId === n.id}
              viewport={n.appId === "plyworks"}
              tilt={bubbleMode ? b?.tilt : undefined}
              onFocus={() => { setActiveId(n.id); focus(n.id); }}
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
