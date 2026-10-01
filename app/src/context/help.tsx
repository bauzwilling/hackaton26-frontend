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
import {
  CONCIERGE_ID,
  useWorkspace,
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
  queryHelpAnchor,
  setHelpAskHandler,
  tourFor,
  TOUR_STUB_REPLY,
  type HelpAnchor,
  type HelpOfferId,
  type HelpPhase,
  type HelpPrepare,
  type HelpStep,
  type HelpTopicId,
} from "../lib/help";

export type HelpCtx = {
  phase: HelpPhase;
  topic: HelpTopicId | null;
  stepIndex: number;
  steps: HelpStep[];
  step: HelpStep | null;
  appNodeId: string | null;
  iframeReady: boolean;
  startHelp: () => void;
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

export function HelpProvider({ children }: { children: ReactNode }) {
  const {
    nodes,
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
  } = useWorkspace();

  const [phase, setPhase] = useState<HelpPhase>("idle");
  const [topic, setTopic] = useState<HelpTopicId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [appNodeId, setAppNodeId] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const topicRef = useRef(topic);
  topicRef.current = topic;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const atLandingRef = useRef(atLanding);
  atLandingRef.current = atLanding;

  const steps = topic ? tourFor(topic) : [];
  const step = phase === "touring" || (phase === "iframe" && !iframeReady)
    ? (steps[stepIndex] ?? null)
    : null;

  // Kept for a later tour pass (prepare steps). Do not call from the Help offer.
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

  const runPrepare = useCallback((prepare?: HelpPrepare) => {
    if (!prepare) return;
    if (prepare === "focus-concierge") {
      zoomConcierge();
      return;
    }
    if (prepare === "focus-log") {
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
      const toggle = document.querySelector(".viz-toggle") as HTMLButtonElement | null;
      const open = document.querySelector(".viz-panel");
      if (toggle && !open) toggle.click();
      return;
    }
    if (prepare === "open-boxouts") findOrOpenApp("boxouts");
    if (prepare === "open-simpleparts") findOrOpenApp("simpleparts");
    if (prepare === "open-plyworks") findOrOpenApp("plyworks");
  }, [findOrOpenApp, setOverviewOpen, zoomConcierge]);

  const stop = useCallback(() => {
    setPhase("idle");
    setTopic(null);
    setStepIndex(0);
    setAppNodeId(null);
    setIframeReady(false);
    setOverviewOpen(false);
    closeLookPanel();
  }, [setOverviewOpen]);

  const minimizeOnScreen = useCallback(() => {
    dismissMaximize(true);
    setOverviewOpen(false);
    closeLookPanel();
    for (const n of nodesRef.current) {
      if (n.id === CONCIERGE_ID || n.kind === "log") continue;
      if (!n.hidden) hide(n.id);
    }
  }, [dismissMaximize, hide, setOverviewOpen]);

  const paintOffer = useCallback((query = HELP_PLEASE) => {
    // Never focus/unhide the canvas Concierge — docked thread owns help.
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

  const pickOffer = useCallback((id: HelpOfferId) => {
    if (id === "tour") {
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
  }, [appendConciergeTurn, ask]);

  const pickTopic = useCallback((nextTopic: HelpTopicId) => {
    // Tour overlay path retained for a later pass — not started from the Help offer.
    const catalog = tourFor(nextTopic);
    if (!catalog.length) return;
    appendConciergeTurn(HELP_TOPIC_LABEL[nextTopic], `Let's walk through ${HELP_TOPIC_LABEL[nextTopic]}.`);
    setTopic(nextTopic);
    setStepIndex(0);
    setPhase("touring");
    runPrepare(catalog[0]?.prepare);
  }, [appendConciergeTurn, runPrepare]);

  const startHelp = useCallback(() => {
    // One-shot: always open a fresh Help offer. No exit-help toggle on the FAB.
    if (phaseRef.current !== "idle") stop();
    offerHelp();
  }, [offerHelp, stop]);

  const next = useCallback(() => {
    const catalog = topicRef.current ? tourFor(topicRef.current) : [];
    const current = catalog[stepIndex];
    if (current?.handoff === "plyworks-native") {
      setIframeReady(false);
      setPhase("iframe");
      return;
    }
    const upcoming = stepIndex + 1;
    if (upcoming >= catalog.length) {
      stop();
      return;
    }
    setStepIndex(upcoming);
    runPrepare(catalog[upcoming]?.prepare);
  }, [runPrepare, stepIndex, stop]);

  const back = useCallback(() => {
    if (stepIndex <= 0) {
      setPhase("offering");
      setTopic(null);
      setAppNodeId(null);
      return;
    }
    const upcoming = stepIndex - 1;
    const catalog = topicRef.current ? tourFor(topicRef.current) : [];
    setStepIndex(upcoming);
    runPrepare(catalog[upcoming]?.prepare);
  }, [runPrepare, stepIndex]);

  const onPlyworksDone = useCallback(() => {
    stop();
  }, [stop]);

  const onPlyworksReady = useCallback(() => {
    setIframeReady(true);
  }, []);

  useEffect(() => {
    setHelpAskHandler((query) => {
      const current = phaseRef.current;
      if (current === "offering") {
        const choice = matchHelpOfferChoice(query);
        if (choice) {
          pickOffer(choice);
          return true;
        }
        // Let normal Concierge handle unrelated follow-ups.
        phaseRef.current = "idle";
        setPhase("idle");
        return false;
      }
      if (current === "touring" || current === "iframe") {
        const intent = matchHelpIntent(query);
        if (!intent) return false;
        stop();
        window.setTimeout(() => offerHelp(query), 0);
        return true;
      }
      const intent = matchHelpIntent(query);
      if (!intent) return false;
      offerHelp(query);
      return true;
    });
    return () => setHelpAskHandler(null);
  }, [offerHelp, pickOffer, stop]);

  useEffect(() => {
    if (phase !== "offering" && phase !== "touring" && phase !== "iframe") return;
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
    startHelp,
    offerHelp,
    pickOffer,
    pickTopic,
    next,
    back,
    stop,
    onPlyworksDone,
    onPlyworksReady,
  }), [phase, topic, stepIndex, steps, step, appNodeId, iframeReady, startHelp, offerHelp, pickOffer, pickTopic, next, back, stop, onPlyworksDone, onPlyworksReady]);

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
  const el = queryHelpAnchor(anchor, appNodeId);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return {
    top: box.top - pad,
    left: box.left - pad,
    width: Math.max(24, box.width + pad * 2),
    height: Math.max(24, box.height + pad * 2),
  };
}
