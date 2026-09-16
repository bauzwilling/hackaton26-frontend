import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FIT_ZOOM_MAX, ZOOM_MIN, ZOOM_MAX } from "../canvas/flow/constants";
import { askConcierge, inferConciergeKind, type ConciergeResult, type PlyworksDesign } from "../lib/concierge";
import {
  applyPlyworksSessionOps,
  setActivePlyworksSession,
  snapshotPlyworksBoards,
} from "../lib/plyworksSession";
import type { PlyworksOp } from "../lib/plyworksOps";
import { classifyFile } from "../lib/intake";
import { deliverAppChat, setAppChatRelaySink } from "../lib/appChat";
import { matchLocalRoute } from "../lib/routing";
import { plyworksOpening } from "../lib/catalog";
import { tryHelpAsk } from "../lib/help";
import type { ViewportSnapshot } from "../workspace/persist";
import {
  cleanBoardNodes,
  dockedChatWidth,
  emptySession,
  leftoverCanvas,
  loadSessionStore,
  NEW_CHAT_TITLE,
  openedAppIdsFrom,
  saveSessionStore,
  sessionIsEmpty,
  SESSION_APP_AFTER_CHAT_MS,
  SESSION_APP_STAGGER_MS,
  SESSION_SPIN_MS,
  HERO_LEAVE_MS,
  PAIR_FADE_MS,
  PAIR_SHAPE_MS,
  snapshotSession,
  type ChatSession,
} from "../workspace/sessions";
import { topology, type SystemEdge, type UserEdge } from "../workspace/topology";
import {
  CONCIERGE_ID,
  FLASH_MS,
  LOG_ID,
  WORKSPACE_APPS,
  appLabel,
  canDeleteNode,
  canDuplicateNode,
  denyCopy,
  activityClock,
  activityFocusIds,
  activityLine,
  activityName,
  entryIsLive,
  entryOpenedApp,
  entryWindowName,
  isActivityEntry,
  isRelayEntry,
  isWorkspaceApp,
  licensedApps,
  openable,
  restrictedApps,
  type NodeKind,
  type RequestEntry,
  type WorkspaceApp,
  type WorkspaceEdge,
  type WorkspaceNode,
} from "../workspace/document";
import {
  addNoteNodes,
  bumpZNode,
  closeNode,
  commitPositionNodes,
  duplicateNodeCopies,
  ensureConciergeNodes,
  fitNode,
  hideNode,
  openAppNodes,
  setLockedNodes,
  setNodeBodyNodes,
  tileNodes,
  uid,
  unrailConcierge,
} from "../workspace/commands";
import { useSession } from "./session";

export type { SystemEdge, UserEdge, ViewportSnapshot };
export type { NodeKind, WorkspaceApp, WorkspaceNode, WorkspaceEdge, RequestEntry };
export type { ChatSession };
export { CHAT_RAIL_W, CHAT_SIDEBAR_W, CHAT_THREAD_W, HERO_LEAVE_MS, PAIR_FADE_MS, PAIR_SHAPE_MS, chatFitPadding, dockedChatWidth, leftoverCanvas, NEW_CHAT_TITLE, pastSessions, relativeSessionTime, sessionIsEmpty } from "../workspace/sessions";
export {
  ZOOM_MIN,
  ZOOM_MAX,
  LOG_ID,
  CONCIERGE_ID,
  canDeleteNode,
  canDuplicateNode,
  WORKSPACE_APPS,
  isWorkspaceApp,
  appLabel,
  entryOpenedApp,
  entryWindowName,
  entryIsLive,
  isActivityEntry,
  isRelayEntry,
  activityClock,
  activityFocusIds,
  activityLine,
  activityName,
};

export type FitRequest = { ids: string[]; key: number; maxZoom?: number; collapsedGutter?: boolean };

