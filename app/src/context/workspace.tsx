import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APP_LABELS, can, COMPANIES, hasApp, type AppId, type Session } from "../lib/auth";
import { classifyFile, openingMessage } from "../lib/intake";
import { useSession } from "./session";

export type NodeKind = "log" | "request" | "app" | "menu" | "denied" | "text" | "note";
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
  confirmApps?: WorkspaceApp[];
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  hidden: boolean;
  autoSize?: boolean;
};

export type WorkspaceEdge = { from: string; to: string; hot?: boolean };

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

const JOB_APPS: WorkspaceApp[] = ["boxouts", "simpleparts", "plyworks"];

function buildWires(nodes: WorkspaceNode[], entries: RequestEntry[], selectedEntryId: string | null): WorkspaceEdge[] {
  const vis = nodes.filter((n) => !n.hidden && n.kind !== "note");
  const live = new Set(vis.map((n) => n.id));
  const apps = vis.filter((n) => n.kind === "app");
  const appBy = (id: WorkspaceApp) => apps.find((n) => n.appId === id);
  const log = vis.find((n) => n.kind === "log");
  const selected = selectedEntryId ? entries.find((e) => e.id === selectedEntryId) : null;
  const hotTargets = new Set(selected?.targetIds ?? []);
  const edges: WorkspaceEdge[] = [];
  const seen = new Set<string>();

  const add = (from: string, to: string, hot = false) => {
    if (from === to || !live.has(from) || !live.has(to)) return;
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, hot });
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
    for (const id of JOB_APPS) {
      const job = appBy(id);
      if (job) add(job.id, projects.id);
    }
  }

  const orbit = appBy("orbit");
  if (orbit) {
    for (const n of apps) {
      if (n.appId && n.appId !== "orbit") add(n.id, orbit.id);
    }
  }

  return edges;
}

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
  addNote: (opts?: { x?: number; y?: number }) => string;
  setNodeBody: (id: string, body: string) => void;
  ask: (query: string) => void;
  ingestFiles: (files: File[]) => void;
  confirmIntake: (nodeId: string, app: WorkspaceApp) => void;
  restoreEntry: (entryId: string, viewport?: { width: number; height: number }) => void;
  focusTargets: (ids: string[], viewport: { width: number; height: number }) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
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
const NOTE_W = 240;
const NOTE_H = 160;

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
  note: NOTE_H,
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
    h: EST_H.log,
    hidden: false,
    autoSize: true,
  };
}

function normalizeNode(n: WorkspaceNode): WorkspaceNode {
  const minW = n.kind === "note" ? 140 : 240;
  return { ...n, autoSize: true, w: Math.max(n.w || minW, minW), h: Math.max(n.h || 80, 80) };
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
    const cleaned = saved.nodes.filter((n) => n.kind !== "request").map(normalizeNode);
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

  const spawnText = useCallback((query: string, parentId: string, opts?: { body?: string; confirmApps?: WorkspaceApp[] }) => {
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
        body: opts?.body ?? CONCIERGE_BODY,
        confirmApps: opts?.confirmApps,
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

  const ingestFiles = useCallback((files: File[]) => {
    const list = Array.from(files).filter(Boolean);
    if (!list.length) return;

    for (const file of list) {
      const verdict = classifyFile(file);
      const query = verdict.fileName;
      const textId = spawnText(query, LOG_ID, {
        body: verdict.message,
        confirmApps: verdict.kind === "confirm" ? verdict.confirmApps : undefined,
      });

      const targetIds = [textId];
      let appId: WorkspaceApp | undefined;
      let result: RequestEntry["result"] = "text";
      let routeLabel = "Concierge";
      let routeWhy = "Answered on the canvas";

      if (verdict.kind === "route") {
        appId = verdict.appId;
        const appTarget = openApp(verdict.appId, { parentId: textId, query });
        if (appTarget) targetIds.push(appTarget);
        result = allowed(session, verdict.appId) ? "app" : "denied";
        routeLabel = WORKSPACE_APPS.find((a) => a.id === verdict.appId)?.label ?? "Concierge";
        routeWhy = verdict.message;
      } else if (verdict.kind === "confirm") {
        routeLabel = "Confirm";
        routeWhy = "Need a confirmation before opening an app";
      } else {
        routeWhy = "File type is not supported yet";
      }

      const entry: RequestEntry = {
        id: uid("e"),
        at: Date.now(),
        query,
        routeLabel,
        routeWhy,
        targetIds,
        appId,
        result,
      };
      setEntries((prev) => [...prev, entry]);
      setSelectedEntryId(entry.id);
    }
  }, [openApp, spawnText, session]);

  const confirmIntake = useCallback((nodeId: string, app: WorkspaceApp) => {
    if (app !== "boxouts" && app !== "simpleparts" && app !== "plyworks") return;
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const query = node.query ?? "";
    const message = openingMessage(app, query);
    const meta = WORKSPACE_APPS.find((a) => a.id === app);

    setNodes((list) => list.map((n) => (
      n.id === nodeId ? { ...n, body: message, confirmApps: undefined } : n
    )));

    const appTarget = openApp(app, { parentId: nodeId, query });
    const result: RequestEntry["result"] = allowed(session, app) ? "app" : "denied";

    setEntries((prev) => prev.map((e) => {
      if (!e.targetIds.includes(nodeId)) return e;
      const targetIds = appTarget && !e.targetIds.includes(appTarget)
        ? [...e.targetIds, appTarget]
        : e.targetIds;
      return {
        ...e,
        appId: app,
        result,
        routeLabel: meta?.label ?? e.routeLabel,
        routeWhy: message,
        targetIds,
      };
    }));
  }, [openApp, session]);

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

  const addNote = useCallback((opts?: { x?: number; y?: number }) => {
    const id = uid("n");
    zTop.current += 1;
    setNodes((list) => {
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
        z: zTop.current,
        w: NOTE_W,
        h: NOTE_H,
        hidden: false,
        autoSize: true,
      };
      return [...list, note];
    });
    return id;
  }, []);

  const setNodeBody = useCallback((id: string, body: string) => {
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, body } : n)));
  }, []);

  const fit = useCallback((id: string, w: number, h: number) => {
    setNodes((list) => list.map((n) => {
      if (n.id !== id || n.autoSize === false) return n;
      const minW = n.kind === "note" ? 140 : 240;
      const nw = Math.max(minW, Math.round(w));
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
        return p ? { ...n, x: p.x, y: p.y } : n;
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

  const wireEdges = useMemo(
    () => buildWires(nodes, entries, selectedEntryId),
    [nodes, entries, selectedEntryId],
  );

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
    addNote,
    setNodeBody,
    ask,
    ingestFiles,
    confirmIntake,
    restoreEntry,
    focusTargets,
    focus,
    move,
    fit,
    close,
    hide,
    show,
    tile,
    clear,
  }), [nodes, wireEdges, entries, selectedEntryId, pan, zoom, overviewOpen, openApp, addNote, setNodeBody, ask, ingestFiles, confirmIntake, restoreEntry, focusTargets, focus, move, fit, close, hide, show, tile, clear]);

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
