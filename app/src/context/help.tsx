import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "./session";
import {
  CONCIERGE_ID,
  HERO_LEAVE_MS,
  PAIR_FADE_MS,
  PAIR_SHAPE_MS,
  useWorkspace,
  type TourWorkspaceSnapshot,
  type WorkspaceApp,
} from "./workspace";
import {
  HELP_OFFER_CHIPS,
  HELP_OFFER_LABEL,
  HELP_OFFER_REPLY,
  HELP_PLEASE,
  HELP_TOPIC_LABEL,
  HELP_ZOOM_MAX,
  matchHelpIntent,
  matchHelpOfferChoice,
  matchTourRoleChoice,
  queryHelpAnchor,
  setHelpAskHandler,
  staffTourAsk,
  SUPERUSER_TOUR_REPLY,
  SUPERUSER_TOUR_ROLES,
  tourFor,
  tourTopicForRole,
  TOUR_DESIGN_ASK,
  TOUR_STUB_REPLY,
  TOUR_TABLE_ASK,
  type HelpAnchor,
  type HelpOfferId,
  type HelpPhase,
  type HelpPrepare,
  type HelpStep,
  type HelpTopicId,
  type LiveTourRole,
} from "../lib/help";

export type HelpCtx = {
  phase: HelpPhase;
  topic: HelpTopicId | null;
  stepIndex: number;
  steps: HelpStep[];
  step: HelpStep | null;
  appNodeId: string | null;
  iframeReady: boolean;
  pending: boolean;
  tourBooting: boolean;
  startHelp: () => void;
  startRoleTour: (topic?: LiveTourRole) => void;
  offerHelp: (query?: string) => void;
  pickOffer: (id: HelpOfferId) => void;
  pickTopic: (topic: HelpTopicId) => void;
  next: () => void;
  back: () => void;
  stop: () => void;
  onPlyworksDone: () => void;
  onPlyworksReady: () => void;
};

const HelpContext = createContext<HelpCtx | null>(null);

function studioViewport() {
  const el = document.querySelector(".studio");
  if (!el) return { width: window.innerWidth, height: window.innerHeight };
  const box = el.getBoundingClientRect();
  return { width: box.width, height: box.height };
}

function closeLookPanel() {
  const toggle = document.querySelector(".viz-toggle") as HTMLButtonElement | null;
  if (toggle && document.querySelector(".viz-panel")) toggle.click();
}

function closeAccountMenu() {
  const toggle = document.querySelector(".user-menu-toggle") as HTMLButtonElement | null;
  if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
}

function closeChromeMenus() {
  closeLookPanel();
  closeAccountMenu();
  clearNetworkTourOpen();
}

function clearNetworkTourOpen() {
  document.querySelector(".chrome-status.is-tour-open")?.classList.remove("is-tour-open");
}

function openNetworkTourLabel() {
  const el = document.querySelector(".chrome-status") as HTMLElement | null;
  if (!el) return;
  el.classList.add("is-tour-open");
  el.focus({ preventScroll: true });
}

