import type { WorkspaceNode } from "../context/workspace";
import { BoxoutsPage } from "../pages/Boxouts";
import { OrbitPage } from "../pages/Orbit";
import { PartsPage } from "../pages/Parts";
import { PlyworksPage, ProjectsPage } from "../pages/Projects";
import { RequestLog } from "./RequestLog";

export function NodeBody({ node, viewport }: { node: WorkspaceNode; viewport: { width: number; height: number } }) {
  if (node.kind === "log") return <RequestLog viewport={viewport} />;
  if (node.kind === "denied" || node.kind === "text") {
    return <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{node.body}</p>;
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
