import { JOB_APPS, type RequestEntry, type WorkspaceApp, type WorkspaceNode } from "./document";

export type SystemEdge = {
  id: string;
  from: string;
  to: string;
  hot?: boolean;
};

export type UserEdge = {
  id: string;
  from: string;
  to: string;
  sourceHandle?: string;
  targetHandle?: string;
};

/** Derived routing wires: log chains, parentId, job→projects, apps→orbit. */
export function topology(
  nodes: WorkspaceNode[],
  entries: RequestEntry[],
  selectedEntryId: string | null,
): SystemEdge[] {
  const vis = nodes.filter((n) => !n.hidden && n.kind !== "note");
  const live = new Set(vis.map((n) => n.id));
  const apps = vis.filter((n) => n.kind === "app");
  const appBy = (id: WorkspaceApp) => apps.find((n) => n.appId === id);
  const log = vis.find((n) => n.kind === "log");
  const selected = selectedEntryId ? entries.find((e) => e.id === selectedEntryId) : null;
  const hotTargets = new Set(selected?.targetIds ?? []);
  const edges: SystemEdge[] = [];
  const seen = new Set<string>();

  const add = (from: string, to: string, hot = false) => {
    if (from === to || !live.has(from) || !live.has(to)) return;
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: `sys:${key}`, from, to, hot });
  };

  if (log) {
    for (const entry of entries) {
      const hot = entry.id === selectedEntryId;
      const chain = entry.targetIds.filter((id) => live.has(id));
      if (!chain.length) continue;
      add(log.id, chain[0], hot);
      for (let i = 1; i < chain.length; i++) add(chain[i - 1], chain[i], hot);
    }
  }

  for (const n of vis) {
    if (n.parentId) add(n.parentId, n.id, hotTargets.has(n.id));
  }

  const projects = appBy("projects");
  if (projects) {
    for (const n of apps) {
      if (n.appId && JOB_APPS.includes(n.appId)) add(n.id, projects.id);
    }
  }

  const orbit = appBy("orbit");
  if (orbit) {
    for (const n of apps) {
      if (n.appId && n.appId !== "orbit" && n.appId !== "admin") add(n.id, orbit.id);
    }
  }

  return edges;
}

export function pickHandles(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number },
): { sourceHandle: string; targetHandle: string } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { sourceHandle: "r", targetHandle: "l" } : { sourceHandle: "l", targetHandle: "r" };
  }
  return dy >= 0 ? { sourceHandle: "b", targetHandle: "t" } : { sourceHandle: "t", targetHandle: "b" };
}
