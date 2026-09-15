import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { HelpFab, PanHint } from "../canvas/HelpTour";
import { StudioBoard } from "../canvas/StudioBoard";
import { ConciergeThread } from "../canvas/Concierge";
import { Composer } from "../components/Composer";
import { CHAT_MOVE, LAND_FADE, LAYOUT_CHAT, Surface } from "../components/kit";
import { useSession } from "../context/session";
import { appLabel, CONCIERGE_ID, isWorkspaceApp, useWorkspace } from "../context/workspace";
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
  const { nodes, entries, ask, openApp, announceOpen, ingestFiles } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [dropping, setDropping] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const chips = useMemo(() => chipsFor(can(session, "orbit")), [session]);

  useEffect(() => {
    const app = params.get("app");
    if (!app || !isWorkspaceApp(app)) return;
    const id = openApp(app);
    if (!id) ask(`Open ${appLabel(app)}`);
    else announceOpen(app, id);
    const next = new URLSearchParams(params);
    next.delete("app");
    setParams(next, { replace: true });
  }, [params, openApp, announceOpen, ask, setParams]);

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
  const docked = hasWindows || entries.length > 0;
  const emptyHero = !docked;
  const [firstLand, setFirstLand] = useState(!docked);
  const [heroReady, setHeroReady] = useState(!docked);

  useEffect(() => {
    if (docked) setFirstLand(false);
  }, [docked]);

  useEffect(() => {
    if (docked) {
      setHeroReady(false);
      return;
    }
    if (firstLand) {
      setHeroReady(true);
      return;
    }
    const t = window.setTimeout(() => setHeroReady(true), reduce ? 0 : CHAT_MOVE.duration * 1000);
    return () => window.clearTimeout(t);
  }, [docked, firstLand, reduce]);

  useEffect(() => {
    if (!leaving) return;
    const wait = reduce
      ? 0
      : emptyHero
        ? (0.32 + (firstLand ? 4 : 3) * HERO_STAGGER) * 1000
        : 280;
    const t = window.setTimeout(onLeaveDone, wait);
    return () => window.clearTimeout(t);
  }, [leaving, emptyHero, firstLand, reduce, onLeaveDone]);

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

  return (
    <motion.div
      className={`studio${dropping ? " is-dropping" : ""}${leaving ? " is-leaving" : ""}${docked ? " is-chat-docked" : ""}`}
      data-help="studio-drop"
      ref={root}
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
        <motion.div
          layout
          className="studio-chat-col"
          transition={{ layout: reduce ? { duration: 0 } : CHAT_MOVE }}
        >
          {emptyHero && heroReady && (
            <>
              <HeroPiece delay={0} leaveDelay={firstLand ? 0.4 : 0.3} leaving={leaving && !reduce}>
                <p className="hero-kicker">The largest factory in the world</p>
              </HeroPiece>
              <HeroPiece delay={HERO_STAGGER} leaveDelay={firstLand ? 0.3 : 0.2} leaving={leaving && !reduce}>
                <h1 className="hero-title">From file to factory.</h1>
              </HeroPiece>
              <HeroPiece delay={HERO_STAGGER * 2} leaveDelay={firstLand ? 0.2 : 0.1} leaving={leaving && !reduce}>
                <p className="hero-lead">
                  Upload a design or just describe it. An AI concierge routes your request across our decentralized production network — thousands of machines acting as one factory — and gets it built. Anywhere.
                </p>
              </HeroPiece>
            </>
          )}
          {docked ? (
            <motion.div
              layout
              layoutId={LAYOUT_CHAT}
              className="studio-chat-card is-docked"
              data-help="concierge"
              transition={{ layout: reduce ? { duration: 0 } : CHAT_MOVE }}
            >
              <ConciergeThread />
              <Composer
                variant="panel"
                placeholder="Ask, or drop a file…"
              />
            </motion.div>
          ) : firstLand ? (
            <HeroPiece delay={HERO_STAGGER * 3} leaveDelay={HERO_STAGGER} leaving={leaving && !reduce}>
              <motion.div
                layout
                layoutId={LAYOUT_CHAT}
                className="studio-chat-card"
                data-help="concierge"
                transition={{ layout: reduce ? { duration: 0 } : CHAT_MOVE }}
              >
                <Composer variant="hero" autoFocus={emptyHero} />
              </motion.div>
            </HeroPiece>
          ) : (
            <motion.div
              layout
              layoutId={LAYOUT_CHAT}
              className="studio-chat-card"
              data-help="concierge"
              initial={false}
              animate={leaving && emptyHero && !reduce ? { opacity: 0, y: 56 } : { opacity: 1, y: 0 }}
              transition={
                leaving && emptyHero
                  ? { duration: 0.32, delay: HERO_STAGGER, ease: HERO_EASE }
                  : { layout: reduce ? { duration: 0 } : CHAT_MOVE }
              }
            >
              <Composer variant="hero" autoFocus={emptyHero && heroReady} />
            </motion.div>
          )}
          {emptyHero && heroReady && (
            <HeroPiece
              className="chips"
              delay={firstLand ? HERO_STAGGER * 4 : HERO_STAGGER * 3}
              leaveDelay={0}
              leaving={leaving && !reduce}
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
          )}
        </motion.div>
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
      <PanHint interactive={hasWindows} />
      <HelpFab />
    </motion.div>
  );
}
