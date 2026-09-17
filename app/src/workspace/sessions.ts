import {
  CONCIERGE_ID,
  WORKSPACE_APPS,
  isActivityEntry,
  loadEntries,
  migrateEntry,
  normalizeNode,
  type RequestEntry,
  type WorkspaceApp,
  type WorkspaceNode,
} from "./document";
import {
  emptyPersist,
  loadWorkspacePersist,
  type WorkspacePersist,
} from "./persist";
import { uid } from "./commands";

export const NEW_CHAT_TITLE = "New chat";
export const MAX_STORED_CHATS = 10;
export const CHAT_THREAD_W = 340;
export const CHAT_SIDEBAR_W = 220;
export const CHAT_RAIL_W = 32;
/** Hero texts + bar + chips leave the way they do on sign-out. */
export const HERO_LEAVE_MS = 720;
/** Fade chat/sidebar copy before a coupled width morph. */
export const PAIR_FADE_MS = 100;
/** Chat width and sidebar width morph together after the fade. */
export const PAIR_SHAPE_MS = 100;
/** Park on a spinner before the thread lands. */
export const SESSION_SPIN_MS = 1000;
/** After the thread is up, wait for the dock morph before the first window. */
export const SESSION_APP_AFTER_CHAT_MS = 500;
/** Gap between windows so they stack instead of popping as a group. */
export const SESSION_APP_STAGGER_MS = 140;

export type ChatSession = {
  id: string;
  title: string;
  titleLocked: boolean;
  createdAt: number;
  updatedAt: number;
  entries: RequestEntry[];
  board: WorkspacePersist;
  /** Apps this session opened — cheap resume hint for a later thread API. */
  openedAppIds: WorkspaceApp[];
  /** An order freezes this thread; further work starts in a new chat. */
  orderedJobId?: string;
  orderedAt?: number;
};

export type SessionStore = {
  activeId: string;
  sessions: ChatSession[];
  historyCollapsed: boolean;
};

// WAITING DATABASE: chat.sessions — list + active id on the user profile (local MAX_STORED_CHATS stand-in)
export function sessionsKey(email: string) {
  return `f2f.sessions.${email || "anon"}`;
}

export function dockedChatWidth(historyCollapsed: boolean) {
  return (historyCollapsed ? CHAT_RAIL_W : CHAT_SIDEBAR_W) + CHAT_THREAD_W;
}

/**
 * Fit-view gutters around a window so it sits in the leftover next to docked chat.
 * Top matches `.studio-chat-slot.is-docked` padding so a maximized window lines up with the chat card.
 */
export const STAGE_FIT_PAD = { top: 16, right: 16, bottom: 56 } as const;

export function chatFitPadding(
  hostWidth: number,
  docked: boolean,
  historyCollapsed: boolean,
) {
  const chatW = dockedChatWidth(historyCollapsed);
  const left = docked
    ? Math.min(chatW, Math.max(0, hostWidth - 32)) + 32
    : 16;
  return {
    top: `${STAGE_FIT_PAD.top}px` as `${number}px`,
    right: `${STAGE_FIT_PAD.right}px` as `${number}px`,
    bottom: `${STAGE_FIT_PAD.bottom}px` as `${number}px`,
    left: `${left}px` as `${number}px`,
  };
}

/** Leftover canvas beside collapsed sidebar+chat. Size is screen pixels (= world at zoom 1); x/y is that slot in current viewport. */
export function leftoverCanvas(
  host: { width: number; height: number },
  viewport: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1 },
) {
  const pad = chatFitPadding(host.width, true, true);
  const left = Number.parseInt(pad.left, 10) || 0;
  const zoom = viewport.zoom || 1;
  return {
    x: (left - (viewport.x ?? 0)) / zoom,
    y: (STAGE_FIT_PAD.top - (viewport.y ?? 0)) / zoom,
    w: Math.max(320, Math.round(host.width - left - STAGE_FIT_PAD.right)),
    h: Math.max(240, Math.round(host.height - STAGE_FIT_PAD.top - STAGE_FIT_PAD.bottom)),
  };
}

