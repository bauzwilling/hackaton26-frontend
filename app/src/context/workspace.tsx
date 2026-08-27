import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APP_LABELS, can, COMPANIES, hasApp, type AppId, type Session } from "../lib/auth";
import { askConcierge, type ConciergeResult } from "../lib/concierge";
import { classifyFile, openingMessage } from "../lib/intake";
import { matchApp } from "../lib/routing";
import { useSession } from "./session";

export type NodeKind = "log" | "request" | "app" | "menu" | "denied" | "text" | "note";
export type WorkspaceApp = "boxouts" | "simpleparts" | "plyworks" | "projects" | "orbit" | "admin";

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
  /** Concierge only: keep me stacked under the request log until the user drags me off. */
  railed?: boolean;
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
  reply?: string;
  confirmApps?: WorkspaceApp[];
  pending?: boolean;
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
      if (n.appId && n.appId !== "orbit" && n.appId !== "admin") add(n.id, orbit.id);
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
  confirmIntake: (entryId: string, app: WorkspaceApp) => void;
  restoreEntry: (entryId: string, viewport?: { width: number; height: number }) => void;
  focusTargets: (ids: string[], viewport: { width: number; height: number }) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  fit: (id: string, w: number, h: number) => void;
  close: (id: string) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  tile: (viewport: { width: number; height: number }) => void;
  clear: (opts?: { transcript?: boolean }) => void;
  clearTranscript: () => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export const LOG_ID = "request-log";
export const CONCIERGE_ID = "concierge";
const RAIL_X = 20;
const RAIL_W = 340;
const LOG_W = 340;
const APP_W = 960;
const NOTE_W = 240;
const NOTE_H = 160;

export const WORKSPACE_APPS: { id: WorkspaceApp; label: string; licensed?: AppId; perm?: string }[] = [
  { id: "boxouts", label: "Door Box Out", licensed: "boxouts" },
  { id: "simpleparts", label: "Simple Parts", licensed: "simpleparts" },
  { id: "plyworks", label: "Plyworks", licensed: "plyworks" },
  { id: "projects", label: "Projects" },
  { id: "orbit", label: "Orbit", perm: "orbit" },
  { id: "admin", label: "Admin console", perm: "users" },
];

export function isWorkspaceApp(v: string): v is WorkspaceApp {
  return WORKSPACE_APPS.some((a) => a.id === v);
}

// WAITING DATABASE: canvas layout on the user profile
function persistKey(email: string) {
  return `f2f.workspace.${email || "anon"}`;
}

// WAITING DATABASE: request log on the user profile
function requestsKey(email: string) {
  return `f2f.requests.${email || "anon"}`;
}

function loadPersist(email: string): Persist | null {
  try {
    const raw = localStorage.getItem(persistKey(email));
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
    if (!Array.isArray(data)) return [];
    return data.map(migrateEntry);
  } catch {
    return [];
  }
}

