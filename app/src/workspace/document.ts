import { APP_LABELS, can, COMPANIES, hasApp, type AppId, type Session } from "../lib/auth";
import type { ConciergeKind, PlyworksDesign } from "../lib/concierge";
import type { HelpTopicId } from "../lib/help";
import { requestsKey } from "./persist";

export type NodeKind = "log" | "request" | "app" | "menu" | "denied" | "text" | "note";
export type WorkspaceApp = "boxouts" | "simpleparts" | "plyworks" | "plyworks-jw" | "plyworks-nesting" | "projects" | "orbit" | "admin";

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
  design?: PlyworksDesign;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  hidden: boolean;
  autoSize?: boolean;
  locked?: boolean;
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
  /** Additive intent label from concierge — not used for side effects yet. */
  kind?: ConciergeKind;
  confirmApps?: WorkspaceApp[];
  design?: PlyworksDesign;
  choices?: PlyworksDesign[];
  helpTopics?: HelpTopicId[];
  pending?: boolean;
};

export const JOB_APPS: WorkspaceApp[] = ["boxouts", "simpleparts", "plyworks"];

export const LOG_ID = "request-log";
export const CONCIERGE_ID = "concierge";

export const RAIL_X = 20;
export const RAIL_W = 340;
export const LOG_W = 340;
export const APP_W = 1760;
export const IFRAME_H = 1040;
export const JW_SIZE = 1040;
export const NOTE_W = 240;
export const NOTE_H = 160;
export const FLASH_MS = 700;
export const GAP = 24;

export const EST_H: Record<NodeKind, number> = {
  log: 280,
  app: 640,
  text: 200,
  denied: 160,
  request: 160,
  menu: 200,
  note: NOTE_H,
};

export function canDeleteNode(n: Pick<WorkspaceNode, "kind" | "id">) {
  return n.kind === "app";
}

export function canDuplicateNode(n: Pick<WorkspaceNode, "kind" | "id">) {
  return n.kind === "app" || n.kind === "note";
}

export function isFixedSizeApp(app?: WorkspaceApp): boolean {
  return app === "boxouts" || app === "simpleparts" || app === "plyworks" || app === "plyworks-jw" || app === "plyworks-nesting";
}

export function appBox(app?: WorkspaceApp): { w: number; h: number } {
  if (app === "plyworks-jw") return { w: JW_SIZE, h: JW_SIZE };
  return { w: APP_W, h: IFRAME_H };
}

export const WORKSPACE_APPS: { id: WorkspaceApp; label: string; licensed?: AppId; perm?: string; ready?: boolean }[] = [
  { id: "boxouts", label: "Door Box Out", licensed: "boxouts" },
  { id: "simpleparts", label: "Simple Parts", licensed: "simpleparts" },
  { id: "plyworks", label: "Plyworks", licensed: "plyworks" },
  { id: "plyworks-jw", label: "Plyworks JointWiz", licensed: "plyworks" },
  { id: "plyworks-nesting", label: "Plyworks nesting", licensed: "plyworks" },
  { id: "projects", label: "Projects" },
  { id: "orbit", label: "Orbit", perm: "orbit" },
  { id: "admin", label: "Admin console", perm: "users", ready: false },
];

export function isWorkspaceApp(v: string): v is WorkspaceApp {
  return WORKSPACE_APPS.some((a) => a.id === v);
}

export function appLabel(app: WorkspaceApp) {
  if (app === "boxouts") return "Door Box Out";
  if (app === "plyworks-jw") return "Plyworks JointWiz";
  if (app === "plyworks-nesting") return "Plyworks nesting";
  if (app === "projects") return "Projects";
  if (app === "orbit") return "Orbit";
  if (app === "admin") return "Admin console";
  return APP_LABELS[app as AppId] ?? app;
}

export function allowed(session: Session | null, app: WorkspaceApp) {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  if (!meta) return false;
  if (meta.licensed && !hasApp(session, meta.licensed)) return false;
  if (meta.perm && !can(session, meta.perm)) return false;
  return true;
}

/** License and role are not enough — an unbuilt app still must not open a window. */
export function openable(session: Session | null, app: WorkspaceApp) {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  if (!meta || meta.ready === false) return false;
  return allowed(session, app);
}

export function licensedApps(session: Session | null): WorkspaceApp[] {
  return WORKSPACE_APPS.filter((a) => a.id !== "plyworks-nesting" && a.id !== "plyworks-jw" && openable(session, a.id)).map((a) => a.id);
}

export function restrictedApps(session: Session | null): WorkspaceApp[] {
  return WORKSPACE_APPS.filter((a) => !openable(session, a.id)).map((a) => a.id);
}

export function denyCopy(session: Session | null, app: WorkspaceApp) {
  const meta = WORKSPACE_APPS.find((a) => a.id === app);
  const label = meta?.label ?? app;
  if (meta?.ready === false) {
    return { title: `${label} — not available`, body: `${label} is not available yet.` };
  }
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

export function logNode(): WorkspaceNode {
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

export function conciergeNode(): WorkspaceNode {
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

export function normalizeNode(n: WorkspaceNode): WorkspaceNode {
  const minW = n.kind === "note" ? 140 : 240;
  const label = n.appId ? WORKSPACE_APPS.find((a) => a.id === n.appId)?.label : undefined;
  const iframe = isFixedSizeApp(n.appId);
  const box = appBox(n.appId);
  const square = n.appId === "plyworks-jw";
  return {
    ...n,
    title: n.kind === "app" && label ? label : n.title,
    autoSize: iframe ? false : true,
    w: iframe ? (square ? box.w : Math.max(n.w || box.w, box.w)) : Math.max(n.w || minW, minW),
    h: iframe ? (square ? box.h : Math.max(n.h || box.h, box.h)) : Math.max(n.h || 80, 80),
  };
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

export function loadEntries(email: string): RequestEntry[] {
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
  const id = entry.targetIds.find((tid) => tid !== CONCIERGE_ID);
  const node = id ? nodes.find((n) => n.id === id) : undefined;
  const label = entry.appId
    ? appLabel(entry.appId)
    : node?.appId
      ? appLabel(node.appId)
      : (node?.title || entry.routeLabel);
  return node?.code ? `${label} · ${node.code}` : label;
}

export function entryIsLive(entry: RequestEntry, nodes: WorkspaceNode[]) {
  const ids = entry.result === "app" || entry.result === "denied"
    ? entry.targetIds.filter((id) => id !== CONCIERGE_ID)
    : entry.targetIds;
  return ids.some((id) => nodes.some((n) => n.id === id));
}
