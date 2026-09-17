import type { PlyworksDesign } from "../lib/concierge";
import type { Session } from "../lib/auth";
import type { UserEdge } from "./topology";
import {
  APP_W,
  CONCIERGE_ID,
  EST_H,
  GAP,
  IFRAME_H,
  NOTE_H,
  NOTE_W,
  WORKSPACE_APPS,
  canDeleteNode,
  canDuplicateNode,
  conciergeNode,
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

function boardWindows(nodes: WorkspaceNode[], ignoreId?: string) {
  return nodes.filter((n) => (
    !n.hidden
    && n.id !== ignoreId
    && n.id !== CONCIERGE_ID
    && n.kind !== "log"
  ));
}

export function placeBeside(
  nodes: WorkspaceNode[],
  w: number,
  h: number,
  ignoreId?: string,
  origin: { x: number; y: number } = { x: 20, y: 20 },
) {
  const others = boardWindows(nodes, ignoreId).map(boxOf);
  if (!others.length) return { x: origin.x, y: origin.y };
  const candidates: { x: number; y: number }[] = [];
  for (const b of others) candidates.push({ x: b.x + b.w + GAP, y: b.y });
  for (const b of others) candidates.push({ x: b.x, y: b.y + b.h + GAP });
  const maxR = Math.max(...others.map((b) => b.x + b.w));
  candidates.push({ x: maxR + GAP, y: origin.y });
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of candidates) {
    const rect = { x: Math.max(origin.x, c.x), y: Math.max(origin.y, c.y), w, h };
    if (!others.some((b) => hits(rect, b))) return { x: rect.x, y: rect.y };
  }
  return { x: maxR + GAP, y: origin.y };
}

/** Next slot in a single row: leftover origin, then always to the right of the last app. */
export function placeAfterLast(
  nodes: WorkspaceNode[],
  origin: { x: number; y: number } = { x: 20, y: 20 },
) {
  const others = boardWindows(nodes).filter((n) => n.kind === "app");
  if (!others.length) return { x: origin.x, y: origin.y };
  const prev = [...others].sort((a, b) => a.y - b.y || a.x - b.x).at(-1)!;
  return { x: prev.x + prev.w + GAP, y: prev.y };
}

/** Roots that stack vertically when the peer is already on the board. */
const PEER_STACK_APPS = new Set<WorkspaceApp>(["plyworks", "simpleparts"]);

/**
 * Child apps open to the right of their parent; plyworks ↔ simpleparts open below
 * each other; otherwise fall back to the end of the app row.
 */
