import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Surface } from "../components/kit";
import { useSession } from "../context/session";
import { useWorkspace } from "../context/workspace";
import { chipsFor } from "../lib/catalog";
import { can } from "../lib/auth";
import { FILE_ACCEPT } from "../lib/intake";

export function AskMenu({
  at,
  host,
  world,
  onClose,
}: {
  at: { x: number; y: number };
  host: { width: number; height: number };
  world: { x: number; y: number };
  onClose: () => void;
}) {
  const { session } = useSession();
  const { ask, addNote, ingestFiles, entries } = useWorkspace();
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const W = 420;
  const left = Math.max(12, Math.min(at.x, host.width - W - 12));
  const top = Math.max(12, Math.min(at.y, host.height - 160));

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const suggestions = useMemo(
    () => chipsFor(can(session, "orbit")).filter((c) => !entries.some((n) => n.query.toLowerCase() === c.toLowerCase())).slice(0, 3),
    [session, entries],
  );

  function submit(raw = value) {
    const q = raw.trim();
    if (!q) return;
    ask(q);
    onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <>
      <div
        className="ctx-backdrop"
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      />
      <Surface className="ctx-ask" style={{ left, top, width: W }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        <p className="ctx-title">What would you like to do?</p>
        <form className="ctx-row" onSubmit={onSubmit}>
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask anything — or describe something to build…"
          />
          <Surface as="button" type="submit" relief="accent" className="ctx-send" aria-label="Send">↑</Surface>
        </form>
        {suggestions.length > 0 && (
          <div className="ctx-chips">
            {suggestions.map((s) => (
              <Surface key={s} as="button" type="button" relief="inset" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }} onClick={() => submit(s)}>
                {s}
              </Surface>
            ))}
          </div>
        )}
        <div className="ctx-actions">
          <input
            ref={fileInput}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              ingestFiles(files);
              onClose();
            }}
          />
          <Surface
            as="button"
            type="button"
            relief="inset"
            style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }}
            onClick={() => fileInput.current?.click()}
          >
            Attach file
          </Surface>
          <Surface
            as="button"
            type="button"
            relief="inset"
            style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }}
            onClick={() => { addNote({ x: world.x, y: world.y }); onClose(); }}
          >
            Add note
          </Surface>
        </div>
      </Surface>
    </>
  );
}