function migrateEntry(e: RequestEntry): RequestEntry {
  const mapped = (e.targetIds ?? []).map((id) => (id.startsWith("t-") ? CONCIERGE_ID : id));
  const seen = new Set<string>();
  const targetIds = mapped.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if ((e.result === "text" || !e.appId) && !targetIds.includes(CONCIERGE_ID)) {
    targetIds.unshift(CONCIERGE_ID);
  }
  return {
    ...e,
    targetIds,
    reply: e.pending ? "The request was interrupted. Try again." : (e.reply ?? e.routeWhy),
    pending: false,
  };
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

function licensedApps(session: Session | null): WorkspaceApp[] {
  return WORKSPACE_APPS.filter((a) => allowed(session, a.id)).map((a) => a.id);
}

function restrictedApps(session: Session | null): WorkspaceApp[] {
  return WORKSPACE_APPS.filter((a) => !allowed(session, a.id)).map((a) => a.id);
}

function denyCopy(session: Session | null, app: WorkspaceApp) {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  const label = meta?.label ?? app;
  if (meta?.licensed && !hasApp(session, meta.licensed)) {
    return {
      title: `${label} — not licensed`,
      body: session
        ? `${label} is not on ${COMPANIES[session.company].name}'s plan.`
        : `${label} is not available.`,
    };
  }
  const body =
    app === "orbit"
      ? "CNC Orbit is only available to operators."
      : app === "admin"
        ? "The Admin console is only available to operators."
        : `You do not have permission to open ${label}.`;
  return { title: `${label} — no access`, body };
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
  const label = n.appId ? WORKSPACE_APPS.find((a) => a.id === n.appId)?.label : undefined;
  return {
    ...n,
    title: n.kind === "app" && label ? label : n.title,
    autoSize: true,
    w: Math.max(n.w || minW, minW),
    h: Math.max(n.h || 80, 80),
  };
}

function conciergeNode(): WorkspaceNode {
  return {
    id: CONCIERGE_ID,
    kind: "text",
    title: "Concierge",
    code: "F2F",
    parentId: LOG_ID,
    x: RAIL_X,
    y: 20,
    z: 9,
    w: RAIL_W,
    h: EST_H.text,
    hidden: false,
    autoSize: true,
    railed: true,
  };
}

/** Hugs the log's measured height; before the first fit, h is still the estimate. */
function railY(log: WorkspaceNode) {
  return log.y + log.h + GAP;
}

/** Pull the concierge back under the log after either one is resized or the log is moved. */
function restack(list: WorkspaceNode[]): WorkspaceNode[] {
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
function withRail(list: WorkspaceNode[]): WorkspaceNode[] {
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
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
  const entriesRef = useRef<RequestEntry[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  useEffect(() => {
    const saved = loadPersist(email) ?? emptyPersist();
    skipSave.current += 1;
    const cleaned = saved.nodes
      .filter((n) => n.kind !== "request" && (n.kind !== "text" || n.id === CONCIERGE_ID))
      .map(normalizeNode);
    setNodes(cleaned);
    setEdges(saved.edges);
    setPan(saved.pan ?? { x: 0, y: 0 });
    setZoom(saved.zoom ?? 1);
    zTop.current = saved.zTop ?? 10;
  }, [email]);

  useEffect(() => {
    skipEntries.current += 1;
    const loaded = loadEntries(email);
    setEntries(loaded);
    if (loaded.length) {
      setNodes((list) => withRail(list));
    }
  }, [email]);

  useEffect(() => {
    if (skipSave.current > 0) {
      skipSave.current -= 1;
      return;
    }
    const data: Persist = { nodes, edges, pan, zoom, zTop: zTop.current };
    try {
      localStorage.setItem(persistKey(email), JSON.stringify(data));
    } catch { /* ignore */ }
  }, [email, nodes, edges, pan, zoom]);

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
      const copy = denyCopy(session, app);
      const denied: WorkspaceNode = {
        id,
        kind: "denied",
        title: copy.title,
        code: `LIC-${Math.floor(1000 + Math.random() * 9000)}`,
        appId: app,
        query: opts?.query,
        parentId: opts?.parentId,
        body: copy.body,
        x: RAIL_X,
        y: 20,
        z: zTop.current,
        w: RAIL_W,
        h: 1,
        hidden: false,
        autoSize: true,
      };
      setNodes((list) => {
        const base = withRail(list);
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
      const base = withRail(list);
      const current = base.find((n) => n.kind === "app" && n.appId === app);
      if (current) {
        return base.map((n) => (n.id === current.id ? { ...n, z, hidden: false, title: meta.label, parentId: opts?.parentId ?? n.parentId, query: opts?.query ?? n.query } : n));
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

  const ensureConcierge = useCallback(() => {
    zTop.current += 1;
    const z = zTop.current;
    setNodes((list) => withRail(list).map((n) => (
      n.id === CONCIERGE_ID ? { ...n, z, hidden: false, parentId: n.parentId ?? LOG_ID } : n
    )));
    return CONCIERGE_ID;
  }, []);

  const ask = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const conciergeId = ensureConcierge();
    const entryId = uid("e");
    const history = entriesRef.current
      .filter((e) => !e.pending && e.reply)
      .slice(-8)
      .flatMap((e) => [
        { role: "user" as const, content: e.query },
        { role: "assistant" as const, content: e.reply as string },
      ]);
    const apps = licensedApps(session);
    const restricted = restrictedApps(session);

    setEntries((list) => [...list, {
      id: entryId,
      at: Date.now(),
      query: q,
      routeLabel: "Concierge",
      routeWhy: "Answered on the canvas",
      targetIds: [conciergeId],
      result: "text",
      reply: "Thinking…",
      pending: true,
    }]);
    setSelectedEntryId(entryId);

    void (async () => {
      /** Applies a reply plus its routing decision, whoever made that decision. */
      const settle = (result: ConciergeResult) => {
        const appId = result.app && isWorkspaceApp(result.app) ? result.app : undefined;
        const targetIds: string[] = [conciergeId];
        let status: RequestEntry["result"] = "text";
        let routeLabel = "Concierge";
        let routeWhy = "Answered on the canvas";

        if (appId) {
          // WAITING BFF: the reply opens a window directly. The master plan is a
          // SuggestedAction the user accepts, which the BFF validates before anything
          // runs. Replace this block, not the transport, when actions arrive.
          const ok = allowed(session, appId);
          status = ok ? "app" : "denied";
          routeLabel = WORKSPACE_APPS.find((a) => a.id === appId)?.label ?? "Concierge";
          routeWhy = result.reply;
          const appTarget = openApp(appId, { parentId: conciergeId, query: q });
          if (appTarget) targetIds.push(appTarget);
        }

        setEntries((list) => list.map((e) => (e.id === entryId ? {
          ...e,
          appId,
          result: status,
          routeLabel,
          routeWhy,
          reply: result.reply,
          targetIds,
          pending: false,
        } : e)));
      };

      try {
        settle(await askConcierge(q, history, apps, restricted));
      } catch {
        // No assistant reachable: fall back to a local name match so the board stays usable.
        const guess = matchApp(q);
        const appId = guess && isWorkspaceApp(guess) ? guess : null;
        settle({
          app: appId,
          reply: appId
            ? `Opening ${appLabel(appId)} for you.`
            : `I can open ${apps.map(appLabel).join(", ")}. Name one, or drop a file and I'll route it.`,
        });
      }
    })();
  }, [openApp, ensureConcierge, session]);

  const ingestFiles = useCallback((files: File[]) => {
    const list = Array.from(files).filter(Boolean);
    if (!list.length) return;
    const conciergeId = ensureConcierge();

    for (const file of list) {
      // WAITING MODEL: the UI decides the job from the file here. The model does that,
      // after the file is uploaded as an artifact and inspected by the BFF.
      const verdict = classifyFile(file);
      const query = verdict.fileName;
      const targetIds: string[] = [conciergeId];
      let appId: WorkspaceApp | undefined;
      let result: RequestEntry["result"] = "text";
      let routeLabel = "Concierge";
      let routeWhy = "Answered on the canvas";
      let confirmApps: WorkspaceApp[] | undefined;

      if (verdict.kind === "route") {
        appId = verdict.appId;
        const appTarget = openApp(verdict.appId, { parentId: conciergeId, query });
        if (appTarget) targetIds.push(appTarget);
        result = allowed(session, verdict.appId) ? "app" : "denied";
        routeLabel = WORKSPACE_APPS.find((a) => a.id === verdict.appId)?.label ?? "Concierge";
        routeWhy = verdict.message;
      } else if (verdict.kind === "confirm") {
        routeLabel = "Confirm";
        routeWhy = "Need a confirmation before opening an app";
        confirmApps = verdict.confirmApps;
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
        reply: verdict.message,
        confirmApps,
      };
      setEntries((prev) => [...prev, entry]);
      setSelectedEntryId(entry.id);
    }
  }, [openApp, ensureConcierge, session]);

  const confirmIntake = useCallback((entryId: string, app: WorkspaceApp) => {
    if (app !== "boxouts" && app !== "simpleparts" && app !== "plyworks") return;
    const entry = entriesRef.current.find((e) => e.id === entryId);
    if (!entry) return;
    const query = entry.query;
    const message = openingMessage(app, query);
    const meta = WORKSPACE_APPS.find((a) => a.id === app);
    const conciergeId = ensureConcierge();
    const appTarget = openApp(app, { parentId: conciergeId, query });
    const result: RequestEntry["result"] = allowed(session, app) ? "app" : "denied";

    setEntries((prev) => prev.map((e) => {
      if (e.id !== entryId) return e;
      const targetIds = appTarget && !e.targetIds.includes(appTarget)
        ? [...e.targetIds, appTarget]
        : e.targetIds;
      return {
        ...e,
        appId: app,
        result,
        routeLabel: meta?.label ?? e.routeLabel,
        routeWhy: message,
        reply: message,
        confirmApps: undefined,
        targetIds,
      };
    }));
  }, [openApp, ensureConcierge, session]);

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
    const conciergeId = ensureConcierge();
    const targetIds: string[] = [conciergeId];
    if (entry.appId && entry.result !== "text") {
      const appTarget = openApp(entry.appId, { parentId: conciergeId, query: entry.query });
      if (appTarget) targetIds.push(appTarget);
    }
    const appTarget = targetIds.find((id) => id !== conciergeId);
    setEntries((list) => list.map((e) => {
      if (e.id === entryId) return { ...e, targetIds };
      if (entry.result === "app" && e.result === "app" && e.appId && e.appId === entry.appId && appTarget) {
        const next: string[] = e.targetIds.filter((id) => id === CONCIERGE_ID);
        if (!next.includes(CONCIERGE_ID)) next.unshift(conciergeId);
        if (!next.includes(appTarget)) next.push(appTarget);
        return { ...e, targetIds: next };
      }
      return e;
    }));
    setSelectedEntryId(entryId);
    if (viewport) {
      window.setTimeout(() => focusTargets(targetIds, viewport), 0);
    }
  }, [entries, openApp, ensureConcierge, focusTargets]);

  const move = useCallback((id: string, x: number, y: number) => {
    setNodes((list) => restack(list.map((n) => {
      if (n.id !== id) return n;
      return n.id === CONCIERGE_ID ? { ...n, x, y, railed: false } : { ...n, x, y };
    })));
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
    setNodes((list) => restack(list.map((n) => {
      if (n.id !== id || n.autoSize === false) return n;
      const minW = n.kind === "note" ? 140 : 240;
      const nw = Math.max(minW, Math.round(w));
      const nh = Math.max(80, Math.round(h));
      if (Math.abs(n.w - nw) < 2 && Math.abs(n.h - nh) < 2) return n;
      return { ...n, w: nw, h: nh };
    })));
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
        if (!p) return n;
        return n.id === CONCIERGE_ID ? { ...n, x: p.x, y: p.y, railed: false } : { ...n, x: p.x, y: p.y };
      });
    });
  }, []);

  const clearTranscript = useCallback(() => {
    setEntries([]);
    setSelectedEntryId(null);
  }, []);

  const clear = useCallback((opts?: { transcript?: boolean }) => {
    if (opts?.transcript) {
      setEntries([]);
      setSelectedEntryId(null);
      setNodes([]);
    } else {
      setNodes((list) => list.filter((n) => n.kind === "log" || n.id === CONCIERGE_ID));
    }
    setEdges([]);
    setOverviewOpen(false);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    zTop.current = 10;
  }, []);

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
    clearTranscript,
  }), [nodes, wireEdges, entries, selectedEntryId, pan, zoom, overviewOpen, openApp, addNote, setNodeBody, ask, ingestFiles, confirmIntake, restoreEntry, focusTargets, focus, move, fit, close, hide, show, tile, clear, clearTranscript]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function appLabel(app: WorkspaceApp) {
  if (app === "boxouts") return "Door Box Out";
  if (app === "projects") return "Projects";
  if (app === "orbit") return "Orbit";
  if (app === "admin") return "Admin console";
  return APP_LABELS[app as AppId] ?? app;
}

/**
 * Did this ask successfully open an app? The request log records only those.
 * Plain answers and refusals ("no access", unsupported file) belong in the
 * concierge transcript, not in the record of what is on the board.
 */
export function entryOpenedApp(entry: RequestEntry) {
  return entry.result === "app" && entry.targetIds.some((id) => id !== CONCIERGE_ID);
}

/** Name of the window this ask put on the board — never the user's phrasing. */
export function entryWindowName(entry: RequestEntry, nodes: WorkspaceNode[]) {
  if (entry.appId) return appLabel(entry.appId);
  const id = entry.targetIds.find((tid) => tid !== CONCIERGE_ID);
  const node = id ? nodes.find((n) => n.id === id) : undefined;
  if (node?.appId) return appLabel(node.appId);
  return node?.title || entry.routeLabel;
}

export function entryIsLive(entry: RequestEntry, nodes: WorkspaceNode[]) {
  const ids = entry.result === "app" || entry.result === "denied"
    ? entry.targetIds.filter((id) => id !== CONCIERGE_ID)
    : entry.targetIds;
  return ids.some((id) => nodes.some((n) => n.id === id));
}
