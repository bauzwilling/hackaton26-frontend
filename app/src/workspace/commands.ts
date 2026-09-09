import type { PlyworksDesign } from "../lib/concierge";
import type { Session } from "../lib/auth";
import type { UserEdge } from "./topology";
import {
  APP_W,
  CONCIERGE_ID,
  EST_H,
  GAP,
  JOB_APPS,
  LOG_ID,
  NOTE_H,
  NOTE_W,
  RAIL_W,
  WORKSPACE_APPS,
  appBox,
  canDeleteNode,
  canDuplicateNode,
  conciergeNode,
  isFixedSizeApp,
  logNode,
  openable,
  type WorkspaceApp,
  type WorkspaceNode,
} from "./document";

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

function boxOf(n: WorkspaceNode) {
  return { x: n.x, y: n.y, w: n.w, h: Math.max(n.h, EST_H[n.kind] ?? 160) };
}

function hits(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
}

export function placeBeside(nodes: WorkspaceNode[], w: number, h: number, ignoreId?: string) {
  const others = nodes.filter((n) => !n.hidden && n.id !== ignoreId).map(boxOf);
  if (!others.length) return { x: 20, y: 20 };
  const candidates: { x: number; y: number }[] = [];
  for (const b of others) candidates.push({ x: b.x + b.w + GAP, y: b.y });
  for (const b of others) candidates.push({ x: b.x, y: b.y + b.h + GAP });
  const maxR = Math.max(...others.map((b) => b.x + b.w));
  candidates.push({ x: maxR + GAP, y: 20 });
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of candidates) {
    const rect = { x: Math.max(20, c.x), y: Math.max(20, c.y), w, h };
    if (!others.some((b) => hits(rect, b))) return { x: rect.x, y: rect.y };
  }
  return { x: maxR + GAP, y: 20 };
}

/** Hugs the log's measured height; before the first fit, h is still the estimate. */
export function railY(log: WorkspaceNode) {
  return log.y + log.h + GAP;
}

/** Pull the concierge back under the log after either one is resized or the log is moved. */
export function restack(list: WorkspaceNode[]): WorkspaceNode[] {
  const log = list.find((n) => n.kind === "log");
  const concierge = list.find((n) => n.id === CONCIERGE_ID);
  if (!log || !concierge || !concierge.railed) return list;
  const y = railY(log);
  if (concierge.x === log.x && concierge.y === y) return list;
  return list.map((n) => (n.id === CONCIERGE_ID ? { ...n, x: log.x, y } : n));
}

/**
 * The log and the concierge are one unit: log on top, concierge (which carries the
 * composer) directly beneath it. Everything that puts something on the board goes
 * through here, so the composer always has a home.
 */
export function withRail(list: WorkspaceNode[]): WorkspaceNode[] {
  const base = list.filter((n) => n.kind !== "request");
  const log = base.find((n) => n.kind === "log");
  const concierge = base.find((n) => n.id === CONCIERGE_ID);

  if (log && concierge) {
    return restack(base.map((n) => (
      n.id === log.id || n.id === CONCIERGE_ID ? { ...n, hidden: false } : n
    )));
  }

  if (log) {
    return [...base.map((n) => (n.id === log.id ? { ...n, hidden: false } : n)), {
      ...conciergeNode(),
      x: log.x,
      y: railY(log),
    }];
  }

  const others = base.filter((n) => n.id !== CONCIERGE_ID);
  const slot = placeBeside(others, RAIL_W, EST_H.log + GAP + EST_H.text);
  const nextLog = { ...logNode(), x: slot.x, y: slot.y };
  const nextConcierge = { ...(concierge ?? conciergeNode()), hidden: false, railed: true, x: slot.x, y: railY(nextLog) };
  return [nextLog, ...others, nextConcierge];
}

