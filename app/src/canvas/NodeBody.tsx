import { memo, useCallback, useEffect, useRef } from "react";
import { useWorkspace, type WorkspaceNode } from "../context/workspace";
import { BoxoutsPage } from "../pages/Boxouts";
import { OrbitPage } from "../pages/Orbit";
import { PartsPage } from "../pages/Parts";
import { PlyworksJwPage, PlyworksNestingPage, PlyworksPage } from "../pages/Plyworks";
import { ProjectsPage } from "../pages/Projects";
import { RequestLog } from "./RequestLog";
import { ConciergeChat } from "./Concierge";
import { useHelpOptional } from "../context/help";

function NotePanel({ node }: { node: WorkspaceNode }) {
  const { setNodeBody } = useWorkspace();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!(node.body ?? "").trim()) ref.current?.focus();
  }, [node.body, node.id]);

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

function NodeBodyImpl({ node, viewport }: { node: WorkspaceNode; viewport: { width: number; height: number } }) {
  const help = useHelpOptional();
  const { openApp } = useWorkspace();
  const openDesign = useCallback((design: "shelf" | "table" | "stool" | "bench") => {
    openApp("plyworks", { parentId: node.id, design });
  }, [node.id, openApp]);
  const openJointWiz = useCallback((jobId: string) => {
    openApp("plyworks-jw", { parentId: node.id, query: jobId });
  }, [node.id, openApp]);
  const openNesting = useCallback((jobId: string) => {
    openApp("plyworks-nesting", { parentId: node.id, query: jobId });
  }, [node.id, openApp]);
  if (node.kind === "log") return <RequestLog viewport={viewport} />;
  if (node.kind === "note") return <NotePanel node={node} />;
  if (node.kind === "text") return <ConciergeChat />;
  if (node.kind === "denied") {
    return <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{node.body}</p>;
  }
  if (node.kind === "app") {
    if (node.appId === "boxouts") return <BoxoutsPage />;
    if (node.appId === "simpleparts") return <PartsPage />;
    if (node.appId === "plyworks") {
      const bridged = help?.topic === "plyworks" && (help.phase === "iframe" || help.phase === "touring")
        && (!help.appNodeId || help.appNodeId === node.id);
      return (
        <PlyworksPage
          design={node.design}
          helpActive={bridged && help?.phase === "iframe"}
          onHelpReady={help?.onPlyworksReady}
          onHelpDone={help?.onPlyworksDone}
          onOpenDesign={openDesign}
          onOpenJointWiz={openJointWiz}
          onOpenNesting={openNesting}
        />
      );
    }
    if (node.appId === "plyworks-jw") {
      return <PlyworksJwPage jobId={node.query} onOpenNesting={openNesting} />;
    }
    if (node.appId === "plyworks-nesting") {
      return <PlyworksNestingPage jobId={node.query} />;
    }
    if (node.appId === "projects") return <ProjectsPage />;
    if (node.appId === "orbit") return <OrbitPage />;
    if (node.appId === "admin") {
      return <p style={{ margin: 0 }}>The Admin console is not available yet.</p>;
    }
  }
  return null;
}

/** Ignore x/y/z/w/h so drag and auto-size do not remount embedded apps. */
export const NodeBody = memo(NodeBodyImpl, (prev, next) => (
  prev.viewport.width === next.viewport.width
  && prev.viewport.height === next.viewport.height
  && prev.node.id === next.node.id
  && prev.node.kind === next.node.kind
  && prev.node.appId === next.node.appId
  && prev.node.body === next.node.body
  && prev.node.query === next.node.query
  && prev.node.design === next.node.design
  && prev.node.title === next.node.title
  && prev.node.code === next.node.code
  && prev.node.parentId === next.node.parentId
  && prev.node.routeLabel === next.node.routeLabel
  && prev.node.routeWhy === next.node.routeWhy
  && prev.node.confirmApps === next.node.confirmApps
));
