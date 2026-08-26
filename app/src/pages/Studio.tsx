import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AskMenu } from "../canvas/AskMenu";
import { Overview } from "../canvas/Overview";
import { StudioCanvas } from "../canvas/StudioCanvas";
import { Surface } from "../components/kit";
import { isWorkspaceApp, useWorkspace } from "../context/workspace";
import { CHIPS } from "../lib/catalog";

export function StudioPage() {
  const { nodes, ask, openApp } = useWorkspace();
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [host, setHost] = useState({ width: 1200, height: 700 });
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });
  const root = useRef<HTMLDivElement>(null);

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

  const empty = nodes.length === 0;

  function onContext(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, .overview, .request-log, .windows-fab")) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setHost({ width: box.width, height: box.height });
    setCtx({ x: e.clientX - box.left, y: e.clientY - box.top });
  }

  return (
    <div className="studio" ref={root} onContextMenu={onContext}>
      <StudioCanvas />
      {empty && (
        <div className="empty-hero">
          <h1 className="hero" style={{ color: "var(--acc-deep)", fontSize: "clamp(28px, 4vw, 56px)", margin: 0 }}>Make everything. Manufacturable.</h1>
          <p className="muted" style={{ marginTop: 14 }}>Upload a design or just describe it. Right-click anywhere to ask. Drag the canvas to look around.</p>
          <div className="chips">
            {CHIPS.map((c) => (
              <Surface key={c} as="button" type="button" relief="inset" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }} onClick={() => ask(c)}>
                {c}
              </Surface>
            ))}
          </div>
        </div>
      )}
      <Surface className="dock">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              ask(query);
              setQuery("");
            }
          }}
          placeholder="Describe a part, or name an app…"
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
      {ctx && <AskMenu at={ctx} host={host} onClose={() => setCtx(null)} />}
    </div>
  );
}
