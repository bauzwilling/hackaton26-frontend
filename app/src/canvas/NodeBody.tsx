import { useEffect, useRef } from "react";
import { Surface } from "../components/kit";
import { appLabel, useWorkspace, type WorkspaceNode } from "../context/workspace";
import { BoxoutsPage } from "../pages/Boxouts";
import { OrbitPage } from "../pages/Orbit";
import { PartsPage } from "../pages/Parts";
import { PlyworksPage, ProjectsPage } from "../pages/Projects";
import { RequestLog } from "./RequestLog";

function NotePanel({ node }: { node: WorkspaceNode }) {
  const { setNodeBody } = useWorkspace();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!(node.body ?? "").trim()) ref.current?.focus();
  }, [node.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  }, [node.body]);

  return (
    <textarea
      ref={ref}
      className="note-body"
      rows={3}
      value={node.body ?? ""}
      placeholder="Type a note…"
      onChange={(e) => setNodeBody(node.id, e.target.value)}
      onWheel={(e) => e.stopPropagation()}
    />
  );
}

export function NodeBody({ node, viewport }: { node: WorkspaceNode; viewport: { width: number; height: number } }) {
  const { confirmIntake } = useWorkspace();

  if (node.kind === "log") return <RequestLog viewport={viewport} />;
  if (node.kind === "note") return <NotePanel node={node} />;
  if (node.kind === "denied" || node.kind === "text") {
    const chips = node.kind === "text" ? node.confirmApps : undefined;
    return (
      <div className="concierge-body">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{node.body}</p>
        {chips && chips.length > 0 && (
          <div className="concierge-confirm">
            {chips.map((app) => (
              <Surface
                key={app}
                as="button"
                type="button"
                relief="inset"
                style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }}
                onClick={() => confirmIntake(node.id, app)}
              >
                {appLabel(app)}
              </Surface>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (node.kind === "app") {
    if (node.appId === "boxouts") return <BoxoutsPage />;
    if (node.appId === "simpleparts") return <PartsPage />;
    if (node.appId === "plyworks") return <PlyworksPage />;
    if (node.appId === "projects") return <ProjectsPage />;
    if (node.appId === "orbit") return <OrbitPage />;
  }
  return null;
}
