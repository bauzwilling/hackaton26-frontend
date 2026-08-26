import { useEffect, useState } from "react";
import { Surface } from "../components/kit";
import { useSession } from "../context/session";
import { CONCIERGE_ID, useWorkspace } from "../context/workspace";
import { DEFAULT_TEMPLATES, loadTemplates, saveTemplates, uidTemplate, type RequestTemplate } from "../lib/templates";

export function Overview({ viewport }: { viewport: { width: number; height: number } }) {
  const { nodes, entries, overviewOpen, setOverviewOpen, tile, show, hide, close, focus, clear, ask, addNote } = useWorkspace();
  const { session } = useSession();
  const email = session?.email ?? "anon";
  const [tplPanel, setTplPanel] = useState<"closed" | "menu" | "save" | "open">("closed");
  const [confirmClear, setConfirmClear] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<RequestTemplate[]>(() => loadTemplates(email));

  useEffect(() => {
    setSaved(loadTemplates(email));
  }, [email]);

  useEffect(() => {
    if (!overviewOpen) {
      setTplPanel("closed");
      setConfirmClear(false);
    }
  }, [overviewOpen]);

  const hasLogOrConcierge = entries.length > 0 || nodes.some((n) => n.kind === "log" || n.id === CONCIERGE_ID);

  function onClearBoard() {
    if (hasLogOrConcierge) {
      setConfirmClear(true);
      setTplPanel("closed");
      return;
    }
    clear();
  }

  function saveCurrentView() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const fromLog = entries.map((e) => ({ query: e.query }));
    const fromApps = nodes
      .filter((n) => n.kind === "app" && n.title)
      .map((n) => ({ query: `Open ${n.title}` }));
    const steps = fromLog.length ? fromLog : fromApps;
    if (!steps.length) return;
    const next: RequestTemplate = { id: uidTemplate(), name: trimmed, steps, savedAt: Date.now() };
    const list = [...saved, next];
    setSaved(list);
    saveTemplates(email, list);
    setName("");
    setTplPanel("menu");
  }

  function runTemplate(tpl: RequestTemplate) {
    setTplPanel("closed");
    tpl.steps.forEach((s) => ask(s.query));
  }

  function removeTemplate(id: string) {
    const list = saved.filter((t) => t.id !== id);
    setSaved(list);
    saveTemplates(email, list);
  }

  return (
    <>
      <Surface
        as="button"
        type="button"
        className="windows-fab"
        active={overviewOpen}
        onClick={() => setOverviewOpen(!overviewOpen)}
      >
        Windows
      </Surface>
      {overviewOpen && (
        <Surface className="overview">
          <div className="overview-head">
            <span>Open windows</span>
            <Surface as="button" type="button" relief="inset" style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 999, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }} onClick={() => tile(viewport)}>
              Arrange
            </Surface>
            <Surface as="button" type="button" relief="ghost" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => setOverviewOpen(false)}>
              ×
            </Surface>
          </div>
          {confirmClear ? (
            <div className="overview-clear-prompt">
              <p>Also clear the request log and concierge?</p>
              <div className="overview-tools" style={{ padding: 0 }}>
                <Surface as="button" type="button" relief="inset" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12 }} onClick={() => { setConfirmClear(false); clear(); }}>
                  Keep them
                </Surface>
                <Surface as="button" type="button" relief="accent" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12 }} onClick={() => { setConfirmClear(false); clear({ transcript: true }); }}>
                  Clear those too
                </Surface>
                <Surface as="button" type="button" relief="ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => setConfirmClear(false)}>
                  Cancel
                </Surface>
              </div>
            </div>
          ) : (
            <div className="overview-tools">
              <Surface as="button" type="button" relief="inset" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12 }} onClick={onClearBoard}>
                Clear board
              </Surface>
              <Surface as="button" type="button" relief="inset" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12 }} onClick={() => { addNote(); setOverviewOpen(false); }}>
                Add note
              </Surface>
              <Surface as="button" type="button" active={tplPanel !== "closed"} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12 }} onClick={() => setTplPanel((p) => (p === "closed" ? "menu" : "closed"))}>
                Templates
              </Surface>
            </div>
          )}
          {tplPanel === "menu" && (
            <div className="overview-tpl-actions">
              <Surface as="button" type="button" relief="inset" style={{ padding: "8px 12px", borderRadius: 14, fontSize: 13, textAlign: "left" }} onClick={() => setTplPanel("save")}>
                Save current view as template
              </Surface>
              <Surface as="button" type="button" relief="inset" style={{ padding: "8px 12px", borderRadius: 14, fontSize: 13, textAlign: "left" }} onClick={() => setTplPanel("open")}>
                Open template
              </Surface>
            </div>
          )}
          {tplPanel === "save" && (
            <form className="overview-tpl-save" onSubmit={(e) => { e.preventDefault(); saveCurrentView(); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" autoFocus />
              <Surface as="button" type="submit" relief="accent" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>Save</Surface>
              <Surface as="button" type="button" relief="ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => setTplPanel("menu")}>Back</Surface>
            </form>
          )}
          {tplPanel === "open" && (
            <div className="overview-tpl-open">
              <div className="viz-label">Default</div>
              <ul className="request-tpl-list">
                {DEFAULT_TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="request-tpl-run" onClick={() => runTemplate(t)}>{t.name}</button>
                  </li>
                ))}
              </ul>
              <div className="viz-label">Your templates</div>
              <ul className="request-tpl-list">
                {saved.length === 0 && <li className="muted" style={{ padding: "6px 4px" }}>None saved yet.</li>}
                {saved.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="request-tpl-run" onClick={() => runTemplate(t)}>{t.name}</button>
                    <Surface as="button" type="button" relief="ghost" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => removeTemplate(t.id)}>×</Surface>
                  </li>
                ))}
              </ul>
              <Surface as="button" type="button" relief="ghost" style={{ padding: "7px 10px", fontSize: 12, alignSelf: "flex-start" }} onClick={() => setTplPanel("menu")}>Back</Surface>
            </div>
          )}
          <ul className="overview-list">
            {nodes.length === 0 && <li className="muted">Nothing open yet.</li>}
            {nodes.map((n) => (
              <li key={n.id}>
                <button type="button" className="overview-item" onClick={() => { show(n.id); focus(n.id); }}>
                  <span className="win-dot" />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <strong>{n.title}</strong>
                    <span className="muted" style={{ display: "block", fontSize: 11 }}>{n.hidden ? "Hidden" : n.kind} · {n.code}</span>
                  </span>
                </button>
                <Surface as="button" type="button" relief="ghost" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => (n.hidden ? show(n.id) : hide(n.id))} title={n.hidden ? "Show" : "Hide"}>
                  {n.hidden ? "+" : "–"}
                </Surface>
                <Surface as="button" type="button" relief="ghost" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => close(n.id)}>
                  ×
                </Surface>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </>
  );
}
