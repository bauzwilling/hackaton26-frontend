import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FIT_ZOOM_MAX, ZOOM_MIN, ZOOM_MAX } from "../canvas/flow/constants";
import { askConcierge, inferConciergeKind, type ConciergeResult, type PlyworksDesign } from "../lib/concierge";
import { classifyFile, openingMessage } from "../lib/intake";
import { matchLocalRoute } from "../lib/routing";
import { plyworksOpening } from "../lib/catalog";
import { tryHelpAsk } from "../lib/help";
import { emptyPersist, loadWorkspacePersist, requestsKey, saveWorkspacePersist, type ViewportSnapshot } from "../workspace/persist";
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
  entryIsLive,
  entryOpenedApp,
  entryWindowName,
  isWorkspaceApp,
  licensedApps,
  loadEntries,
  normalizeNode,
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
  withRail,
} from "../workspace/commands";
import { useSession } from "./session";

export type { SystemEdge, UserEdge, ViewportSnapshot };
export type { NodeKind, WorkspaceApp, WorkspaceNode, WorkspaceEdge, RequestEntry };
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
};

export type FitRequest = { ids: string[]; key: number; maxZoom?: number };

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
  close: (id: string) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  setLocked: (ids: string[], locked: boolean) => void;
  duplicateNodes: (ids: string[]) => string[];
  tile: (viewport: { width: number; height: number }) => void;
  clear: (opts?: { transcript?: boolean }) => void;
  clearTranscript: () => void;
  flashIds: string[];
  flashKey: number;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const email = session?.email ?? "anon";
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [userEdges, setUserEdges] = useState<UserEdge[]>([]);
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportSnapshot>({ x: 0, y: 0, zoom: 1 });
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const [fitRequest, setFitRequest] = useState<FitRequest | null>(null);
  const zTop = useRef(10);
  const flashTimer = useRef<number | null>(null);
  const skipSave = useRef(0);
  const skipEntries = useRef(0);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const entriesRef = useRef<RequestEntry[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    const saved = loadWorkspacePersist(email) ?? emptyPersist();
    skipSave.current += 1;
    const cleaned = saved.nodes
      .filter((n) => n.kind !== "request" && n.kind !== "denied" && (n.kind !== "text" || n.id === CONCIERGE_ID))
      .filter((n) => {
        if (n.kind !== "app" || !n.appId) return true;
        const meta = WORKSPACE_APPS.find((a) => a.id === n.appId);
        return meta?.ready !== false;
      })
      .map(normalizeNode);
    setNodes(cleaned);
    setUserEdges(saved.userEdges);
    setViewport(saved.viewport ?? { x: 0, y: 0, zoom: 1 });
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
    const data = { nodes, userEdges, viewport, zTop: zTop.current };
    saveWorkspacePersist(email, data);
  }, [email, nodes, userEdges, viewport]);

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
    setNodes((list) => bumpZNode(list, id, zTop.current));
  }, []);

  const focus = useCallback((id: string) => {
    bumpZ(id);
  }, [bumpZ]);

  const openApp = useCallback((app: WorkspaceApp, opts?: { parentId?: string; query?: string; design?: PlyworksDesign }) => {
    zTop.current += 1;
    const z = zTop.current;
    let opened: string | null = null;
    setNodes((list) => {
      const result = openAppNodes(list, session, app, z, opts);
      if (!result) return list;
      opened = result.id;
      return result.nodes;
    });
    return opened;
  }, [session]);

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
    }]);
    setSelectedEntryId(entryId);
  }, [ensureConcierge]);

  const ask = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    if (tryHelpAsk(q)) return;
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
        const confirm = (result.confirmApps ?? [])
          .filter((id): id is WorkspaceApp => isWorkspaceApp(id) && openable(session, id));
        const appId = !confirm.length && result.app && isWorkspaceApp(result.app) ? result.app : undefined;
        const targetIds: string[] = [conciergeId];
        let status: RequestEntry["result"] = "text";
        let routeLabel = "Concierge";
        let routeWhy = "Answered on the canvas";
        let confirmApps: WorkspaceApp[] | undefined;
        // Additive only — do not branch open/confirm on kind.
        const kind = result.kind ?? inferConciergeKind(result);
        console.log(`kind: ${kind}`);

        if (confirm.length) {
          routeLabel = "Confirm";
          routeWhy = "Need a confirmation before routing to an app";
          confirmApps = confirm;
        } else if (appId && openable(session, appId)) {
          // WAITING BFF: SuggestedAction accept will gate this; still open so parallel app windows work.
          status = "app";
          routeLabel = WORKSPACE_APPS.find((a) => a.id === appId)?.label ?? "Concierge";
          routeWhy = result.reply;
          // WAITING MODEL: later also forward the turn into that app's chat API
          console.log(`sent to ${appLabel(appId)}`);
          const design = appId === "plyworks" ? (result.design ?? undefined) : undefined;
          const appTarget = openApp(appId, { parentId: conciergeId, query: q, design });
          if (appTarget) targetIds.push(appTarget);
        } else if (appId) {
          // Unavailable: no window. The concierge reply is the whole answer.
          routeWhy = result.reply;
        }

        setEntries((list) => list.map((e) => (e.id === entryId ? {
          ...e,
          appId: status === "app" ? appId : undefined,
          result: status,
          routeLabel,
          routeWhy,
          reply: result.reply,
          kind,
          targetIds,
          design: result.design ?? undefined,
          choices: result.choices ?? undefined,
          confirmApps,
          pending: false,
        } : e)));
      };

      try {
        settle(await askConcierge(q, history, apps, restricted));
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
      let reply = verdict.message;

      if (verdict.kind === "route") {
        if (openable(session, verdict.appId)) {
          appId = verdict.appId;
          // WAITING MODEL: later also forward the turn into that app's chat API
          console.log(`sent to ${appLabel(verdict.appId)}`);
          const appTarget = openApp(verdict.appId, { parentId: conciergeId, query });
          if (appTarget) targetIds.push(appTarget);
          result = "app";
          routeLabel = WORKSPACE_APPS.find((a) => a.id === verdict.appId)?.label ?? "Concierge";
          routeWhy = verdict.message;
        } else {
          reply = denyCopy(session, verdict.appId).body;
          routeWhy = reply;
        }
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
        reply,
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
    // WAITING MODEL: later also forward the turn into that app's chat API
    console.log(`sent to ${appLabel(app)}`);
    const message = openingMessage(app, query);
    const meta = WORKSPACE_APPS.find((a) => a.id === app);
    const appTarget = openApp(app, { parentId: conciergeId, query });

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
        targetIds,
      };
    }));
  }, [openApp, ensureConcierge, session]);

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
      pending: extras?.pending,
    };
    setEntries((list) => [...list, entry]);
    setSelectedEntryId(entryId);
    return entryId;
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
    setUserEdges((edges) => {
      const result = closeNode(nodesRef.current, edges, id);
      if (!result) return edges;
      setNodes(result.nodes);
      return result.userEdges;
    });
  }, []);

  const hide = useCallback((id: string) => {
    setNodes((list) => hideNode(list, id));
  }, []);

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

  const tile = useCallback((viewport: { width: number; height: number }) => {
    setNodes((list) => tileNodes(list, viewport));
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
    setUserEdges([]);
    setOverviewOpen(false);
    setViewport({ x: 0, y: 0, zoom: 1 });
    setFlashIds([]);
    zTop.current = 10;
  }, []);

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
    close,
    hide,
    show,
    setLocked,
    duplicateNodes,
    tile,
    clear,
    clearTranscript,
    flashIds,
    flashKey,
  }), [nodes, wireEdges, userEdges, entries, selectedEntryId, viewport, overviewOpen, fitRequest, openApp, announceOpen, addNote, setNodeBody, ask, ingestFiles, confirmIntake, restoreEntry, focusTargets, ensureConcierge, appendConciergeTurn, focus, commitPositions, commitViewport, addUserEdge, removeUserEdges, unrail, fit, close, hide, show, setLocked, duplicateNodes, tile, clear, clearTranscript, flashIds, flashKey]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}


export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
