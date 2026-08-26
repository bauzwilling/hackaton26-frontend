import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AskMenu } from "../canvas/AskMenu";
import { Overview } from "../canvas/Overview";
import { StudioCanvas } from "../canvas/StudioCanvas";
import { Surface } from "../components/kit";
import { isWorkspaceApp, useWorkspace } from "../context/workspace";
import { CHIPS } from "../lib/catalog";
import { FILE_ACCEPT } from "../lib/intake";

function isFileDrag(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

function ClipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function StudioPage() {
  const { nodes, ask, openApp, addNote, ingestFiles, pan, zoom } = useWorkspace();
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const [ctx, setCtx] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const [host, setHost] = useState({ width: 1200, height: 700 });
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });
  const [dropping, setDropping] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const app = params.get("app");
    if (!app || !isWorkspaceApp(app)) return;
    openApp(app);
    const next = new URLSearchParams(params);
    next.delete("app");
    setParams(next, { replace: true });
  }, [params, openApp, setParams]);

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

  function onContext(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, .overview, .request-log, .windows-fab")) return;
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

  function onPicked(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) ingestFiles(files);
    if (fileInput.current) fileInput.current.value = "";
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
      {empty && (
        <div className="empty-hero">
          <h1 className="hero" style={{ color: "var(--acc-deep)", fontSize: "clamp(28px, 4vw, 56px)", margin: 0 }}>Make everything. Manufacturable.</h1>
          <p className="muted" style={{ marginTop: 14 }}>Drop a design or just describe it. Right-click anywhere to ask or add a note. Drag the canvas to look around.</p>
          <div className="chips">
            {CHIPS.map((c) => (
              <Surface key={c} as="button" type="button" relief="inset" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }} onClick={() => ask(c)}>
                {c}
              </Surface>
            ))}
            <Surface as="button" type="button" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }} onClick={() => addNote()}>
              Add note
            </Surface>
          </div>
        </div>
      )}
      {dropping && (
        <div className="drop-overlay">
          <Surface className="drop-overlay-card">
            <p className="drop-overlay-title">Drop to structure</p>
            <p className="muted" style={{ margin: 0 }}>CSV, DXF, DWG, JPG, PNG, or PDF</p>
          </Surface>
        </div>
      )}
      <Surface className="dock">
        <input
          ref={fileInput}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          hidden
          onChange={(e) => onPicked(e.target.files)}
        />
        <Surface
          as="button"
          type="button"
          relief="inset"
          className="dock-attach"
          aria-label="Attach a file"
          onClick={() => fileInput.current?.click()}
        >
          <ClipIcon />
        </Surface>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              ask(query);
              setQuery("");
            }
          }}
          placeholder="Describe a part, drop a file, or name an app…"
        />
        <Surface
          as="button"
          type="button"
          relief="accent"
          style={{ padding: "10px 16px", borderRadius: 16 }}
          onClick={() => { ask(query); setQuery(""); }}
        >
          Send
        </Surface>
      </Surface>
      <Overview viewport={viewport} />
      {ctx && <AskMenu at={ctx} host={host} world={ctx.world} onClose={() => setCtx(null)} />}
    </div>
  );
}