export function pastSessions(sessions: ChatSession[]) {
  return sessions.filter((s) => !sessionIsEmpty(s)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Keep the active session and at most MAX_STORED_CHATS non-empty chats (newest first). */
export function capStoredSessions(sessions: ChatSession[], activeId: string): ChatSession[] {
  const nonempty = sessions
    .filter((s) => !sessionIsEmpty(s))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const keepNonempty = new Set<string>();
  if (sessions.some((s) => s.id === activeId && !sessionIsEmpty(s))) {
    keepNonempty.add(activeId);
  }
  for (const s of nonempty) {
    if (keepNonempty.has(s.id)) continue;
    if (keepNonempty.size >= MAX_STORED_CHATS) break;
    keepNonempty.add(s.id);
  }
  return sessions.filter((s) => keepNonempty.has(s.id) || s.id === activeId);
}

export function cleanBoardNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes
    .filter((n) => n.kind !== "request" && n.kind !== "denied" && n.kind !== "log" && (n.kind !== "text" || n.id === CONCIERGE_ID))
    .filter((n) => {
      if (n.kind !== "app" || !n.appId) return true;
      const meta = WORKSPACE_APPS.find((a) => a.id === n.appId);
      return meta?.ready !== false;
    })
    .map((n) => {
      const next = normalizeNode(n);
      return next.id === CONCIERGE_ID ? { ...next, hidden: true } : next;
    });
}

export function openedAppIdsFrom(nodes: WorkspaceNode[], entries: RequestEntry[]): WorkspaceApp[] {
  const ids = new Set<WorkspaceApp>();
  for (const n of nodes) {
    if (n.kind === "app" && n.appId) ids.add(n.appId);
  }
  for (const e of entries) {
    if (e.appId) ids.add(e.appId);
  }
  return [...ids];
}

// WAITING MODEL: session title from the turn, not a filename heuristic
export function suggestTitle(entries: RequestEntry[]): string | null {
  const first = entries.find((e) => !isActivityEntry(e) && e.query.trim());
  if (!first) return null;
  const t = first.query.trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 40)}…` : t;
}

export function sessionIsEmpty(session: ChatSession) {
  const windows = session.board.nodes.some((n) => (
    n.id !== CONCIERGE_ID && n.kind !== "log" && n.appId !== "jobs"
  ));
  return !windows && session.entries.length === 0;
}

export function sessionIsOrdered(session: ChatSession | null | undefined) {
  return Boolean(session?.orderedJobId);
}

export function emptySession(now = Date.now()): ChatSession {
  return {
    id: uid("s"),
    title: NEW_CHAT_TITLE,
    titleLocked: false,
    createdAt: now,
    updatedAt: now,
    entries: [],
    board: emptyPersist(),
    openedAppIds: [],
  };
}

export function snapshotSession(
  prev: ChatSession,
  live: { nodes: WorkspaceNode[]; userEdges: WorkspacePersist["userEdges"]; viewport: WorkspacePersist["viewport"]; zTop: number; entries: RequestEntry[] },
): ChatSession {
  const entries = live.entries.map(migrateEntry);
  const suggested = prev.titleLocked ? null : suggestTitle(entries);
  return {
    ...prev,
    title: suggested ?? prev.title,
    updatedAt: Date.now(),
    entries,
    board: {
      nodes: live.nodes,
      userEdges: live.userEdges,
      viewport: live.viewport,
      zTop: live.zTop,
    },
    openedAppIds: openedAppIdsFrom(live.nodes, entries),
  };
}

function migrateLegacy(email: string): SessionStore | null {
  const board = loadWorkspacePersist(email);
  const entries = loadEntries(email).map(migrateEntry);
  const nodes = board?.nodes ?? [];
  const hasBoard = nodes.some((n) => n.id !== CONCIERGE_ID && n.kind !== "log");
  if (!board && !entries.length) return null;
  if (!hasBoard && !entries.length) return null;
  const now = Date.now();
  const session: ChatSession = {
    id: uid("s"),
    title: suggestTitle(entries) ?? NEW_CHAT_TITLE,
    titleLocked: false,
    createdAt: entries[0]?.at ?? now,
    updatedAt: entries[entries.length - 1]?.at ?? now,
    entries,
    board: board ?? emptyPersist(),
    openedAppIds: openedAppIdsFrom(nodes, entries),
  };
  return { activeId: session.id, sessions: [session], historyCollapsed: false };
}

function parseStore(raw: unknown): SessionStore | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as SessionStore;
  if (!Array.isArray(data.sessions) || typeof data.activeId !== "string") return null;
  const sessions = data.sessions
    .filter((s) => s && typeof s.id === "string")
    .map((s) => ({
      ...s,
      title: s.title || NEW_CHAT_TITLE,
      titleLocked: !!s.titleLocked,
      createdAt: s.createdAt ?? Date.now(),
      updatedAt: s.updatedAt ?? Date.now(),
      entries: (s.entries ?? []).map(migrateEntry),
      board: s.board && Array.isArray(s.board.nodes) ? s.board : emptyPersist(),
      openedAppIds: Array.isArray(s.openedAppIds) ? s.openedAppIds : openedAppIdsFrom(s.board?.nodes ?? [], s.entries ?? []),
    }));
  if (!sessions.length) return null;
  const activeId = sessions.some((s) => s.id === data.activeId) ? data.activeId : sessions[0].id;
  const capped = capStoredSessions(sessions, activeId);
  const nextActive = capped.some((s) => s.id === activeId) ? activeId : capped[0].id;
  return { activeId: nextActive, sessions: capped, historyCollapsed: !!data.historyCollapsed };
}

// WAITING BFF: thread payload shape (session id, title, entries, board snapshot)
export function loadSessionStore(email: string): SessionStore {
  try {
    const raw = localStorage.getItem(sessionsKey(email));
    if (raw) {
      const parsed = parseStore(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch { /* fall through to legacy */ }
  const legacy = migrateLegacy(email);
  if (legacy) return legacy;
  const fresh = emptySession();
  return { activeId: fresh.id, sessions: [fresh], historyCollapsed: false };
}

export function saveSessionStore(email: string, store: SessionStore) {
  try {
    const capped = {
      ...store,
      sessions: capStoredSessions(store.sessions, store.activeId),
    };
    localStorage.setItem(sessionsKey(email), JSON.stringify(capped));
  } catch { /* ignore */ }
}

export function relativeSessionTime(at: number) {
  const d = Date.now() - at;
  if (d < 60_000) return "Just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d`;
  return new Date(at).toLocaleDateString();
}
