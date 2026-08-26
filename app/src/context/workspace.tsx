import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APP_LABELS, can, COMPANIES, hasApp, type AppId, type Session } from "../lib/auth";
import { useSession } from "./session";

export type NodeKind = "log" | "request" | "app" | "menu" | "denied" | "text";
export type WorkspaceApp = "boxouts" | "simpleparts" | "plyworks" | "projects" | "orbit";

export type WorkspaceNode = {
  id: string;
  kind: NodeKind;
  title: string;
  code: string;
  appId?: WorkspaceApp;
  query?: string;
  body?: string;
  parentId?: string;
  routeLabel?: string;
  routeWhy?: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  hidden: boolean;
  autoSize?: boolean;
};

export type WorkspaceEdge = { from: string; to: string };

/** Session transcript. Later this is the API payload for a user chat thread. */
export type RequestEntry = {
  id: string;
  at: number;
  query: string;
  routeLabel: string;
  routeWhy: string;
  targetIds: string[];
  appId?: WorkspaceApp;
  result: "app" | "text" | "denied";
};

type Persist = {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  pan: { x: number; y: number };
  zoom: number;
  zTop: number;
};

type Ctx = {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  entries: RequestEntry[];
  selectedEntryId: string | null;
  setSelectedEntryId: (id: string | null) => void;
  pan: { x: number; y: number };
  zoom: number;
  overviewOpen: boolean;
  setOverviewOpen: (v: boolean) => void;
  setPan: (p: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  setZoom: (z: number | ((prev: number) => number)) => void;
  openApp: (app: WorkspaceApp, opts?: { parentId?: string; query?: string }) => string | null;
  ask: (query: string) => void;
  restoreEntry: (entryId: string, viewport?: { width: number; height: number }) => void;
  focusTargets: (ids: string[], viewport: { width: number; height: number }) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  fit: (id: string, w: number, h: number) => void;
  close: (id: string) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  tile: (viewport: { width: number; height: number }) => void;
  clear: () => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export const LOG_ID = "request-log";
const RAIL_X = 20;
const RAIL_W = 340;
const LOG_W = 340;
const APP_W = 960;

const CONCIERGE_BODY = "Upload a design or describe it. F2F routes CNC, wood, sheet metal and print jobs across a decentralized network. Quotes are ranges until a file is confirmed — then the nearest capable machine produces and ships.";

const INTENTS: { app: WorkspaceApp; title: string; label: string; why: string; licensed?: AppId; perm?: string; re: RegExp }[] = [
  { app: "orbit", title: "CNC Orbit", label: "CNC Orbit", why: "Machine and worklist questions open CNC Orbit", perm: "overview", re: /orbit|worklist|machine|dashboard|cnc/i },
  { app: "projects", title: "Projects", label: "Projects", why: "Order history opens Projects", re: /project|order|history|quote/i },
  { app: "plyworks", title: "Plyworks", label: "Plyworks", why: "Panel and furniture jobs open Plyworks", licensed: "plyworks", re: /plywood|plyworks|panel|shelf|cabinet|furniture/i },
  { app: "simpleparts", title: "Simple Parts", label: "Simple Parts", why: "DXF and part jobs open Simple Parts", licensed: "simpleparts", re: /simple\s*-?\s*parts|\bdxf\b|laser|bracket|\bpart/i },
  { app: "boxouts", title: "Door boxouts", label: "Boxouts", why: "Dimensioned box jobs open Boxouts", licensed: "boxouts", re: /boxout|box[\s-]?out|\d{2,4}\s*[x×*]\s*\d{2,4}/i },
];

export const WORKSPACE_APPS: { id: WorkspaceApp; label: string; licensed?: AppId; perm?: string }[] = [
  { id: "boxouts", label: "Boxouts", licensed: "boxouts" },
  { id: "simpleparts", label: "Simple Parts", licensed: "simpleparts" },
  { id: "plyworks", label: "Plyworks", licensed: "plyworks" },
  { id: "projects", label: "Projects" },
  { id: "orbit", label: "Orbit", perm: "overview" },
];

export function isWorkspaceApp(v: string): v is WorkspaceApp {
  return WORKSPACE_APPS.some((a) => a.id === v);
}

function persistKey(company: string) {
  return `f2f.workspace.${company}`;
}

function requestsKey(email: string) {
  return `f2f.requests.${email || "anon"}`;
}

function loadPersist(company: string): Persist | null {
  try {
    const raw = localStorage.getItem(persistKey(company));
    if (!raw) return null;
    const data = JSON.parse(raw) as Persist;
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
    return data;
  } catch {
    return null;
  }
}

function loadEntries(email: string): RequestEntry[] {
  try {
    const raw = localStorage.getItem(requestsKey(email));
    if (!raw) return [];
    const data = JSON.parse(raw) as RequestEntry[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

const GAP = 24;
const EST_H: Record<NodeKind, number> = {
  log: 280,
  app: 640,
  text: 200,
  denied: 160,
  request: 160,
  menu: 200,
};

function boxOf(n: WorkspaceNode) {
  return { x: n.x, y: n.y, w: n.w, h: Math.max(n.h, EST_H[n.kind] ?? 160) };
}

function hits(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
}

function placeBeside(nodes: WorkspaceNode[], w: number, h: number, ignoreId?: string) {
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

function allowed(session: Session | null, app: WorkspaceApp) {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  if (!meta) return false;
  if (meta.licensed && !hasApp(session, meta.licensed)) return false;
  if (meta.perm && !can(session, meta.perm)) return false;
  return true;
}

function emptyPersist(): Persist {
  return { nodes: [], edges: [], pan: { x: 0, y: 0 }, zoom: 1, zTop: 10 };
}

function logNode(): WorkspaceNode {
  return {
    id: LOG_ID,
    kind: "log",
    title: "Request log",
    code: "LOG",
    x: RAIL_X,
    y: 20,
    z: 8,
    w: LOG_W,
    h: 1,
    hidden: false,
    autoSize: true,
  };
}

function withLog(list: WorkspaceNode[]): WorkspaceNode[] {
  if (list.some((n) => n.kind === "log")) return list;
  const slot = placeBeside(list, LOG_W, EST_H.log);
  return [{ ...logNode(), ...slot }, ...list.filter((n) => n.kind !== "request")];
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const company = session?.company ?? "none";
  const email = session?.email ?? "anon";
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [edges, setEdges] = useState<WorkspaceEdge[]>([]);
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const zTop = useRef(10);
  const skipSave = useRef(0);
  const skipEntries = useRef(0);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => {
    const saved = loadPersist(company) ?? emptyPersist();
    skipSave.current += 1;
    const cleaned = saved.nodes.filter((n) => n.kind !== "request");
    setNodes(cleaned);
    setEdges(saved.edges);
    setPan(saved.pan ?? { x: 0, y: 0 });
    setZoom(saved.zoom ?? 1);
    zTop.current = saved.zTop ?? 10;
  }, [company]);

  useEffect(() => {
    skipEntries.current += 1;
    const loaded = loadEntries(email);
    setEntries(loaded);
    if (loaded.length) {
      setNodes((list) => withLog(list));
    }
  }, [email]);

  useEffect(() => {
    if (skipSave.current > 0) {
      skipSave.current -= 1;
      return;
    }
    const data: Persist = { nodes, edges, pan, zoom, zTop: zTop.current };
    try {
      localStorage.setItem(persistKey(company), JSON.stringify(data));
    } catch { /* ignore */ }
  }, [company, nodes, edges, pan, zoom]);

  useEffect(() => {
    if (skipEntries.current > 0) {
      skipEntries.current -= 1;
      return;
    }
    try {
      localStorage.setItem(requestsKey(email), JSON.stringify(entries));
    } catch { /* ignore */ }
  }, [email, entries]);

  const bumpZ = useCallback((id: string) => {
    zTop.current += 1;
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, z: zTop.current, hidden: false } : n)));
  }, []);

  const focus = useCallback((id: string) => {
    bumpZ(id);
  }, [bumpZ]);

  const openApp = useCallback((app: WorkspaceApp, opts?: { parentId?: string; query?: string }) => {
    const meta = WORKSPACE_APPS.find((a) => a.id === app);
    if (!meta) return null;

    if (!allowed(session, app)) {
      const id = uid("d");
      zTop.current += 1;
      const denied: WorkspaceNode = {
        id,
        kind: "denied",
        title: `${meta.label} — not licensed`,
        code: `LIC-${Math.floor(1000 + Math.random() * 9000)}`,
        appId: app,
        query: opts?.query,
        parentId: opts?.parentId,
        body: session
          ? `${meta.label} is not on ${COMPANIES[session.company].name}'s plan.`
          : `${meta.label} is not available.`,
        x: RAIL_X,
        y: 20,
        z: zTop.current,
        w: RAIL_W,
        h: 1,
        hidden: false,
        autoSize: true,
      };
      setNodes((list) => {
        const base = withLog(list);
        const slot = placeBeside(base, RAIL_W, EST_H.denied);
        return [...base, { ...denied, ...slot }];
      });
      return id;
    }

    const found = nodesRef.current.find((n) => n.kind === "app" && n.appId === app);
    const id = found?.id ?? uid("a");
    zTop.current += 1;
    const z = zTop.current;
    setNodes((list) => {
      const base = withLog(list);
      const current = base.find((n) => n.kind === "app" && n.appId === app);
      if (current) {
        return base.map((n) => (n.id === current.id ? { ...n, z, hidden: false, parentId: opts?.parentId ?? n.parentId, query: opts?.query ?? n.query } : n));
      }
      const slot = placeBeside(base, APP_W, EST_H.app);
      const node: WorkspaceNode = {
        id,
        kind: "app",
        title: meta.label,
        code: `${meta.label.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        appId: app,
        query: opts?.query,
        parentId: opts?.parentId,
        x: slot.x,
        y: slot.y,
        z,
        w: APP_W,
        h: 1,
        hidden: false,
        autoSize: true,
      };
      return [...base, node];
    });
    return id;
  }, [session]);

  const spawnText = useCallback((query: string, parentId: string) => {
    const id = uid("t");
    zTop.current += 1;
    setNodes((list) => {
      const base = withLog(list);
      const slot = placeBeside(base, RAIL_W, EST_H.text);
      const text: WorkspaceNode = {
        id,
        kind: "text",
        title: "Concierge",
        code: "F2F",
        parentId,
        query,
        body: CONCIERGE_BODY,
        x: slot.x,
        y: slot.y,
        z: zTop.current,
        w: RAIL_W,
        h: 1,
        hidden: false,
        autoSize: true,
      };
      return [...base, text];
    });
    return id;
  }, []);

  const ask = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const intent = INTENTS.find((it) => it.re.test(q)) ?? null;
    setNodes((list) => withLog(list));

    let targetId: string | null = null;
    let result: RequestEntry["result"] = "text";
    let appId: WorkspaceApp | undefined;

    if (!intent) {
      targetId = spawnText(q, LOG_ID);
      result = "text";
    } else {
      appId = intent.app;
      targetId = openApp(intent.app, { parentId: LOG_ID, query: q });
      result = allowed(session, intent.app) ? "app" : "denied";
    }

    const entry: RequestEntry = {
      id: uid("e"),
      at: Date.now(),
      query: q,
      routeLabel: intent?.label ?? "Concierge",
      routeWhy: intent?.why ?? "Answered on the canvas",
      targetIds: targetId ? [targetId] : [],
      appId,
      result,
    };
    setEntries((list) => [...list, entry]);
    setSelectedEntryId(entry.id);
  }, [openApp, spawnText, session]);

  const focusTargets = useCallback((ids: string[], viewport: { width: number; height: number }) => {
    const live = nodesRef.current.filter((n) => ids.includes(n.id));
    if (!live.length) return;
    zTop.current += live.length;
    let z = zTop.current;
    setNodes((list) => list.map((n) => {
      if (!ids.includes(n.id)) return n;
      z += 1;
      return { ...n, hidden: false, z };
    }));
    const minX = Math.min(...live.map((n) => n.x));
    const minY = Math.min(...live.map((n) => n.y));
    const maxX = Math.max(...live.map((n) => n.x + n.w));
    const maxY = Math.max(...live.map((n) => n.y + n.h));
    const bw = Math.max(120, maxX - minX);
    const bh = Math.max(80, maxY - minY);
    const pad = 64;
    const nextZoom = Math.min(1.15, Math.max(0.45, Math.min(viewport.width / (bw + pad * 2), viewport.height / (bh + pad * 2))));
    setZoom(nextZoom);
    setPan({
      x: viewport.width / 2 - (minX + bw / 2) * nextZoom,
      y: viewport.height / 2 - (minY + bh / 2) * nextZoom,
    });
  }, []);

  const restoreEntry = useCallback((entryId: string, viewport?: { width: number; height: number }) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    let id: string | null = null;
    if (entry.result === "text" || !entry.appId) {
      id = spawnText(entry.query, LOG_ID);
    } else {
      id = openApp(entry.appId, { parentId: LOG_ID, query: entry.query });
    }
    if (!id) return;
    const restored = id;
    setEntries((list) => list.map((e) => (e.id === entryId ? { ...e, targetIds: [restored] } : e)));
    setSelectedEntryId(entryId);
    if (viewport) {
      window.setTimeout(() => focusTargets([restored], viewport), 0);
    }
  }, [entries, openApp, spawnText, focusTargets]);

  const move = useCallback((id: string, x: number, y: number) => {
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  const resize = useCallback((id: string, w: number, h: number) => {
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, w: Math.max(240, w), h: Math.max(120, h), autoSize: false } : n)));
  }, []);

  const fit = useCallback((id: string, w: number, h: number) => {
    setNodes((list) => list.map((n) => {
      if (n.id !== id || n.autoSize === false) return n;
      const nw = Math.max(240, Math.round(w));
      const nh = Math.max(80, Math.round(h));
      if (Math.abs(n.w - nw) < 2 && Math.abs(n.h - nh) < 2) return n;
      const grown = { ...n, w: nw, h: nh };
      const others = list.filter((o) => o.id !== id && !o.hidden);
      const overlaps = others.some((o) => hits(
        { x: grown.x, y: grown.y, w: nw, h: nh },
        boxOf(o),
      ));
      if (!overlaps) return grown;
      const slot = placeBeside(list, nw, nh, id);
      return { ...grown, ...slot };
    }));
  }, []);

  const close = useCallback((id: string) => {
    setNodes((list) => list.filter((n) => n.id !== id));
    setEdges((list) => list.filter((e) => e.from !== id && e.to !== id));
  }, []);

  const hide = useCallback((id: string) => {
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, hidden: true } : n)));
  }, []);

  const show = useCallback((id: string) => {
    bumpZ(id);
  }, [bumpZ]);

  const tile = useCallback((viewport: { width: number; height: number }) => {
    setNodes((list) => {
      const vis = list.filter((n) => !n.hidden);
      if (!vis.length) return list;
      const pad = 16;
      const cols = Math.max(1, Math.ceil(Math.sqrt(vis.length)));
      const rows = Math.ceil(vis.length / cols);
      const cellW = Math.max(280, (viewport.width - pad * (cols + 1)) / cols);
      const cellH = Math.max(180, (viewport.height - pad * (rows + 1)) / rows);
      let i = 0;
      return list.map((n) => {
        if (n.hidden) return n;
        const col = i % cols;
        const row = Math.floor(i / cols);
        i += 1;
        return {
          ...n,
          x: pad + col * (cellW + pad),
          y: pad + row * (cellH + pad),
          w: cellW,
          h: cellH,
          autoSize: false,
        };
      });
    });
  }, []);

  const clear = useCallback(() => {
    setNodes(entries.length ? [logNode()] : []);
    setEdges([]);
    setOverviewOpen(false);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    zTop.current = 10;
  }, [entries.length]);

  const wireEdges = useMemo<WorkspaceEdge[]>(() => {
    const log = nodes.find((n) => n.kind === "log" && !n.hidden);
    const entry = entries.find((e) => e.id === selectedEntryId);
    if (!log || !entry) return [];
    return entry.targetIds
      .filter((id) => nodes.some((n) => n.id === id && !n.hidden))
      .map((to) => ({ from: log.id, to }));
  }, [nodes, entries, selectedEntryId]);

  const value = useMemo<Ctx>(() => ({
    nodes,
    edges: wireEdges,
    entries,
    selectedEntryId,
    setSelectedEntryId,
    pan,
    zoom,
    overviewOpen,
    setOverviewOpen,
    setPan,
    setZoom,
    openApp,
    ask,
    restoreEntry,
    focusTargets,
    focus,
    move,
    resize,
    fit,
    close,
    hide,
    show,
    tile,
    clear,
  }), [nodes, wireEdges, entries, selectedEntryId, pan, zoom, overviewOpen, openApp, ask, restoreEntry, focusTargets, focus, move, resize, fit, close, hide, show, tile, clear]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function appLabel(app: WorkspaceApp) {
  if (app === "projects") return "Projects";
  if (app === "orbit") return "Orbit";
  return APP_LABELS[app as AppId] ?? app;
}

export function entryIsLive(entry: RequestEntry, nodes: WorkspaceNode[]) {
  return entry.targetIds.some((id) => nodes.some((n) => n.id === id));
}