function openAccountMenu() {
  const toggle = document.querySelector(".user-menu-toggle") as HTMLButtonElement | null;
  if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitUntil(predicate: () => boolean, timeoutMs = 45000, intervalMs = 200) {
  return new Promise<boolean>((resolve) => {
    if (predicate()) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      if (predicate()) {
        window.clearInterval(id);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(id);
        resolve(false);
      }
    }, intervalMs);
  });
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const {
    nodes,
    entries,
    ensureConcierge,
    focusTargets,
    appendConciergeTurn,
    openApp,
    show,
    hide,
    setOverviewOpen,
    dismissMaximize,
    createSession,
    departLanding,
    atLanding,
    ask,
    returnToLanding,
    setHistoryCollapsed,
    captureTourSnapshot,
    restoreTourSnapshot,
    tile,
  } = useWorkspace();

  const [phase, setPhase] = useState<HelpPhase>("idle");
  const [topic, setTopic] = useState<HelpTopicId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [appNodeId, setAppNodeId] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [pending, setPending] = useState(false);
  /** True while returning to hero before the tour overlay starts (e.g. from Help chat). */
  const [tourBooting, setTourBooting] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const topicRef = useRef(topic);
  topicRef.current = topic;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const atLandingRef = useRef(atLanding);
  atLandingRef.current = atLanding;
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;
  const tourSnapRef = useRef<TourWorkspaceSnapshot | null>(null);
  const userTourRef = useRef(false);
  const prepGenRef = useRef(0);
  /** When true, tryHelpAsk lets the tour-driven ask() reach Concierge. */
  const tourDriveAskRef = useRef(false);
  /** Design-something ask is sent once per tour run. */
  const designAskSentRef = useRef(false);
  const tableAskSentRef = useRef(false);
  const staffAskSentRef = useRef(new Set<string>());

  const steps = topic ? tourFor(topic) : [];
  const step = phase === "touring" || (phase === "iframe" && !iframeReady)
    ? (steps[stepIndex] ?? null)
    : null;

  const zoomConcierge = useCallback(() => {
    ensureConcierge();
    window.setTimeout(() => {
      focusTargets([CONCIERGE_ID], studioViewport(), { maxZoom: HELP_ZOOM_MAX });
    }, 0);
  }, [ensureConcierge, focusTargets]);

  const findOrOpenApp = useCallback((app: WorkspaceApp) => {
    const existing = nodesRef.current.find((n) => n.kind === "app" && n.appId === app);
    if (existing) {
      show(existing.id);
      setAppNodeId(existing.id);
      window.setTimeout(() => {
        focusTargets([existing.id], studioViewport());
      }, 40);
      return existing.id;
    }
    const opened = openApp(app, { parentId: CONCIERGE_ID, query: "Help" });
    if (opened) {
      setAppNodeId(opened.id);
      window.setTimeout(() => {
        focusTargets([opened.id], studioViewport());
      }, 80);
    }
    return opened?.id ?? null;
  }, [focusTargets, openApp, show]);

  const endUserTour = useCallback(() => {
    prepGenRef.current += 1;
    setPending(false);
    setTourBooting(false);
    userTourRef.current = false;
    designAskSentRef.current = false;
    tableAskSentRef.current = false;
    staffAskSentRef.current = new Set();
    clearNetworkTourOpen();
    setPhase("idle");
    setTopic(null);
    setStepIndex(0);
    setAppNodeId(null);
    setIframeReady(false);
    setOverviewOpen(false);
    closeChromeMenus();
    const snap = tourSnapRef.current;
    tourSnapRef.current = null;
    if (snap) {
      // Landing always keeps the chat rail collapsed.
      restoreTourSnapshot({
        ...snap,
        historyCollapsed: snap.atLanding ? true : snap.historyCollapsed,
      });
      if (snap.atLanding) setHistoryCollapsed(true);
    }
  }, [restoreTourSnapshot, setHistoryCollapsed, setOverviewOpen]);

  const stop = useCallback(() => {
    if (userTourRef.current) {
      endUserTour();
      return;
    }
    prepGenRef.current += 1;
    setPending(false);
    setPhase("idle");
    setTopic(null);
    setStepIndex(0);
    setAppNodeId(null);
    setIframeReady(false);
    setOverviewOpen(false);
    closeChromeMenus();
  }, [endUserTour, setOverviewOpen]);

  const runPrepare = useCallback(async (prepare?: HelpPrepare) => {
    if (!prepare) return;
    if (prepare === "focus-concierge" || prepare === "focus-log") {
      zoomConcierge();
      return;
    }
    if (prepare === "overview-open") {
      setOverviewOpen(true);
      return;
    }
    if (prepare === "overview-close") {
      setOverviewOpen(false);
      return;
    }
    if (prepare === "look-open") {
      closeAccountMenu();
      clearNetworkTourOpen();
      const toggle = document.querySelector(".viz-toggle") as HTMLButtonElement | null;
      const open = document.querySelector(".viz-panel");
      if (toggle && !open) toggle.click();
      await delay(200);
      return;
    }
    if (prepare === "account-open") {
      closeLookPanel();
      clearNetworkTourOpen();
      openAccountMenu();
      await delay(200);
      return;
    }
    if (prepare === "chrome-close") {
      closeChromeMenus();
      return;
    }
    if (prepare === "network-open") {
      closeLookPanel();
      closeAccountMenu();
      setOverviewOpen(false);
      openNetworkTourLabel();
      await delay(350);
      return;
    }
    if (prepare === "ensure-hero") {
      closeChromeMenus();
      setOverviewOpen(false);
      setHistoryCollapsed(true);
      if (!atLandingRef.current) returnToLanding();
      await delay(50);
      return;
    }
    if (prepare === "ask-design-something") {
      closeChromeMenus();
      setOverviewOpen(false);
      const already = designAskSentRef.current
        || entriesRef.current.some((e) => e.query === TOUR_DESIGN_ASK && e.choices && e.choices.length > 0);
      if (already) {
        designAskSentRef.current = true;
        if (atLandingRef.current) {
          await new Promise<void>((resolve) => {
            departLanding(() => resolve());
          });
        }
        await waitUntil(() => {
          const last = [...entriesRef.current].reverse().find((e) => (
            e.query === TOUR_DESIGN_ASK && !e.pending && e.choices && e.choices.length > 0
          ));
          return Boolean(last);
        }, 5000);
        return;
      }
      const before = entriesRef.current.length;
      await new Promise<void>((resolve) => {
        departLanding(() => {
          tourDriveAskRef.current = true;
          try {
            ask(TOUR_DESIGN_ASK);
            designAskSentRef.current = true;
          } finally {
            tourDriveAskRef.current = false;
          }
          resolve();
        });
      });
      await waitUntil(() => {
        const list = entriesRef.current;
        if (list.length <= before) return false;
        const last = [...list].reverse().find((e) => !e.pending && e.choices && e.choices.length > 0);
        return Boolean(last);
      }, 60000);
      return;
    }
    if (prepare === "expand-history") {
      setHistoryCollapsed(false);
      return;
    }
    if (prepare === "select-table") {
      if (tableAskSentRef.current
        || nodesRef.current.some((n) => n.kind === "app" && n.appId === "plyworks" && !n.hidden)) {
        tableAskSentRef.current = true;
        const ply = nodesRef.current.find((n) => n.kind === "app" && n.appId === "plyworks" && !n.hidden);
        if (ply) {
          setAppNodeId(ply.id);
          focusTargets([ply.id], studioViewport());
        }
        return;
      }
      tourDriveAskRef.current = true;
      try {
        ask(TOUR_TABLE_ASK);
        tableAskSentRef.current = true;
      } finally {
        tourDriveAskRef.current = false;
      }
      await waitUntil(() => {
        const ply = nodesRef.current.find((n) => n.kind === "app" && n.appId === "plyworks" && !n.hidden);
        if (!ply) return false;
        setAppNodeId(ply.id);
        return true;
      }, 60000);
      const ply = nodesRef.current.find((n) => n.kind === "app" && n.appId === "plyworks" && !n.hidden);
      if (ply) {
        focusTargets([ply.id], studioViewport());
      }
      await delay(400);
      return;
    }
    if (prepare === "focus-plyworks-produce") {
      const ply = nodesRef.current.find((n) => n.kind === "app" && n.appId === "plyworks" && !n.hidden);
      if (ply) {
        setAppNodeId(ply.id);
        show(ply.id);
        focusTargets([ply.id], studioViewport());
      }
      await waitUntil(() => Boolean(document.querySelector(".pw-corner-chip.is-produce")), 20000);
      const btn = document.querySelector(".pw-corner-chip.is-produce") as HTMLButtonElement | null;
      if (btn && !btn.disabled) btn.click();
      // Live Produce may open JoinWiz; wait briefly, then continue even if produce backend is slow.
      await waitUntil(() => {
        const jw = nodesRef.current.find((n) => n.kind === "app" && n.appId === "plyworks-jw" && !n.hidden);
        if (jw) {
          setAppNodeId(jw.id);
          focusTargets([jw.id], studioViewport());
          return true;
        }
        return false;
      }, 25000);
      return;
    }
    if (prepare === "windows-demo") {
      setOverviewOpen(true);
      await delay(400);
      const apps = nodesRef.current.filter((n) => (
        n.kind === "app"
        && !n.hidden
        && n.id !== CONCIERGE_ID
      ));
      for (const app of apps.slice(0, 2)) {
        hide(app.id);
        await delay(450);
        show(app.id);
        await delay(300);
      }
      tile();
      await delay(400);
      // Keep the Windows menu open so the spotlight covers trigger + full panel.
      setOverviewOpen(true);
      await delay(200);
      return;
    }
    if (prepare === "dock-concierge") {
      closeChromeMenus();
      setOverviewOpen(false);
      if (atLandingRef.current) {
        await new Promise<void>((resolve) => {
          departLanding(() => resolve());
        });
      }
      zoomConcierge();
      await delay(200);
      return;
    }
    const staffAsk = staffTourAsk(topicRef.current, prepare);
    if (staffAsk) {
      closeChromeMenus();
      setOverviewOpen(false);
      const existing = nodesRef.current.find((n) => n.kind === "app" && n.appId === staffAsk.app && !n.hidden);
      if (existing && staffAskSentRef.current.has(staffAsk.query)) {
        setAppNodeId(existing.id);
        focusTargets([existing.id], studioViewport());
        return;
      }
      const sendChip = () => {
        tourDriveAskRef.current = true;
        try {
          // WAITING MODEL: canned role chip; Concierge get/open should open this app
          ask(staffAsk.query);
          staffAskSentRef.current.add(staffAsk.query);
        } finally {
          tourDriveAskRef.current = false;
        }
      };
      if (atLandingRef.current) {
        await new Promise<void>((resolve) => {
          departLanding(() => {
            sendChip();
            resolve();
          });
        });
      } else {
        sendChip();
      }
      await waitUntil(() => {
        const node = nodesRef.current.find((n) => n.kind === "app" && n.appId === staffAsk.app && !n.hidden);
        if (!node) return false;
        setAppNodeId(node.id);
        return true;
      }, 60000);
      const node = nodesRef.current.find((n) => n.kind === "app" && n.appId === staffAsk.app && !n.hidden);
      if (node) focusTargets([node.id], studioViewport());
      await delay(400);
      return;
    }
    if (prepare === "open-boxouts") findOrOpenApp("boxouts");
    if (prepare === "open-simpleparts") findOrOpenApp("simpleparts");
    if (prepare === "open-plyworks") findOrOpenApp("plyworks");
  }, [
    ask,
    departLanding,
    findOrOpenApp,
    focusTargets,
    hide,
    returnToLanding,
    setHistoryCollapsed,
    setOverviewOpen,
    show,
    tile,
    zoomConcierge,
  ]);

  const runStepPrepare = useCallback(async (catalog: HelpStep[], index: number) => {
    const target = catalog[index];
    if (!target?.prepare) {
      setPending(false);
      return;
    }
    const gen = ++prepGenRef.current;
    if (target.awaitPrepare) setPending(true);
    try {
      await runPrepare(target.prepare);
    } finally {
      if (gen === prepGenRef.current) setPending(false);
    }
  }, [runPrepare]);

  const minimizeOnScreen = useCallback(() => {
    dismissMaximize(true);
    setOverviewOpen(false);
    closeChromeMenus();
    for (const n of nodesRef.current) {
      if (n.id === CONCIERGE_ID || n.kind === "log") continue;
      if (!n.hidden) hide(n.id);
    }
  }, [dismissMaximize, hide, setOverviewOpen]);

  const paintOffer = useCallback((query = HELP_PLEASE) => {
    appendConciergeTurn(query, HELP_OFFER_REPLY, { helpOffer: [...HELP_OFFER_CHIPS] });
    setPhase("offering");
    setTopic(null);
    setStepIndex(0);
    setAppNodeId(null);
  }, [appendConciergeTurn]);

  const offerHelp = useCallback((query = HELP_PLEASE) => {
    minimizeOnScreen();
    createSession();
    if (atLandingRef.current) {
      departLanding(() => paintOffer(query));
      return;
    }
    paintOffer(query);
  }, [createSession, departLanding, minimizeOnScreen, paintOffer]);

  const offerTourRoles = useCallback((query = HELP_OFFER_LABEL.tour) => {
    const paint = () => {
      appendConciergeTurn(query, SUPERUSER_TOUR_REPLY, { helpTourRoles: [...SUPERUSER_TOUR_ROLES] });
      phaseRef.current = "choosing-tour";
      setPhase("choosing-tour");
      setTopic(null);
    };
    if (atLandingRef.current) {
      departLanding(() => paint());
      return;
    }
    paint();
  }, [appendConciergeTurn, departLanding]);

  const startRoleTour = useCallback((topic?: LiveTourRole) => {
    const topicId = topic ?? tourTopicForRole(session?.role);
    if (!topicId) {
      if (session?.role === "superuser") {
        offerTourRoles();
        return;
      }
      appendConciergeTurn(HELP_OFFER_LABEL.tour, TOUR_STUB_REPLY);
      setPhase("idle");
      return;
    }
    prepGenRef.current += 1;
    setPending(false);
    setTourBooting(true);
    phaseRef.current = "idle";
    setPhase("idle");
    tourSnapRef.current = captureTourSnapshot();
    userTourRef.current = true;
    designAskSentRef.current = false;
    tableAskSentRef.current = false;
    staffAskSentRef.current = new Set();
    clearNetworkTourOpen();
    closeChromeMenus();
    setOverviewOpen(false);
    dismissMaximize(true);
    setHistoryCollapsed(true);

    const beginTour = () => {
      if (!userTourRef.current) return;
      setTourBooting(false);
      setHistoryCollapsed(true);
      setTopic(topicId);
      setStepIndex(0);
      setAppNodeId(null);
      setIframeReady(false);
      setPhase("touring");
      void runStepPrepare(tourFor(topicId), 0);
    };

    // From Help chat (docked): close the thread, collapse the rail, return to hero, then start.
    if (!atLandingRef.current) {
      returnToLanding();
      setHistoryCollapsed(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wait = reduce ? 50 : PAIR_FADE_MS + PAIR_SHAPE_MS + HERO_LEAVE_MS;
      window.setTimeout(() => {
        void (async () => {
          await waitUntil(
            () => Boolean(document.querySelector('.studio-hero [data-help="concierge"]')),
            4000,
          );
          setHistoryCollapsed(true);
          beginTour();
        })();
      }, wait);
      return;
    }

    beginTour();
  }, [
    appendConciergeTurn,
    captureTourSnapshot,
    dismissMaximize,
    offerTourRoles,
    returnToLanding,
    runStepPrepare,
    session?.role,
    setHistoryCollapsed,
    setOverviewOpen,
  ]);

  const pickOffer = useCallback((id: HelpOfferId) => {
    if (id === "tour") {
      if (session?.role === "superuser") {
        offerTourRoles();
        return;
      }
      if (tourTopicForRole(session?.role)) {
        startRoleTour();
        return;
      }
      phaseRef.current = "idle";
      setPhase("idle");
      setTopic(null);
      appendConciergeTurn(HELP_OFFER_LABEL.tour, TOUR_STUB_REPLY);
      return;
    }
    phaseRef.current = "idle";
    setPhase("idle");
    setTopic(null);
    ask(HELP_OFFER_LABEL.capabilities);
  }, [appendConciergeTurn, ask, offerTourRoles, session?.role, startRoleTour]);

  const pickTopic = useCallback((nextTopic: HelpTopicId) => {
    const catalog = tourFor(nextTopic);
    if (!catalog.length) return;
    appendConciergeTurn(HELP_TOPIC_LABEL[nextTopic], `Let's walk through ${HELP_TOPIC_LABEL[nextTopic]}.`);
    userTourRef.current = false;
    setTopic(nextTopic);
    setStepIndex(0);
    setPhase("touring");
    void runStepPrepare(catalog, 0);
  }, [appendConciergeTurn, runStepPrepare]);

  const startHelp = useCallback(() => {
    if (phaseRef.current !== "idle") stop();
    offerHelp();
  }, [offerHelp, stop]);

  const next = useCallback(() => {
    if (pending) return;
    const catalog = topicRef.current ? tourFor(topicRef.current) : [];
    const current = catalog[stepIndexRef.current];
    if (current?.handoff === "plyworks-native") {
      setIframeReady(false);
      setPhase("iframe");
      return;
    }
    const upcoming = stepIndexRef.current + 1;
    if (upcoming >= catalog.length) {
      stop();
      return;
    }
    setStepIndex(upcoming);
    void runStepPrepare(catalog, upcoming);
  }, [pending, runStepPrepare, stop]);

  const back = useCallback(() => {
    if (pending) return;
    if (stepIndexRef.current <= 0) {
      if (userTourRef.current) return;
      setPhase("offering");
      setTopic(null);
      setAppNodeId(null);
      return;
    }
    const upcoming = stepIndexRef.current - 1;
    const catalog = topicRef.current ? tourFor(topicRef.current) : [];
    setStepIndex(upcoming);
    // Chrome prepares only — do not rewind live Concierge side effects.
    const prep = catalog[upcoming]?.prepare;
    if (prep === "account-open" || prep === "look-open" || prep === "chrome-close" || prep === "network-open" || prep === "ensure-hero" || prep === "expand-history" || prep === "overview-open" || prep === "ask-design-something" || prep === "dock-concierge") {
      void runStepPrepare(catalog, upcoming);
    } else {
      closeChromeMenus();
      setPending(false);
    }
  }, [pending, runStepPrepare]);

  const onPlyworksDone = useCallback(() => {
    stop();
  }, [stop]);

  const onPlyworksReady = useCallback(() => {
    setIframeReady(true);
  }, []);

  useEffect(() => {
    setHelpAskHandler((query) => {
      const current = phaseRef.current;
      if (current === "choosing-tour") {
        const role = matchTourRoleChoice(query);
        if (role) {
          startRoleTour(role);
          return true;
        }
        phaseRef.current = "idle";
        setPhase("idle");
        return false;
      }
      if (current === "offering") {
        const choice = matchHelpOfferChoice(query);
        if (choice) {
          pickOffer(choice);
          return true;
        }
        phaseRef.current = "idle";
        setPhase("idle");
        return false;
      }
      if (current === "touring" || current === "iframe") {
        // Block user Concierge input during the guided tour; allow tour-driven asks.
        if (tourDriveAskRef.current) return false;
        return true;
      }
      const intent = matchHelpIntent(query);
      if (!intent) return false;
      offerHelp(query);
      return true;
    });
    return () => setHelpAskHandler(null);
  }, [offerHelp, pickOffer, startRoleTour]);

  useEffect(() => {
    if (phase !== "offering" && phase !== "choosing-tour" && phase !== "touring" && phase !== "iframe") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea")) return;
      e.preventDefault();
      stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stop]);

  const value = useMemo<HelpCtx>(() => ({
    phase,
    topic,
    stepIndex,
    steps,
    step,
    appNodeId,
    iframeReady,
    pending,
    tourBooting,
    startHelp,
    startRoleTour,
    offerHelp,
    pickOffer,
    pickTopic,
    next,
    back,
    stop,
    onPlyworksDone,
    onPlyworksReady,
  }), [phase, topic, stepIndex, steps, step, appNodeId, iframeReady, pending, tourBooting, startHelp, startRoleTour, offerHelp, pickOffer, pickTopic, next, back, stop, onPlyworksDone, onPlyworksReady]);

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used inside HelpProvider");
  return ctx;
}

