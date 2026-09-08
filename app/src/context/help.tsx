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
  LOG_ID,
  WORKSPACE_APPS,
  useWorkspace,
  type WorkspaceApp,
} from "./workspace";
import { hasApp } from "../lib/auth";
import {
  HELP_APP_TOPICS,
  HELP_TOPIC_LABEL,
  HELP_ZOOM_MAX,
  matchHelpIntent,
  matchHelpTopic,
  queryHelpAnchor,
  setHelpAskHandler,
  tourFor,
  type HelpAnchor,
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

function licensedHelpTopics(session: ReturnType<typeof useSession>["session"]): HelpTopicId[] {
  const topics: HelpTopicId[] = ["studio"];
  for (const id of HELP_APP_TOPICS) {
    const meta = WORKSPACE_APPS.find((a) => a.id === id);
    if (meta?.licensed && !hasApp(session, meta.licensed)) continue;
    topics.push(id);
  }
  return topics;
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const {
    nodes,
    ensureConcierge,
    focusTargets,
    appendConciergeTurn,
    openApp,
    show,
    setOverviewOpen,
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

  const steps = topic ? tourFor(topic) : [];
  const step = phase === "touring" || (phase === "iframe" && !iframeReady)
    ? (steps[stepIndex] ?? null)
    : null;

  const zoomConcierge = useCallback(() => {
    ensureConcierge();
    window.setTimeout(() => {
      focusTargets([LOG_ID, CONCIERGE_ID], studioViewport(), { maxZoom: HELP_ZOOM_MAX });
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
    const id = openApp(app, { parentId: CONCIERGE_ID, query: "Help" });
    if (id) {
      setAppNodeId(id);
      window.setTimeout(() => {
        focusTargets([id], studioViewport());
      }, 80);
    }
    return id;
  }, [focusTargets, openApp, show]);

  const runPrepare = useCallback((prepare?: HelpPrepare) => {
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
    const toggle = document.querySelector(".viz-toggle") as HTMLButtonElement | null;
    if (toggle && document.querySelector(".viz-panel")) toggle.click();
  }, [setOverviewOpen]);

  const offerHelp = useCallback((query = "Help") => {
    const topics = licensedHelpTopics(session);
    zoomConcierge();
    appendConciergeTurn(query, "What do you need help with?", { helpTopics: topics });
    setPhase("offering");
    setTopic(null);
    setStepIndex(0);
    setAppNodeId(null);
  }, [appendConciergeTurn, session, zoomConcierge]);

  const pickTopic = useCallback((nextTopic: HelpTopicId) => {
    const catalog = tourFor(nextTopic);
    if (!catalog.length) return;
    appendConciergeTurn(HELP_TOPIC_LABEL[nextTopic], `Let's walk through ${HELP_TOPIC_LABEL[nextTopic]}.`);
    setTopic(nextTopic);
    setStepIndex(0);
    setPhase("touring");
    runPrepare(catalog[0]?.prepare);
  }, [appendConciergeTurn, runPrepare]);

  const startHelp = useCallback(() => {
    if (phaseRef.current === "idle") offerHelp();
    else stop();
  }, [offerHelp, stop]);

  const next = useCallback(() => {
    const catalog = topicRef.current ? tourFor(topicRef.current) : [];
    const current = catalog[stepIndex];
    if (current?.handoff === "plyworks-iframe") {
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
      zoomConcierge();
      setPhase("offering");
      setTopic(null);
      setAppNodeId(null);
      return;
    }
    const upcoming = stepIndex - 1;
    const catalog = topicRef.current ? tourFor(topicRef.current) : [];
    setStepIndex(upcoming);
    runPrepare(catalog[upcoming]?.prepare);
  }, [runPrepare, stepIndex, zoomConcierge]);

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
        const matched = matchHelpTopic(query);
        if (matched) {
          pickTopic(matched);
          return true;
        }
        return false;
      }
      if (current === "touring" || current === "iframe") {
        const intent = matchHelpIntent(query);
        if (!intent) return false;
        stop();
        if (intent.kind === "topic") {
          window.setTimeout(() => pickTopic(intent.topic), 0);
        } else {
          window.setTimeout(() => offerHelp(query), 0);
        }
        return true;
      }
      const intent = matchHelpIntent(query);
      if (!intent) return false;
      if (intent.kind === "topic") pickTopic(intent.topic);
      else offerHelp(query);
      return true;
    });
    return () => setHelpAskHandler(null);
  }, [offerHelp, pickTopic, stop]);

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
    pickTopic,
    next,
    back,
    stop,
    onPlyworksDone,
    onPlyworksReady,
  }), [phase, topic, stepIndex, steps, step, appNodeId, iframeReady, startHelp, offerHelp, pickTopic, next, back, stop, onPlyworksDone, onPlyworksReady]);

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