export function placeAppSlot(
  nodes: WorkspaceNode[],
  app: WorkspaceApp,
  opts: { parentId?: string; origin?: { x: number; y: number } } = {},
) {
  const origin = opts.origin ?? { x: 20, y: 20 };
  if (opts.parentId) {
    const parent = nodes.find((n) => (
      n.id === opts.parentId
      && n.kind === "app"
      && !n.hidden
    ));
    if (parent) {
      return { x: parent.x + parent.w + GAP, y: parent.y };
    }
  }
  if (PEER_STACK_APPS.has(app)) {
    const peerId = app === "plyworks" ? "simpleparts" : "plyworks";
    const peer = nodes.find((n) => n.kind === "app" && n.appId === peerId && !n.hidden);
    if (peer) {
      return { x: peer.x, y: peer.y + peer.h + GAP };
    }
  }
  return placeAfterLast(nodes, origin);
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

/** Concierge is a hidden hub for wires and parentId; the visible chat is the overlay. */
function hideConcierge(n: WorkspaceNode): WorkspaceNode {
  return n.id === CONCIERGE_ID ? { ...n, hidden: true } : n;
}

export function withRail(list: WorkspaceNode[]): WorkspaceNode[] {
  const base = list.filter((n) => n.kind !== "request" && n.kind !== "log");
  const concierge = base.find((n) => n.id === CONCIERGE_ID);
  if (concierge) return base.map(hideConcierge);
  return [...base, hideConcierge(conciergeNode())];
}

/** Writes workspace x/y for StudioBoard to hydrate into React Flow — not live RF addNodes.
 *  At most one window per app id (including job apps): reuse and unhide when present. */
export function openAppNodes(
  list: WorkspaceNode[],
  session: Session | null,
  app: WorkspaceApp,
  z: number,
  opts?: {
    parentId?: string;
    query?: string;
    design?: PlyworksDesign;
    chatIntake?: WorkspaceNode["chatIntake"];
    stage?: { w: number; h: number; x?: number; y?: number };
  },
): { nodes: WorkspaceNode[]; id: string; reused: boolean } | null {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  if (!meta || !openable(session, app)) return null;

  const box = opts?.stage ?? { w: APP_W, h: IFRAME_H, x: 20, y: 20 };
  const origin = { x: box.x ?? 20, y: box.y ?? 20 };
  const base = withRail(list);
  const parentId = opts?.parentId;
  const current = base.find((n) => n.kind === "app" && n.appId === app);
  if (current) {
    // Keep children parked to the right of their parent when they reopen.
    const childOfOther = parentId && parentId !== current.id;
    const without = childOfOther ? base.filter((n) => n.id !== current.id) : base;
    const slot = childOfOther
      ? placeAppSlot(without, app, { parentId, origin })
      : null;
    return {
      id: current.id,
      reused: true,
      nodes: base.map((n) => {
        if (n.id !== current.id) return n;
        return {
          ...n,
          z,
          hidden: false,
          title: meta.label,
          parentId: parentId ?? n.parentId,
          // Prefer a fresh query when supplied (nesting windows need the latest jobId).
          query: opts?.query !== undefined ? opts.query : n.query,
          design: opts?.design ?? n.design,
          // New handoff always wins so follow-ups reach the open window.
          chatIntake: opts?.chatIntake !== undefined ? opts.chatIntake : n.chatIntake,
          ...(slot ? { x: slot.x, y: slot.y } : {}),
          w: box.w,
          h: box.h,
          autoSize: false,
        };
      }),
    };
  }

  const id = uid("a");
  const slot = placeAppSlot(base, app, { parentId, origin });
  const node: WorkspaceNode = {
    id,
    kind: "app",
    title: meta.label,
    code: `${meta.label.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
    appId: app,
    query: opts?.query,
    design: opts?.design,
    chatIntake: opts?.chatIntake,
    parentId,
    x: slot.x,
    y: slot.y,
    z,
    w: box.w,
    h: box.h,
    hidden: false,
    autoSize: false,
  };
  return { id, nodes: [...base, node], reused: false };
}

/** Clears a consumed Concierge → app chat intake stamp. */
export function clearChatIntakeNodes(
  list: WorkspaceNode[],
  nodeId: string,
  intakeId: string,
): WorkspaceNode[] {
  return list.map((n) => (
    n.id === nodeId && n.chatIntake?.id === intakeId
      ? { ...n, chatIntake: undefined }
      : n
  ));
}

export function ensureConciergeNodes(list: WorkspaceNode[], z: number): WorkspaceNode[] {
  return withRail(list).map((n) => (
    n.id === CONCIERGE_ID ? { ...n, z, hidden: true } : n
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
  origin: { x: number; y: number } = { x: 20, y: 20 },
): WorkspaceNode[] {
  const vis = [...boardWindows(list).filter((n) => !n.locked)]
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (!vis.length) return list;
  const cols = 2;
  const placed = new Map<string, { x: number; y: number }>();
  let rowY = origin.y;
  for (let i = 0; i < vis.length; i += cols) {
    const row = vis.slice(i, i + cols);
    const rowH = Math.max(...row.map((n) => Math.max(n.h, 80)));
    let x = origin.x;
    for (const n of row) {
      placed.set(n.id, { x, y: rowY });
      x += Math.max(n.w, 160) + GAP;
    }
    rowY += rowH + GAP;
  }
  return list.map((n) => {
    const p = placed.get(n.id);
    if (!p) return n;
    return { ...n, x: p.x, y: p.y };
  });
}

export function unrailConcierge(list: WorkspaceNode[], id: string): WorkspaceNode[] {
  if (id !== CONCIERGE_ID) return list;
  return list.map((n) => (n.id === CONCIERGE_ID ? { ...n, railed: false } : n));
}

export function setNodeBodyNodes(list: WorkspaceNode[], id: string, body: string): WorkspaceNode[] {
  return list.map((n) => (n.id === id ? { ...n, body } : n));
}