export function useHelpOptional() {
  return useContext(HelpContext);
}

export function measureAnchor(anchor: HelpAnchor, appNodeId?: string | null, pad = 8) {
  const els: HTMLElement[] = [];
  const primary = queryHelpAnchor(anchor, appNodeId);
  if (primary) els.push(primary);
  // Account / Settings / Windows: include the open menu panel in the spotlight.
  if (anchor.type === "help" && anchor.id === "chrome-account") {
    const panel = document.querySelector('[data-help="chrome-account-panel"]') as HTMLElement | null;
    if (panel) els.push(panel);
  }
  if (anchor.type === "help" && anchor.id === "chrome-settings") {
    const panel = document.querySelector('[data-help="chrome-settings-panel"]') as HTMLElement | null;
    if (panel) els.push(panel);
  }
  if (anchor.type === "help" && (anchor.id === "overview" || anchor.id === "chrome-windows")) {
    const trigger = document.querySelector('[data-help="chrome-windows"], .chrome-windows') as HTMLElement | null;
    if (trigger && !els.includes(trigger)) els.push(trigger);
    const panel = document.querySelector('[data-help="overview-panel"]') as HTMLElement | null;
    if (panel) els.push(panel);
  }
  // Network: include expanded "online" label when tour-forced open.
  if (anchor.type === "help" && anchor.id === "chrome-network") {
    const copy = document.querySelector(".chrome-status.is-tour-open .chrome-status-copy") as HTMLElement | null;
    if (copy) els.push(copy);
  }
  if (!els.length) return null;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of els) {
    const box = el.getBoundingClientRect();
    top = Math.min(top, box.top);
    left = Math.min(left, box.left);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  return {
    top: top - pad,
    left: left - pad,
    width: Math.max(24, right - left + pad * 2),
    height: Math.max(24, bottom - top + pad * 2),
  };
}
