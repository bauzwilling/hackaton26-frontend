import { useEffect, useMemo, useRef, useState, useCallback, type DragEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { HelpFab, PanHint } from "../canvas/HelpTour";
import { StudioBoard } from "../canvas/StudioBoard";
import { ConciergeThread } from "../canvas/Concierge";
import { SessionRail, type RailPair } from "../canvas/SessionSidebar";
import { Composer } from "../components/Composer";
import { CHAT_MOVE, LAND_FADE, Surface } from "../components/kit";
import { useSession } from "../context/session";
import { appLabel, CHAT_RAIL_W, CHAT_SIDEBAR_W, CHAT_THREAD_W, CONCIERGE_ID, HERO_LEAVE_MS, PAIR_FADE_MS, PAIR_SHAPE_MS, isWorkspaceApp, useWorkspace } from "../context/workspace";
import { chipsFor, TOUR_CHIP } from "../lib/catalog";
import { can } from "../lib/auth";

function isFileDrag(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export type StudioLeave = {
  leaving: boolean;
  onLeaveDone: () => void;
};

const HERO_EASE = [0.22, 1, 0.36, 1] as const;
const HERO_STAGGER = 0.1;

function HeroPiece({
  delay, leaveDelay = 0, leaving, className, children,
}: {
  delay: number;
  leaveDelay?: number;
  leaving?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate={leaving ? "leave" : "show"}
      variants={{
        hidden: { opacity: 0, y: 56 },
        show: { opacity: 1, y: 0, transition: { duration: 0.42, delay, ease: HERO_EASE } },
        leave: { opacity: 0, y: 56, transition: { duration: 0.32, delay: leaveDelay, ease: HERO_EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StudioPage() {
  const { session } = useSession();
  const reduce = useReducedMotion();
  const { leaving, onLeaveDone } = useOutletContext<StudioLeave>();
  const { nodes, entries, ask, openApp, announceOpen, ingestFiles, resuming, atLanding, departLanding } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [dropping, setDropping] = useState(false);
  const [historyPeek, setHistoryPeek] = useState(false);
  const [railW, setRailW] = useState(CHAT_RAIL_W);
  const onRailWidth = useCallback((w: number) => setRailW(w), []);
  const root = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const chips = useMemo(() => chipsFor(can(session, "orbit")), [session]);

  useEffect(() => {
    const app = params.get("app");
    if (!app || !isWorkspaceApp(app)) return;
    departLanding(() => {
      const id = openApp(app);
      if (!id) ask(`Open ${appLabel(app)}`);
      else announceOpen(app, id);
    });
    const next = new URLSearchParams(params);
    next.delete("app");
    setParams(next, { replace: true });
  }, [params, openApp, announceOpen, ask, setParams, departLanding]);

  useEffect(() => {
    const block = (e: globalThis.DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const hasWindows = nodes.some((n) => n.id !== CONCIERGE_ID && n.kind !== "log");
  const [chrome, setChrome] = useState<"hero" | "dock">("hero");
  const [heroLeaving, setHeroLeaving] = useState(false);
  const [pair, setPair] = useState<RailPair>(null);
  const [heroGen, setHeroGen] = useState(0);
  const wasLanding = useRef(true);
  const pairLock = useRef(false);
  const docked = chrome === "dock";
  const onHero = chrome === "hero";
  const emptyHero = onHero;
  const heroExit = (leaving || heroLeaving) && !reduce;
  const threadOpen = docked && (
    pair?.dir === "open" ? pair.step !== "fade" :
    pair?.dir === "close" ? pair.step === "fade" :
    true
  );
  const chatInk = threadOpen && pair?.step !== "fade" && pair?.step !== "shape";
  const threadMove = reduce
    ? { duration: 0 }
    : pair
      ? { type: "tween" as const, duration: PAIR_SHAPE_MS / 1000, ease: CHAT_MOVE.ease }
      : CHAT_MOVE;

  useEffect(() => {
    if (atLanding && !wasLanding.current) setHeroGen((n) => n + 1);
    wasLanding.current = atLanding;
  }, [atLanding]);

  useEffect(() => {
    if (!pair || reduce) return;
    const ms = pair.step === "shape" ? PAIR_SHAPE_MS : PAIR_FADE_MS;
    const t = window.setTimeout(() => {
      if (pair.step === "fade") {
        setPair({ dir: pair.dir, step: "shape" });
        return;
      }
      if (pair.step === "shape") {
        if (pair.dir === "close") {
          setPair(null);
          setChrome("hero");
          setHistoryPeek(true);
          return;
        }
        setPair({ dir: "open", step: "in" });
        return;
      }
      setPair(null);
    }, ms);
    return () => window.clearTimeout(t);
  }, [pair, reduce]);

  useEffect(() => {
    if (!(atLanding && !resuming)) {
      pairLock.current = false;
      return;
    }
    setHeroLeaving(false);
    if (chrome !== "dock") {
      pairLock.current = false;
      setChrome("hero");
      return;
    }
    if (reduce) {
      pairLock.current = false;
      setPair(null);
      setChrome("hero");
      setHistoryPeek(true);
      return;
    }
    if (!pair && !pairLock.current) {
      pairLock.current = true;
      setPair({ dir: "close", step: "fade" });
    }
  }, [atLanding, resuming, chrome, reduce, pair]);

  useEffect(() => {
    if (atLanding || chrome !== "hero") return;
    const fromPeek = historyPeek;
    setHeroLeaving(true);
    const wait = reduce ? 0 : HERO_LEAVE_MS;
    const t = window.setTimeout(() => {
      setHeroLeaving(false);
      if (fromPeek && !reduce) setPair({ dir: "open", step: "fade" });
      setChrome("dock");
    }, wait);
    return () => window.clearTimeout(t);
  }, [atLanding, chrome, reduce, historyPeek]);

  useEffect(() => {
    if (docked && !atLanding && !pair) setHistoryPeek(false);
  }, [docked, atLanding, pair]);

  useEffect(() => {
    if (!leaving) return;
    const wait = reduce
      ? 0
      : emptyHero
        ? (0.32 + 4 * HERO_STAGGER) * 1000
        : 280;
    const t = window.setTimeout(onLeaveDone, wait);
    return () => window.clearTimeout(t);
  }, [leaving, emptyHero, reduce, onLeaveDone]);

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDropping(true);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDropping(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) ingestFiles(files);
  }

  const chatW = docked ? railW + (threadOpen ? CHAT_THREAD_W : 0) : (railW === CHAT_SIDEBAR_W ? CHAT_SIDEBAR_W : 0);

  return (
    <motion.div
      className={`studio${dropping ? " is-dropping" : ""}${leaving ? " is-leaving" : ""}${docked ? " is-chat-docked" : ""}${historyPeek && !docked ? " is-history-peek" : ""}`}
      data-help="studio-drop"
      ref={root}
      style={{ ["--studio-chat-w" as string]: `${chatW}px` }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? { duration: 0 } : LAND_FADE}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <StudioBoard />
      <div className={`studio-chat-slot${docked ? " is-docked" : " is-center"}`}>
        <div className="studio-chat-col">
          {onHero && (
            <div key={heroGen} className="studio-hero">
              <HeroPiece delay={0} leaveDelay={0.4} leaving={heroExit}>
                <p className="hero-kicker">The largest factory in the world</p>
              </HeroPiece>
              <HeroPiece delay={HERO_STAGGER} leaveDelay={0.3} leaving={heroExit}>
                <h1 className="hero-title">From file to factory.</h1>
              </HeroPiece>
              <HeroPiece delay={HERO_STAGGER * 2} leaveDelay={0.2} leaving={heroExit}>
                <p className="hero-lead">
                  Upload a design or just describe it. An AI concierge routes your request across our decentralized production network — thousands of machines acting as one factory — and gets it built. Anywhere.
                </p>
              </HeroPiece>
              <HeroPiece delay={HERO_STAGGER * 3} leaveDelay={HERO_STAGGER} leaving={heroExit}>
                <div className="studio-chat-card" data-help="concierge">
                  <Composer variant="hero" autoFocus={onHero && !resuming && !heroLeaving} shareLayout={false} />
                </div>
              </HeroPiece>
              <HeroPiece
                className="chips"
                delay={HERO_STAGGER * 4}
                leaveDelay={0}
                leaving={heroExit}
              >
                {chips.map((c) => (
                  <Surface
                    key={c}
                    as="button"
                    type="button"
                    className={c === TOUR_CHIP ? "chip is-tour" : "chip"}
                    onClick={() => ask(c)}
                  >
                    {c}
                  </Surface>
                ))}
              </HeroPiece>
            </div>
          )}
          {docked && (
            <div className="studio-chat-dock">
              <div
                className="session-rail-gutter"
                style={{
                  width: railW,
                  flexBasis: railW,
                  transitionDuration: pair ? `${PAIR_SHAPE_MS}ms` : undefined,
                }}
                aria-hidden
              />
              <motion.div
                className="studio-chat-card is-docked"
                data-help="concierge"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: threadOpen ? CHAT_THREAD_W : 0 }}
                transition={threadMove}
              >
                <div
                  className={`studio-chat-stage${chatInk ? "" : " is-ink-off"}`}
                  style={{ width: CHAT_THREAD_W, minWidth: CHAT_THREAD_W }}
                >
                  <ConciergeThread />
                  <Composer
                    variant="panel"
                    placeholder="Ask, or drop a file…"
                    shareLayout={false}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
      {hasWindows && (
        <p className="studio-hint" data-help="studio-hint">
          Right-drag to pan
          <span aria-hidden="true"> · </span>
          Left-drag to select
          <span aria-hidden="true"> · </span>
          Delete to close apps
          <span aria-hidden="true"> · </span>
          Right-click for options
        </p>
      )}
      {dropping && (
        <div className="drop-overlay">
          <Surface className="drop-overlay-card">
            <p className="drop-overlay-title">Drop to structure</p>
            <p className="muted" style={{ margin: 0 }}>CSV, DXF, DWG, JPG, PNG, or PDF</p>
          </Surface>
        </div>
      )}
      {resuming && (
        <div className="session-resume" role="status" aria-live="polite" aria-label="Opening chat">
          <span className="session-resume-spin" />
        </div>
      )}
      <SessionRail
        docked={docked}
        peek={historyPeek}
        pair={pair}
        onPeekChange={setHistoryPeek}
        onRailWidth={onRailWidth}
      />
      <PanHint interactive={hasWindows} />
      <HelpFab />
    </motion.div>
  );
}