type Ctx = {
  nodes: WorkspaceNode[];
  edges: SystemEdge[];
  userEdges: UserEdge[];
  entries: RequestEntry[];
  selectedEntryId: string | null;
  setSelectedEntryId: (id: string | null) => void;
  viewport: ViewportSnapshot;
  overviewOpen: boolean;
  setOverviewOpen: (v: boolean) => void;
  previewId: string | null;
  setPreviewId: (id: string | null) => void;
  fitRequest: FitRequest | null;
  openApp: (app: WorkspaceApp, opts?: { parentId?: string; query?: string; design?: PlyworksDesign }) => string | null;
  announceOpen: (app: WorkspaceApp, appTarget: string | null) => void;
  addNote: (opts?: { x?: number; y?: number }) => string;
  setNodeBody: (id: string, body: string) => void;
  ask: (query: string) => void;
  ingestFiles: (files: File[]) => void;
  confirmIntake: (entryId: string, app: WorkspaceApp) => void;
  restoreEntry: (entryId: string, viewport?: { width: number; height: number }) => void;
  focusTargets: (ids: string[], viewport?: { width: number; height: number }, opts?: { maxZoom?: number }) => void;
  ensureConcierge: () => string;
  appendConciergeTurn: (query: string, reply: string, extras?: Partial<RequestEntry>) => string;
  focus: (id: string) => void;
  commitPositions: (positions: Record<string, { x: number; y: number }>) => void;
  commitViewport: (viewport: ViewportSnapshot) => void;
  addUserEdge: (edge: UserEdge) => void;
  removeUserEdges: (ids: string[]) => void;
  unrail: (id: string) => void;
  fit: (id: string, w: number, h: number) => void;
  maximize: (id: string) => void;
  dismissMaximize: (force?: boolean) => void;
  maximizedId: string | null;
  commitStageSize: (size: { width: number; height: number }) => void;
  close: (id: string) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  setLocked: (ids: string[], locked: boolean) => void;
  duplicateNodes: (ids: string[]) => string[];
  tile: (viewport: { width: number; height: number }) => void;
  clear: (opts?: { transcript?: boolean }) => void;
  clearTranscript: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  activeSession: ChatSession | null;
  historyCollapsed: boolean;
  setHistoryCollapsed: (collapsed: boolean) => void;
  createSession: () => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  returnToLanding: () => void;
  departLanding: (fn: () => void) => void;
  atLanding: boolean;
  resuming: boolean;
  enteringNodeIds: string[];
  flashIds: string[];
  flashKey: number;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

function plyworksAppNode(nodes: WorkspaceNode[]): WorkspaceNode | undefined {
  return jobAppNode(nodes, "plyworks");
}

function jobAppNode(nodes: WorkspaceNode[], app: WorkspaceApp): WorkspaceNode | undefined {
  const apps = nodes.filter((n) => n.kind === "app" && n.appId === app);
  if (!apps.length) return undefined;
  const visible = apps.filter((n) => !n.hidden);
  const pool = visible.length ? visible : apps;
  return pool.slice().sort((a, b) => b.z - a.z)[0];
}

function designFromOps(ops: PlyworksOp[], fallback: ConciergeResult["design"]): PlyworksDesign {
  const load = ops.find((op) => op.action === "load_design");
  if (load && load.action === "load_design") return load.design;
  return fallback ?? "shelf";
}

function chatCapable(app: WorkspaceApp) {
  return app === "boxouts" || app === "simpleparts";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const email = session?.email ?? "anon";
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [userEdges, setUserEdges] = useState<UserEdge[]>([]);
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportSnapshot>({ x: 0, y: 0, zoom: 1 });
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const [fitRequest, setFitRequest] = useState<FitRequest | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [historyCollapsed, setHistoryCollapsedState] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [atLanding, setAtLanding] = useState(true);
  const [enteringNodeIds, setEnteringNodeIds] = useState<string[]>([]);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const zTop = useRef(10);
  const flashTimer = useRef<number | null>(null);
  const skipSave = useRef(0);
  const resumeLock = useRef(false);
  const revealTimers = useRef<number[]>([]);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const entriesRef = useRef<RequestEntry[]>([]);
  const userEdgesRef = useRef<UserEdge[]>([]);
  const viewportRef = useRef<ViewportSnapshot>(viewport);
  const sessionsRef = useRef<ChatSession[]>([]);
  const activeIdRef = useRef("");
  const collapsedRef = useRef(false);
  const atLandingRef = useRef(true);
  const resumingRef = useRef(false);
  const maximizedIdRef = useRef<string | null>(null);
  const maximizeIgnoreUntil = useRef(0);
  const savedViewport = useRef<ViewportSnapshot | null>(null);
  const stageSizeRef = useRef({ width: 1200, height: 700 });
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { userEdgesRef.current = userEdges; }, [userEdges]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { activeIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => { collapsedRef.current = historyCollapsed; }, [historyCollapsed]);
  useEffect(() => { atLandingRef.current = atLanding; }, [atLanding]);
  useEffect(() => { resumingRef.current = resuming; }, [resuming]);
  useEffect(() => { maximizedIdRef.current = maximizedId; }, [maximizedId]);
  useEffect(() => {
    if (!overviewOpen) setPreviewId(null);
  }, [overviewOpen]);
  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    for (const t of revealTimers.current) window.clearTimeout(t);
  }, []);

  const flushList = useCallback((list: ChatSession[], id: string) => {
    if (!id) return list;
    return list.map((s) =>
      s.id === id
        ? snapshotSession(s, {
            nodes: nodesRef.current,
            userEdges: userEdgesRef.current,
            viewport: viewportRef.current,
            zTop: zTop.current,
            entries: entriesRef.current,
          })
        : s,
    );
  }, []);

  const persistStore = useCallback((next: { sessions: ChatSession[]; activeId: string; historyCollapsed: boolean }) => {
    saveSessionStore(email, next);
  }, [email]);

  const clearReveal = useCallback(() => {
    for (const t of revealTimers.current) window.clearTimeout(t);
    revealTimers.current = [];
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    revealTimers.current.push(window.setTimeout(fn, ms));
  }, []);

  const leaveLanding = useCallback(() => {
    if (atLandingRef.current) {
      collapsedRef.current = true;
      setHistoryCollapsedState(true);
    }
    atLandingRef.current = false;
    setAtLanding(false);
  }, []);

  const departLanding = useCallback((fn: () => void) => {
    if (!atLandingRef.current) {
      fn();
      return;
    }
    if (resumingRef.current) return;
    clearReveal();
    leaveLanding();
    fn();
  }, [clearReveal, leaveLanding]);

  const patchInactiveSession = useCallback((id: string, mutate: (session: ChatSession) => ChatSession) => {
    if (!id || activeIdRef.current === id) return false;
    let found = false;
    setSessions((list) => {
      if (!list.some((s) => s.id === id)) return list;
      found = true;
      const next = list.map((s) => (s.id === id ? mutate(s) : s));
      persistStore({
        activeId: activeIdRef.current,
        sessions: next,
        historyCollapsed: collapsedRef.current,
      });
      return next;
    });
    return found;
  }, [persistStore]);

  const hydrateSession = useCallback((session: ChatSession) => {
    skipSave.current += 1;
    setNodes(cleanBoardNodes(session.board.nodes));
    setUserEdges(session.board.userEdges);
    setViewport(session.board.viewport ?? { x: 0, y: 0, zoom: 1 });
    zTop.current = session.board.zTop ?? 10;
    setEntries(session.entries);
    setSelectedEntryId(null);
    setOverviewOpen(false);
    setPreviewId(null);
    setFlashIds([]);
  }, []);

  useEffect(() => {
    const store = loadSessionStore(email);
    let list = store.sessions;
    let draft = list.find(sessionIsEmpty);
    if (!draft) {
      draft = emptySession();
      list = [draft, ...list];
    }
    setHistoryCollapsedState(store.historyCollapsed);
    setSessions(list);
    setActiveSessionId(draft.id);
    atLandingRef.current = true;
    setAtLanding(true);
    hydrateSession(draft);
    persistStore({ activeId: draft.id, sessions: list, historyCollapsed: store.historyCollapsed });
  }, [email, hydrateSession, persistStore]);

  useEffect(() => {
    if (resumeLock.current) return;
    if (skipSave.current > 0) {
      skipSave.current -= 1;
      return;
    }
    if (!activeSessionId) return;
    setSessions((list) => {
      const flushed = flushList(list, activeSessionId);
      persistStore({ activeId: activeSessionId, sessions: flushed, historyCollapsed: collapsedRef.current });
      return flushed;
    });
  }, [email, nodes, userEdges, viewport, entries, activeSessionId, flushList, persistStore]);

  const stageOpts = useCallback(() => ({ stage: leftoverCanvas(stageSizeRef.current, viewportRef.current) }), []);

  const commitStageSize = useCallback((size: { width: number; height: number }) => {
    if (size.width < 32 || size.height < 32) return;
    stageSizeRef.current = size;
  }, []);

  const dismissMaximize = useCallback((force = false) => {
    if (!force && Date.now() < maximizeIgnoreUntil.current) return;
    if (!maximizedIdRef.current) return;
    maximizedIdRef.current = null;
    setMaximizedId(null);
    savedViewport.current = null;
  }, []);

  const maximize = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id && n.kind === "app" && !n.hidden);
    if (!node) return;
    if (maximizedIdRef.current === id) {
      const prev = savedViewport.current;
      savedViewport.current = null;
      maximizedIdRef.current = null;
      setMaximizedId(null);
      if (prev) {
        maximizeIgnoreUntil.current = Date.now() + 400;
        setViewport(prev);
      }
      return;
    }
    savedViewport.current = viewportRef.current;
    maximizeIgnoreUntil.current = Date.now() + 500;
    maximizedIdRef.current = id;
    setHistoryCollapsedState(true);
    collapsedRef.current = true;
    persistStore({
      activeId: activeIdRef.current,
      sessions: flushList(sessionsRef.current, activeIdRef.current),
      historyCollapsed: true,
    });
    setMaximizedId(id);
    const box = leftoverCanvas(stageSizeRef.current);
    zTop.current += 1;
    setNodes((list) => list.map((n) => (
      n.id === id
        ? { ...n, z: zTop.current, hidden: false, w: box.w, h: box.h, autoSize: false }
        : n
    )));
    setFitRequest({ ids: [id], key: Date.now(), maxZoom: ZOOM_MAX, collapsedGutter: true });
  }, [flushList, persistStore]);

  const bumpZ = useCallback((id: string) => {
    zTop.current += 1;
    setNodes((list) => bumpZNode(list, id, zTop.current));
  }, []);

  const focus = useCallback((id: string) => {
    bumpZ(id);
  }, [bumpZ]);

  const openApp = useCallback((app: WorkspaceApp, opts?: { parentId?: string; query?: string; design?: PlyworksDesign }) => {
    zTop.current += 1;
    const z = zTop.current;
    let opened: string | null = null;
    let reused = false;
    setNodes((list) => {
      const result = openAppNodes(list, session, app, z, { ...opts, ...stageOpts() });
      if (!result) return list;
      opened = result.id;
      reused = result.reused;
      return result.nodes;
    });
    if (opened && !reused) {
      const label = appLabel(app);
      setEntries((list) => [...list, {
        id: uid("e"),
        at: Date.now(),
        query: label,
        routeLabel: "Activity",
        routeWhy: `Opened ${label}`,
        targetIds: [opened],
        appId: app,
        result: "activity",
        activity: "opened",
      }]);
    }
    return opened;
  }, [session, stageOpts]);

  const ensureConcierge = useCallback(() => {
    zTop.current += 1;
    const z = zTop.current;
    setNodes((list) => ensureConciergeNodes(list, z));
    return CONCIERGE_ID;
  }, []);

  const announceOpen = useCallback((app: WorkspaceApp, appTarget: string | null) => {
    if (app !== "plyworks") return;
    const conciergeId = ensureConcierge();
    const entryId = uid("e");
    const targetIds = appTarget ? [conciergeId, appTarget] : [conciergeId];
    const reply = plyworksOpening(`Opening ${appLabel(app)} for you.`);
    setEntries((list) => [...list, {
      id: entryId,
      at: Date.now(),
      query: `Open ${appLabel(app)}`,
      routeLabel: appLabel(app),
      routeWhy: reply,
      targetIds,
      appId: app,
      result: "app",
      reply,
      badgeApp: app,
    }]);
    setSelectedEntryId(entryId);
  }, [ensureConcierge]);

  const focusTargets = useCallback((ids: string[], _viewport?: { width: number; height: number }, opts?: { maxZoom?: number }) => {
    const live = nodesRef.current.filter((n) => ids.includes(n.id));
    if (!live.length) return;
    zTop.current += live.length;
    let z = zTop.current;
    setNodes((list) => list.map((n) => {
      if (!ids.includes(n.id)) return n;
      z += 1;
      return { ...n, hidden: false, z };
    }));
    setFitRequest({ ids, key: Date.now(), maxZoom: opts?.maxZoom ?? FIT_ZOOM_MAX });
    const flash = live
      .filter((n) => n.id !== CONCIERGE_ID && n.kind !== "log")
      .map((n) => n.id);
    if (!flash.length) return;
    setFlashKey((k) => k + 1);
    setFlashIds(flash);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashIds([]), FLASH_MS);
  }, []);

  useEffect(() => {
    setAppChatRelaySink((nodeId, content, _echoTo) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      const appId = node?.appId;
      const conciergeId = CONCIERGE_ID;
      const entry: RequestEntry = {
        id: uid("e"),
        at: Date.now(),
        query: "",
        routeLabel: appId ? appLabel(appId) : "App",
        routeWhy: content,
        targetIds: appId ? [conciergeId, nodeId] : [conciergeId],
        appId,
        result: "relay",
        reply: content,
        badgeApp: appId,
      };
      setEntries((list) => [...list, entry]);
      setSelectedEntryId(entry.id);
    });
    return () => setAppChatRelaySink(null);
  }, []);

  const askNow = useCallback((q: string) => {
    const conciergeId = ensureConcierge();
    const entryId = uid("e");
    const askSessionId = activeIdRef.current;
    const history = entriesRef.current
      .filter((e) => !e.pending && e.reply && !isRelayEntry(e) && !isActivityEntry(e))
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
        const confirm = (result.confirmApps ?? [])
          .filter((id): id is WorkspaceApp => isWorkspaceApp(id) && openable(session, id));
        const appId = !confirm.length && result.app && isWorkspaceApp(result.app) ? result.app : undefined;
        const targetIds: string[] = [conciergeId];
        let status: RequestEntry["result"] = "text";
        let routeLabel = "Concierge";
        let routeWhy = "Answered on the canvas";
        let confirmApps: WorkspaceApp[] | undefined;
        let badgeApp: WorkspaceApp | undefined;
        const kind = result.kind ?? inferConciergeKind(result);
        console.log(`kind: ${kind}`);
        const ops = result.plyworksOps ?? null;
        const inspect = kind === "get" || kind === "set";
        if (inspect) {
          console.log(`inspect ${kind}`, { app: appId ?? null, message: q, plyworksOps: ops });
        }

        if (confirm.length) {
          routeLabel = "Confirm";
          routeWhy = "Need a confirmation before routing to an app";
          confirmApps = confirm;
        } else {
          if (ops?.length) {
            const existing = plyworksAppNode(nodesRef.current);
            let plyId = existing?.id ?? null;
            if (plyId) {
              focus(plyId);
              setActivePlyworksSession(plyId);
            } else {
              plyId = openApp("plyworks", {
                parentId: conciergeId,
                query: q,
                design: designFromOps(ops, result.design),
              });
              if (plyId) setActivePlyworksSession(plyId);
            }
            if (plyId) targetIds.push(plyId);
            applyPlyworksSessionOps(ops);
            badgeApp = "plyworks";
            status = "app";
            routeLabel = WORKSPACE_APPS.find((a) => a.id === "plyworks")?.label ?? "Plyworks";
            routeWhy = result.reply;
          }

          if (appId && openable(session, appId)) {
            // WAITING BFF: SuggestedAction accept will gate this; still open so parallel app windows work.
            status = "app";
            routeLabel = WORKSPACE_APPS.find((a) => a.id === appId)?.label ?? "Concierge";
            routeWhy = result.reply;
            badgeApp = appId;
            if (!inspect) console.log(`sent to ${appLabel(appId)}`);
          } else if (appId) {
            routeWhy = result.reply;
          }
        }

        const design = appId === "plyworks" ? (result.design ?? undefined) : undefined;
        const live = activeIdRef.current === askSessionId;
        const skipOpen = Boolean(ops?.length && (appId === "plyworks" || !appId));
        let appTarget: string | null = null;
        if (status === "app" && appId && live && !skipOpen) {
          appTarget = openApp(appId, { parentId: conciergeId, query: q, design });
          if (appTarget && !targetIds.includes(appTarget)) targetIds.push(appTarget);
        } else if (ops?.length) {
          appTarget = targetIds.find((id) => id !== conciergeId) ?? null;
        }

        // WAITING BFF: SuggestedAction accept will own this handoff
        // WAITING MODEL: the app chat still answers; our structuring model takes over later
        if (live && appTarget && appId && chatCapable(appId) && !inspect && !ops?.length) {
          window.setTimeout(() => {
            deliverAppChat(appTarget, { kind: "text", text: q }, { echoTo: entryId });
          }, 0);
        }

        const focusIds = targetIds.filter((id) => id !== conciergeId);
        if (live && focusIds.length && (inspect || status === "app")) {
          window.setTimeout(() => focusTargets(focusIds), 0);
        }

        const settled = {
          appId: status === "app" ? (appId ?? badgeApp) : undefined,
          result: status,
          routeLabel,
          routeWhy,
          reply: result.reply,
          kind,
          targetIds,
          design: result.design ?? undefined,
          choices: result.choices ?? undefined,
          confirmApps,
          badgeApp,
          pending: false,
        };
        if (live) {
          setEntries((list) => list.map((e) => (e.id === entryId ? { ...e, ...settled } : e)));
          return;
        }
        patchInactiveSession(askSessionId, (s) => {
          let board = s.board;
          let entries = s.entries;
          const nextTargets = [...targetIds];
          if (status === "app" && appId && !skipOpen) {
            const z = (board.zTop ?? 10) + 1;
            const openedApp = openAppNodes(board.nodes, session, appId, z, { parentId: conciergeId, query: q, design, ...stageOpts() });
            if (openedApp) {
              nextTargets.push(openedApp.id);
              if (!openedApp.reused) {
                const label = appLabel(appId);
                entries = [...entries, {
                  id: uid("e"),
                  at: Date.now(),
                  query: label,
                  routeLabel: "Activity",
                  routeWhy: `Opened ${label}`,
                  targetIds: [openedApp.id],
                  appId,
                  result: "activity",
                  activity: "opened",
                }];
              }
              board = { ...board, nodes: openedApp.nodes, zTop: z };
            }
          }
          entries = entries.map((e) => (e.id === entryId ? { ...e, ...settled, targetIds: nextTargets } : e));
          return {
            ...s,
            updatedAt: Date.now(),
            entries,
            board,
            openedAppIds: openedAppIdsFrom(board.nodes, entries),
          };
        });
      };

      try {
        settle(await askConcierge(q, history, apps, restricted, snapshotPlyworksBoards()));
      } catch {
        // No assistant reachable: fall back to a local name/design match so the board stays usable.
        // WAITING MODEL: alias table stands in for the structuring model when the API is down.
        const local = matchLocalRoute(q);
        const named = local.app && isWorkspaceApp(local.app) ? local.app : null;
        const appId = named && openable(session, named) ? named : null;
        const confirmApps = (local.confirmApps ?? [])
          .filter((id): id is WorkspaceApp => isWorkspaceApp(id) && openable(session, id));
        const choices = appId || confirmApps.length ? null : local.choices;
        const routed = {
          app: confirmApps.length ? null : appId,
          design: (!confirmApps.length && appId === "plyworks" ? (local.design ?? "shelf") : null) as PlyworksDesign | null,
          choices,
          confirmApps: confirmApps.length ? confirmApps : null,
        };
        settle({
          kind: inferConciergeKind(routed),
          ...routed,
          reply: confirmApps.length
            ? `That could be ${confirmApps.map(appLabel).join(" or ")}. Which should I send this to?`
            : appId
              ? appId === "plyworks"
                ? plyworksOpening(`Opening ${appLabel(appId)} for you.`)
                : `Opening ${appLabel(appId)} for you.`
              : named
                ? denyCopy(session, named).body
                : choices
                  ? "Have a specific type in mind? We have base designs for: shelf, table, stool, and bench."
                  : `I can open ${apps.map(appLabel).join(", ")}. Name one, or drop a file and I'll route it.`,
        });
      }
    })();
  }, [openApp, ensureConcierge, session, focus, focusTargets, patchInactiveSession, stageOpts]);

  const ask = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    if (tryHelpAsk(q)) return;
    departLanding(() => askNow(q));
  }, [askNow, departLanding]);

  const ingestNow = useCallback((list: File[]) => {
    const conciergeId = ensureConcierge();

    for (const file of list) {
      // WAITING BFF: upload → artifact → FileInspectionService
      // WAITING MODEL: format-to-app is a stand-in; the structuring model will propose the job later
      const verdict = classifyFile(file);
      const query = verdict.fileName;
      const targetIds: string[] = [conciergeId];
      let appId: WorkspaceApp | undefined;
      let result: RequestEntry["result"] = "text";
      let routeLabel = "Concierge";
      let routeWhy = "Answered on the canvas";
      let reply = verdict.message;
      let badgeApp: WorkspaceApp | undefined;
      const entryId = uid("e");

      if (verdict.kind === "route") {
        if (openable(session, verdict.appId)) {
          appId = verdict.appId;
          badgeApp = verdict.appId;
          console.log(`sent to ${appLabel(verdict.appId)}`);
          const appTarget = openApp(verdict.appId, { parentId: conciergeId, query });
          if (appTarget) {
            targetIds.push(appTarget);
            // WAITING BFF: SuggestedAction accept will own this handoff
            // WAITING MODEL: the app chat still answers; our structuring model takes over later
            // Defer until after React mounts the window and registerAppChat runs.
            window.setTimeout(() => {
              deliverAppChat(appTarget, { kind: "file", file }, { echoTo: entryId });
              focusTargets([appTarget]);
            }, 0);
          }
          result = "app";
          routeLabel = WORKSPACE_APPS.find((a) => a.id === verdict.appId)?.label ?? "Concierge";
          routeWhy = verdict.message;
        } else {
          reply = denyCopy(session, verdict.appId).body;
          routeWhy = reply;
        }
      } else {
        routeWhy = "File type is not supported yet";
      }

      const entry: RequestEntry = {
        id: entryId,
        at: Date.now(),
        query,
        routeLabel,
        routeWhy,
        targetIds,
        appId,
        result,
        reply,
        badgeApp,
      };
      setEntries((prev) => [...prev, entry]);
      setSelectedEntryId(entry.id);
    }
  }, [openApp, ensureConcierge, session, focusTargets]);

  const ingestFiles = useCallback((files: File[]) => {
    const list = Array.from(files).filter(Boolean);
    if (!list.length) return;
    departLanding(() => ingestNow(list));
  }, [departLanding, ingestNow]);

  const confirmIntake = useCallback((entryId: string, app: WorkspaceApp) => {
    if (app !== "boxouts" && app !== "simpleparts" && app !== "plyworks") return;
    const entry = entriesRef.current.find((e) => e.id === entryId);
    if (!entry) return;
    const query = entry.query;
    const conciergeId = ensureConcierge();
    if (!openable(session, app)) {
      const copy = denyCopy(session, app);
      setEntries((prev) => prev.map((e) => (e.id === entryId ? {
        ...e,
        result: "text",
        routeLabel: "Concierge",
        routeWhy: copy.body,
        reply: copy.body,
        confirmApps: undefined,
      } : e)));
      return;
    }
    console.log(`sent to ${appLabel(app)}`);
    const message = app === "plyworks"
      ? plyworksOpening(`Opening ${appLabel(app)} for you.`)
      : `Opening ${appLabel(app)} for you.`;
    const meta = WORKSPACE_APPS.find((a) => a.id === app);
    const appTarget = openApp(app, { parentId: conciergeId, query });

    // WAITING BFF: SuggestedAction accept will own this handoff
    // WAITING MODEL: the app chat still answers; our structuring model takes over later
    if (appTarget && chatCapable(app) && query.trim()) {
      window.setTimeout(() => {
        deliverAppChat(appTarget, { kind: "text", text: query }, { echoTo: entryId });
      }, 0);
    }
    if (appTarget) {
      window.setTimeout(() => focusTargets([appTarget]), 0);
    }

    setEntries((prev) => prev.map((e) => {
      if (e.id !== entryId) return e;
      const targetIds = appTarget && !e.targetIds.includes(appTarget)
        ? [...e.targetIds, appTarget]
        : e.targetIds;
      return {
        ...e,
        appId: app,
        result: "app",
        routeLabel: meta?.label ?? e.routeLabel,
        routeWhy: message,
        reply: message,
        confirmApps: undefined,
        badgeApp: app,
        targetIds,
      };
    }));
  }, [openApp, ensureConcierge, session, focusTargets]);

  const appendConciergeTurn = useCallback((query: string, reply: string, extras?: Partial<RequestEntry>) => {
    const conciergeId = ensureConcierge();
    const entryId = extras?.id ?? uid("e");
    const entry: RequestEntry = {
      id: entryId,
      at: Date.now(),
      query,
      routeLabel: extras?.routeLabel ?? "Concierge",
      routeWhy: extras?.routeWhy ?? reply,
      targetIds: extras?.targetIds ?? [conciergeId],
      result: extras?.result ?? "text",
      reply,
      appId: extras?.appId,
      design: extras?.design,
      choices: extras?.choices,
      helpTopics: extras?.helpTopics,
      kind: extras?.kind,
      confirmApps: extras?.confirmApps,
      badgeApp: extras?.badgeApp,
      pending: extras?.pending,
    };
    setEntries((list) => [...list, entry]);
    setSelectedEntryId(entryId);
    return entryId;
  }, [ensureConcierge]);

  const restoreEntry = useCallback((entryId: string, viewport?: { width: number; height: number }) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const conciergeId = ensureConcierge();
    const targetIds: string[] = [conciergeId];
    if (entry.appId && entry.result === "app") {
      const appTarget = openApp(entry.appId, { parentId: conciergeId, query: entry.query, design: entry.design });
      if (appTarget) targetIds.push(appTarget);
    }
    setEntries((list) => list.map((e) => (e.id === entryId ? { ...e, targetIds } : e)));
    setSelectedEntryId(entryId);
    if (viewport) {
      window.setTimeout(() => focusTargets(targetIds, viewport), 0);
    }
  }, [entries, openApp, ensureConcierge, focusTargets]);

  const commitPositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
    setNodes((list) => commitPositionNodes(list, positions));
  }, []);

  const commitViewport = useCallback((next: ViewportSnapshot) => {
    setViewport(next);
  }, []);

  const addUserEdge = useCallback((edge: UserEdge) => {
    setUserEdges((list) => {
      if (edge.from === edge.to) return list;
      if (list.some((e) => e.from === edge.from && e.to === edge.to)) return list;
      return [...list, edge];
    });
  }, []);

  const removeUserEdges = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setUserEdges((list) => list.filter((e) => !drop.has(e.id)));
  }, []);

  const unrail = useCallback((id: string) => {
    setNodes((list) => unrailConcierge(list, id));
  }, []);

  const addNote = useCallback((opts?: { x?: number; y?: number }) => {
    zTop.current += 1;
    let noteId = "";
    setNodes((list) => {
      const result = addNoteNodes(list, zTop.current, opts);
      noteId = result.id;
      return result.nodes;
    });
    return noteId;
  }, []);

  const setNodeBody = useCallback((id: string, body: string) => {
    setNodes((list) => setNodeBodyNodes(list, id, body));
  }, []);

  const fit = useCallback((id: string, w: number, h: number) => {
    setNodes((list) => fitNode(list, id, w, h));
  }, []);

  const close = useCallback((id: string) => {
    if (maximizedIdRef.current === id) dismissMaximize(true);
    const node = nodesRef.current.find((n) => n.id === id);
    setUserEdges((edges) => {
      const result = closeNode(nodesRef.current, edges, id);
      if (!result) return edges;
      setNodes(result.nodes);
      return result.userEdges;
    });
    if (node?.kind === "app" && node.appId) {
      const label = appLabel(node.appId);
      setEntries((list) => [...list, {
        id: uid("e"),
        at: Date.now(),
        query: label,
        routeLabel: "Activity",
        routeWhy: `Closed ${label}`,
        targetIds: [id],
        appId: node.appId,
        result: "activity",
        activity: "closed",
      }]);
    }
  }, [dismissMaximize]);

  const hide = useCallback((id: string) => {
    if (maximizedIdRef.current === id) dismissMaximize(true);
    setNodes((list) => hideNode(list, id));
  }, [dismissMaximize]);

  const show = useCallback((id: string) => {
    bumpZ(id);
  }, [bumpZ]);

  const setLocked = useCallback((ids: string[], locked: boolean) => {
    setNodes((list) => setLockedNodes(list, ids, locked));
  }, []);

  const duplicateNodes = useCallback((ids: string[]) => {
    let copies: WorkspaceNode[] = [];
    setNodes((list) => {
      const result = duplicateNodeCopies(list, ids, zTop.current);
      zTop.current = result.zTop;
      copies = result.copies;
      return result.nodes;
    });
    return copies.map((n) => n.id);
  }, []);

  const tile = useCallback((_viewport?: { width: number; height: number }) => {
    setNodes((list) => tileNodes(list, leftoverCanvas(stageSizeRef.current, viewportRef.current)));
  }, []);

  const beginResume = useCallback((next: ChatSession, flushed: ChatSession[]) => {
    dismissMaximize(true);
    clearReveal();
    resumeLock.current = true;
    const fromLanding = atLandingRef.current;
    leaveLanding();
    if (fromLanding) {
      collapsedRef.current = true;
      setHistoryCollapsedState(true);
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spin = reduce || fromLanding ? 0 : SESSION_SPIN_MS;
    if (spin > 0) setResuming(true);
    setSessions(flushed);
    setActiveSessionId(next.id);
    skipSave.current += 1;
    setNodes(cleanBoardNodes(next.board.nodes).filter((n) => n.id === CONCIERGE_ID));
    setUserEdges([]);
    setViewport(next.board.viewport ?? { x: 0, y: 0, zoom: 1 });
    zTop.current = next.board.zTop ?? 10;
    setEntries(spin > 0 ? [] : next.entries);
    setSelectedEntryId(null);
    setOverviewOpen(false);
    setPreviewId(null);
    setFlashIds([]);
    setEnteringNodeIds([]);
    persistStore({ activeId: next.id, sessions: flushed, historyCollapsed: collapsedRef.current });

    const windows = cleanBoardNodes(next.board.nodes)
      .filter((n) => n.id !== CONCIERGE_ID)
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    const hidden = windows.filter((n) => n.hidden);
    const visible = windows.filter((n) => !n.hidden);
    const afterChat = reduce ? 0 : fromLanding ? HERO_LEAVE_MS + PAIR_FADE_MS + PAIR_SHAPE_MS + PAIR_FADE_MS : SESSION_APP_AFTER_CHAT_MS;
    const gap = reduce ? 0 : SESSION_APP_STAGGER_MS;
    const hub = cleanBoardNodes(next.board.nodes).filter((n) => n.id === CONCIERGE_ID);

    const reveal = () => {
      setEntries(next.entries);
      setResuming(false);
      later(afterChat, () => {
        const show = (count: number) => {
          const shown = visible.slice(0, count);
          const extras = count >= visible.length ? hidden : [];
          const incoming = shown[shown.length - 1];
          setEnteringNodeIds(incoming ? [incoming.id] : []);
          setNodes(cleanBoardNodes([...hub, ...shown, ...extras]));
          if (count >= visible.length) {
            setUserEdges(next.board.userEdges);
            setEnteringNodeIds([]);
            resumeLock.current = false;
            return;
          }
          later(gap, () => show(count + 1));
        };
        if (!visible.length) {
          setNodes(cleanBoardNodes(next.board.nodes));
          setUserEdges(next.board.userEdges);
          resumeLock.current = false;
          return;
        }
        show(1);
      });
    };
    if (spin > 0) later(spin, reveal);
    else reveal();
  }, [clearReveal, dismissMaximize, later, leaveLanding, persistStore]);

  const setHistoryCollapsed = useCallback((collapsed: boolean) => {
    if (!collapsed) dismissMaximize(true);
    setHistoryCollapsedState(collapsed);
    persistStore({
      activeId: activeIdRef.current,
      sessions: flushList(sessionsRef.current, activeIdRef.current),
      historyCollapsed: collapsed,
    });
  }, [dismissMaximize, flushList, persistStore]);

  const createSession = useCallback(() => {
    dismissMaximize(true);
    clearReveal();
    resumeLock.current = false;
    setResuming(false);
    const flushed = flushList(sessionsRef.current, activeIdRef.current);
    const current = flushed.find((s) => s.id === activeIdRef.current);
    if (current && sessionIsEmpty(current)) {
      setSessions(flushed);
      persistStore({ activeId: current.id, sessions: flushed, historyCollapsed: collapsedRef.current });
      return;
    }
    const fresh = emptySession();
    const next = [fresh, ...flushed];
    setSessions(next);
    setActiveSessionId(fresh.id);
    hydrateSession(fresh);
    persistStore({ activeId: fresh.id, sessions: next, historyCollapsed: collapsedRef.current });
  }, [clearReveal, dismissMaximize, flushList, hydrateSession, persistStore]);

  const returnToLanding = useCallback(() => {
    dismissMaximize(true);
    clearReveal();
    resumeLock.current = false;
    setResuming(false);
    setEnteringNodeIds([]);
    const flushed = flushList(sessionsRef.current, activeIdRef.current);
    const current = flushed.find((s) => s.id === activeIdRef.current);
    atLandingRef.current = true;
    setAtLanding(true);
    if (current && sessionIsEmpty(current)) {
      setSessions(flushed);
      hydrateSession(current);
      persistStore({ activeId: current.id, sessions: flushed, historyCollapsed: collapsedRef.current });
      return;
    }
    let list = flushed;
    let draft = list.find(sessionIsEmpty);
    if (!draft) {
      draft = emptySession();
      list = [draft, ...list];
    }
    setSessions(list);
    setActiveSessionId(draft.id);
    hydrateSession(draft);
    persistStore({ activeId: draft.id, sessions: list, historyCollapsed: collapsedRef.current });
  }, [clearReveal, dismissMaximize, flushList, hydrateSession, persistStore]);

  const switchSession = useCallback((id: string) => {
    if (id === activeIdRef.current) return;
    const flushed = flushList(sessionsRef.current, activeIdRef.current);
    const next = flushed.find((s) => s.id === id);
    if (!next) return;
    beginResume(next, flushed);
  }, [beginResume, flushList]);

  const renameSession = useCallback((id: string, title: string) => {
    const name = title.trim() || NEW_CHAT_TITLE;
    const flushed = flushList(sessionsRef.current, activeIdRef.current).map((s) =>
      s.id === id ? { ...s, title: name, titleLocked: true, updatedAt: Date.now() } : s,
    );
    setSessions(flushed);
    persistStore({ activeId: activeIdRef.current, sessions: flushed, historyCollapsed: collapsedRef.current });
  }, [flushList, persistStore]);

  const deleteSession = useCallback((id: string) => {
    const flushed = flushList(sessionsRef.current, activeIdRef.current);
    const remaining = flushed.filter((s) => s.id !== id);
    if (!remaining.length) {
      clearReveal();
      resumeLock.current = false;
      setResuming(false);
      const fresh = emptySession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      hydrateSession(fresh);
      persistStore({ activeId: fresh.id, sessions: [fresh], historyCollapsed: collapsedRef.current });
      return;
    }
    if (id !== activeIdRef.current) {
      setSessions(remaining);
      persistStore({ activeId: activeIdRef.current, sessions: remaining, historyCollapsed: collapsedRef.current });
      return;
    }
    const nextActive = remaining.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (sessionIsEmpty(nextActive)) {
      clearReveal();
      resumeLock.current = false;
      setResuming(false);
      setSessions(remaining);
      setActiveSessionId(nextActive.id);
      hydrateSession(nextActive);
      persistStore({ activeId: nextActive.id, sessions: remaining, historyCollapsed: collapsedRef.current });
      return;
    }
    beginResume(nextActive, remaining);
  }, [beginResume, clearReveal, flushList, hydrateSession, persistStore]);

  const clearTranscript = useCallback(() => {
    setEntries([]);
    setSelectedEntryId(null);
  }, []);

  const clear = useCallback((opts?: { transcript?: boolean }) => {
    dismissMaximize(true);
    if (opts?.transcript) {
      setEntries([]);
      setSelectedEntryId(null);
      setNodes([]);
    } else {
      setNodes((list) => list.filter((n) => n.id === CONCIERGE_ID).map((n) => ({ ...n, hidden: true })));
    }
    setUserEdges([]);
    setOverviewOpen(false);
    setPreviewId(null);
    setViewport({ x: 0, y: 0, zoom: 1 });
    setFlashIds([]);
    zTop.current = 10;
  }, [dismissMaximize]);

  const wireEdges = useMemo(
    () => topology(nodes, entries, selectedEntryId),
    [nodes, entries, selectedEntryId],
  );

  const value = useMemo<Ctx>(() => ({
    nodes,
    edges: wireEdges,
    userEdges,
    entries,
    selectedEntryId,
    setSelectedEntryId,
    viewport,
    overviewOpen,
    setOverviewOpen,
    previewId,
    setPreviewId,
    fitRequest,
    openApp,
    announceOpen,
    addNote,
    setNodeBody,
    ask,
    ingestFiles,
    confirmIntake,
    restoreEntry,
    focusTargets,
    ensureConcierge,
    appendConciergeTurn,
    focus,
    commitPositions,
    commitViewport,
    addUserEdge,
    removeUserEdges,
    unrail,
    fit,
    maximize,
    dismissMaximize,
    maximizedId,
    commitStageSize,
    close,
    hide,
    show,
    setLocked,
    duplicateNodes,
    tile,
    clear,
    clearTranscript,
    sessions,
    activeSessionId,
    activeSession: sessions.find((s) => s.id === activeSessionId) ?? null,
    historyCollapsed,
    setHistoryCollapsed,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    returnToLanding,
    departLanding,
    atLanding,
    resuming,
    enteringNodeIds,
    flashIds,
    flashKey,
  }), [nodes, wireEdges, userEdges, entries, selectedEntryId, viewport, overviewOpen, previewId, fitRequest, openApp, announceOpen, addNote, setNodeBody, ask, ingestFiles, confirmIntake, restoreEntry, focusTargets, ensureConcierge, appendConciergeTurn, focus, commitPositions, commitViewport, addUserEdge, removeUserEdges, unrail, fit, maximize, dismissMaximize, maximizedId, commitStageSize, close, hide, show, setLocked, duplicateNodes, tile, clear, clearTranscript, sessions, activeSessionId, historyCollapsed, setHistoryCollapsed, createSession, switchSession, renameSession, deleteSession, returnToLanding, departLanding, atLanding, resuming, enteringNodeIds, flashIds, flashKey]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}


export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
