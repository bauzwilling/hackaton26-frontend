import type { WorkspaceNode } from "../context/workspace";
import type { UserEdge } from "./topology";

export type ViewportSnapshot = { x: number; y: number; zoom: number };

export type WorkspacePersist = {
  nodes: WorkspaceNode[];
  userEdges: UserEdge[];
  viewport: ViewportSnapshot;
  zTop: number;
};

type LegacyPersist = {
  nodes?: WorkspaceNode[];
  edges?: unknown[];
  userEdges?: UserEdge[];
  pan?: { x: number; y: number };
  zoom?: number;
  viewport?: ViewportSnapshot;
  zTop?: number;
};

// WAITING DATABASE: canvas layout on the user profile
export function persistKey(email: string) {
  return `f2f.workspace.${email || "anon"}`;
}

// WAITING DATABASE: request log on the user profile
export function requestsKey(email: string) {
  return `f2f.requests.${email || "anon"}`;
}

export function emptyPersist(): WorkspacePersist {
  return { nodes: [], userEdges: [], viewport: { x: 0, y: 0, zoom: 1 }, zTop: 10 };
}

function isUserEdge(e: unknown): e is UserEdge {
  if (!e || typeof e !== "object") return false;
  const row = e as UserEdge;
  return typeof row.id === "string" && typeof row.from === "string" && typeof row.to === "string";
}

export function loadWorkspacePersist(email: string): WorkspacePersist | null {
  try {
    const raw = localStorage.getItem(persistKey(email));
    if (!raw) return null;
    const data = JSON.parse(raw) as LegacyPersist;
    if (!Array.isArray(data.nodes)) return null;
    const viewport = data.viewport
      ?? { x: data.pan?.x ?? 0, y: data.pan?.y ?? 0, zoom: data.zoom ?? 1 };
    const userEdges = Array.isArray(data.userEdges) ? data.userEdges.filter(isUserEdge) : [];
    return {
      nodes: data.nodes,
      userEdges,
      viewport,
      zTop: data.zTop ?? 10,
    };
  } catch {
    return null;
  }
}

export function saveWorkspacePersist(email: string, data: WorkspacePersist) {
  try {
    localStorage.setItem(persistKey(email), JSON.stringify(data));
  } catch { /* ignore */ }
}
