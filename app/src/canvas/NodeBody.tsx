import { memo, useEffect, useRef } from "react";
import { useWorkspace, type WorkspaceNode } from "../context/workspace";
import { BoxoutsPage } from "../pages/Boxouts";
import { OrbitPage } from "../pages/Orbit";
import { PartsPage } from "../pages/Parts";
import { PlyworksPage, ProjectsPage } from "../pages/Projects";
import { RequestLog } from "./RequestLog";
import { ConciergeChat } from "./Concierge";

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

export const NodeBody = memo(function NodeBody({ node, viewport }: { node: WorkspaceNode; viewport: { width: number; height: number } }) {
  if (node.kind === "log") return <RequestLog viewport={viewport} />;
  if (node.kind === "note") return <NotePanel node={node} />;
  if (node.kind === "text") return <ConciergeChat />;
  if (node.kind === "denied") {
    return <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{node.body}</p>;
  }
  if (node.kind === "app") {
    if (node.appId === "boxouts") return <BoxoutsPage />;
    if (node.appId === "simpleparts") return <PartsPage />;
    if (node.appId === "plyworks") return <PlyworksPage />;
    if (node.appId === "projects") return <ProjectsPage />;
    if (node.appId === "orbit") return <OrbitPage />;
    if (node.appId === "admin") {
      return <p style={{ margin: 0 }}>The Admin console is not available yet.</p>;
    }
  }
  return null;
});