/** Writes workspace x/y for StudioBoard to hydrate into React Flow — not live RF addNodes. */
export function openAppNodes(
  list: WorkspaceNode[],
  session: Session | null,
  app: WorkspaceApp,
  z: number,
  opts?: { parentId?: string; query?: string; design?: PlyworksDesign },
): { nodes: WorkspaceNode[]; id: string } | null {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  if (!meta || !openable(session, app)) return null;

  const reuse = !JOB_APPS.includes(app);
  const base = withRail(list);
  const current = reuse ? base.find((n) => n.kind === "app" && n.appId === app) : undefined;
  if (current) {
    const box = appBox(app);
    return {
      id: current.id,
      nodes: base.map((n) => {
        if (n.id !== current.id) return n;
        return {
          ...n,
          z,
          hidden: false,
          title: meta.label,
          parentId: opts?.parentId ?? n.parentId,
          query: opts?.query ?? n.query,
          design: opts?.design ?? n.design,
          ...(app === "plyworks-jw" ? { w: box.w, h: box.h, autoSize: false } : {}),
        };
      }),
    };
  }

  const id = uid("a");
  const iframe = isFixedSizeApp(app);
  const box = appBox(app);
  const appW = iframe ? box.w : APP_W;
  const appH = iframe ? box.h : EST_H.app;
  const slot = placeBeside(base, appW, appH);
  const node: WorkspaceNode = {
    id,
    kind: "app",
    title: meta.label,
    code: `${meta.label.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
    appId: app,
    query: opts?.query,
    design: opts?.design,
    parentId: opts?.parentId,
    x: slot.x,
    y: slot.y,
    z,
    w: appW,
    h: iframe ? box.h : 1,
    hidden: false,
    autoSize: !iframe,
  };
  return { id, nodes: [...base, node] };
}

export function ensureConciergeNodes(list: WorkspaceNode[], z: number): WorkspaceNode[] {
  return withRail(list).map((n) => (
    n.id === CONCIERGE_ID ? { ...n, z, hidden: false, parentId: n.parentId ?? LOG_ID } : n
  ));
}

export function addNoteNodes(
  list: WorkspaceNode[],
  z: number,
  opts?: { x?: number; y?: number },
): { nodes: WorkspaceNode[]; id: string } {
  const id = uid("n");
  const slot = opts?.x != null && opts?.y != null
    ? { x: opts.x, y: opts.y }
    : placeBeside(list, NOTE_W, NOTE_H);
  const note: WorkspaceNode = {
    id,
    kind: "note",
    title: "Note",
    code: "NOTE",
    body: "",
    x: slot.x,
    y: slot.y,
    z,
    w: NOTE_W,
    h: NOTE_H,
    hidden: false,
    autoSize: true,
  };
  return { id, nodes: [...list, note] };
}

export function commitPositionNodes(
  list: WorkspaceNode[],
  positions: Record<string, { x: number; y: number }>,
): WorkspaceNode[] {
  return restack(list.map((n) => {
    const p = positions[n.id];
    if (!p || n.locked) return n;
    return { ...n, x: p.x, y: p.y };
  }));
}

export function fitNode(list: WorkspaceNode[], id: string, w: number, h: number): WorkspaceNode[] {
  return restack(list.map((n) => {
    if (n.id !== id || n.autoSize === false) return n;
    const minW = n.kind === "note" ? 140 : 240;
    const nw = Math.max(minW, Math.round(w));
    const nh = Math.max(80, Math.round(h));
    if (Math.abs(n.w - nw) < 2 && Math.abs(n.h - nh) < 2) return n;
    return { ...n, w: nw, h: nh };
  }));
}

export function closeNode(
  list: WorkspaceNode[],
  userEdges: UserEdge[],
  id: string,
): { nodes: WorkspaceNode[]; userEdges: UserEdge[] } | null {
  const n = list.find((item) => item.id === id);
  if (n && !canDeleteNode(n)) return null;
  return {
    nodes: list.filter((item) => item.id !== id),
    userEdges: userEdges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function hideNode(list: WorkspaceNode[], id: string): WorkspaceNode[] {
  return list.map((n) => (n.id === id ? { ...n, hidden: true } : n));
}

export function bumpZNode(list: WorkspaceNode[], id: string, z: number): WorkspaceNode[] {
  return list.map((n) => (n.id === id ? { ...n, z, hidden: false } : n));
}

export function setLockedNodes(list: WorkspaceNode[], ids: string[], locked: boolean): WorkspaceNode[] {
  const set = new Set(ids);
  return list.map((n) => (set.has(n.id) ? { ...n, locked } : n));
}

export function duplicateNodeCopies(
  list: WorkspaceNode[],
  ids: string[],
  zTop: number,
): { nodes: WorkspaceNode[]; copies: WorkspaceNode[]; zTop: number } {
  const want = new Set(ids);
  const sources = list.filter((n) => want.has(n.id) && canDuplicateNode(n) && !n.hidden);
  if (!sources.length) return { nodes: list, copies: [], zTop };
  const offset = 40;
  let z = zTop;
  const copies: WorkspaceNode[] = sources.map((n) => {
    z += 1;
    const prefix = n.kind === "note" ? "n" : "a";
    const code = n.kind === "app"
      ? `${n.title.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
      : n.code;
    return {
      ...n,
      id: uid(prefix),
      code,
      x: n.x + offset,
      y: n.y + offset,
      z,
      locked: false,
      hidden: false,
      railed: false,
    };
  });
  return { nodes: [...list, ...copies], copies, zTop: z };
}

export function tileNodes(
  list: WorkspaceNode[],
  viewport: { width: number; height: number },
): WorkspaceNode[] {
  const vis = list.filter((n) => !n.hidden && !n.locked);
  if (!vis.length) return list;
  const pad = 24;
  const limit = Math.max(viewport.width, 400);
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed = new Map<string, { x: number; y: number }>();
  for (const n of vis) {
    const w = Math.max(n.w, 160);
    const h = Math.max(n.h, 80);
    if (x > pad && x + w + pad > limit) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.set(n.id, { x, y });
    x += w + pad;
    rowH = Math.max(rowH, h);
  }
  return list.map((n) => {
    const p = placed.get(n.id);
    if (!p) return n;
    return n.id === CONCIERGE_ID ? { ...n, x: p.x, y: p.y, railed: false } : { ...n, x: p.x, y: p.y };
  });
}

export function unrailConcierge(list: WorkspaceNode[], id: string): WorkspaceNode[] {
  if (id !== CONCIERGE_ID) return list;
  return list.map((n) => (n.id === CONCIERGE_ID ? { ...n, railed: false } : n));
}

export function setNodeBodyNodes(list: WorkspaceNode[], id: string, body: string): WorkspaceNode[] {
  return list.map((n) => (n.id === id ? { ...n, body } : n));
}
