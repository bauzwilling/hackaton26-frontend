import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AskMenu } from "../canvas/AskMenu";
import { Overview } from "../canvas/Overview";
import { StudioCanvas } from "../canvas/StudioCanvas";
import { Composer } from "../components/Composer";
import { Surface } from "../components/kit";
import { useSession } from "../context/session";
import { appLabel, CONCIERGE_ID, isWorkspaceApp, useWorkspace } from "../context/workspace";
import { chipsFor } from "../lib/catalog";
import { can } from "../lib/auth";

function isFileDrag(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export function StudioPage() {
  const { session } = useSession();
  const { nodes, ask, openApp, announceOpen, addNote, ingestFiles, pan, zoom } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [ctx, setCtx] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const [host, setHost] = useState({ width: 1200, height: 700 });
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });
  const [dropping, setDropping] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const chips = useMemo(() => chipsFor(can(session, "orbit")), [session]);

  useEffect(() => {
    const app = params.get("app");
    if (!app || !isWorkspaceApp(app)) return;
    const id = openApp(app);
    if (!id) ask(`Open ${appLabel(app)}`);
    else announceOpen(app, id);
    const next = new URLSearchParams(params);
    next.delete("app");
    setParams(next, { replace: true });
  }, [params, openApp, announceOpen, ask, setParams]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      setViewport({ width: box.width, height: box.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const block = (e: globalThis.DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const empty = nodes.length === 0;
  const conciergeUp = nodes.some((n) => n.id === CONCIERGE_ID && !n.hidden);

  function onContext(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, .overview, .request-log, .windows-fab, .composer, .win-app")) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setHost({ width: box.width, height: box.height });
    setCtx({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      world: {
        x: (e.clientX - box.left - pan.x) / zoom,
        y: (e.clientY - box.top - pan.y) / zoom,
      },
    });
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDropping(true);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDropping(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) ingestFiles(files);
  }

  return (
    <div
      className={`studio${dropping ? " is-dropping" : ""}`}
      ref={root}
      onContextMenu={onContext}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <StudioCanvas />
      {!conciergeUp && (
        empty ? (
          <div className="hero-chat">
            <h1 className="hero" style={{ color: "var(--acc-deep)", fontSize: "clamp(28px, 4vw, 56px)", margin: 0 }}>Make everything. Manufacturable.</h1>
            <p className="muted" style={{ marginTop: 14 }}>Drop a design or just describe it. Right-drag to pan, right-click to ask or add a note.</p>
            <Composer variant="hero" autoFocus />
            <div className="chips">
              {chips.map((c) => (
                <Surface key={c} as="button" type="button" relief="inset" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }} onClick={() => ask(c)}>
                  {c}
                </Surface>
              ))}
              <Surface as="button" type="button" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }} onClick={() => addNote()}>
                Add note
              </Surface>
            </div>
          </div>
        ) : (
          <div className="hero-chat is-bare">
            <Composer variant="hero" />
          </div>
        )
      )}
      {dropping && (
        <div className="drop-overlay">
          <Surface className="drop-overlay-card">
            <p className="drop-overlay-title">Drop to structure</p>
            <p className="muted" style={{ margin: 0 }}>CSV, DXF, DWG, JPG, PNG, or PDF</p>
          </Surface>
        </div>
      )}
      <Overview viewport={viewport} />
      {ctx && <AskMenu at={ctx} host={host} world={ctx.world} onClose={() => setCtx(null)} />}
    </div>
  );
}
