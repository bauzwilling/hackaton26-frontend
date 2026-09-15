import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { HelpFab, PanHint } from "../canvas/HelpTour";
import { Overview } from "../canvas/Overview";
import { StudioBoard } from "../canvas/StudioBoard";
import { Composer } from "../components/Composer";
import { LAND_FADE, Surface } from "../components/kit";
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
const heroRise = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
  leave: { transition: { staggerChildren: 0.06, staggerDirection: -1, when: "afterChildren" as const } },
};
const heroRiseItem = {
  hidden: { opacity: 0, y: 56 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: HERO_EASE } },
  leave: { opacity: 0, y: 56, transition: { duration: 0.32, ease: HERO_EASE } },
};

function HeroRise({
  reduce, leaving, onLeaveDone, children,
}: {
  reduce: boolean | null;
  leaving: boolean;
  onLeaveDone: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onLeaveDone, reduce ? 0 : 520);
    return () => window.clearTimeout(t);
  }, [leaving, reduce, onLeaveDone]);
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial="hidden"
      animate={leaving ? "leave" : "show"}
      variants={heroRise}
      onAnimationComplete={(def) => {
        if (leaving && def === "leave") onLeaveDone();
      }}
    >
      {children}
    </motion.div>
  );
}

function HeroRiseItem({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={heroRiseItem}>
      {children}
    </motion.div>
  );
}

export function StudioPage() {
  const { session } = useSession();
  const reduce = useReducedMotion();
  const { leaving, onLeaveDone } = useOutletContext<StudioLeave>();
  const { nodes, ask, openApp, announceOpen, ingestFiles } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [viewport, setViewport] = useState({ width: 1200, height: 700 });
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
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      setViewport({ width: box.width, height: box.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const empty = nodes.length === 0;
  const conciergeUp = nodes.some((n) => n.id === CONCIERGE_ID && !n.hidden);
  const emptyHero = empty && !conciergeUp;

  useEffect(() => {
    if (!leaving) return;
    if (emptyHero && !reduce) return;
    const wait = reduce ? 0 : 280;
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

  return (
    <motion.div
      className={`studio${dropping ? " is-dropping" : ""}${leaving ? " is-leaving" : ""}`}
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
      {!conciergeUp && (
        empty ? (
          <div className="hero-chat">
            <HeroRise reduce={reduce} leaving={leaving} onLeaveDone={onLeaveDone}>
              <HeroRiseItem>
                <p className="hero-kicker">The largest factory in the world</p>
                <h1 className="hero-title">From file to factory.</h1>
                <p className="hero-lead">
                  Upload a design or just describe it. An AI concierge routes your request across our decentralized production network — thousands of machines acting as one factory — and gets it built. Anywhere.
                </p>
              </HeroRiseItem>
              <HeroRiseItem>
                <Composer variant="hero" autoFocus />
              </HeroRiseItem>
              <HeroRiseItem className="chips">
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
              </HeroRiseItem>
            </HeroRise>
          </div>
        ) : (
          <div className="hero-chat is-bare">
            <motion.div
              animate={leaving && !reduce ? { opacity: 0, y: 56 } : { opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: HERO_EASE }}
            >
              <Composer variant="hero" />
            </motion.div>
          </div>
        )
      )}
      <p className="studio-hint" data-help="studio-hint">
        Right-drag to pan
        <span aria-hidden="true"> · </span>
        Left-drag to select
        <span aria-hidden="true"> · </span>
        Delete to close apps
        <span aria-hidden="true"> · </span>
        Right-click for options
      </p>
      {dropping && (
        <div className="drop-overlay">
          <Surface className="drop-overlay-card">
            <p className="drop-overlay-title">Drop to structure</p>
            <p className="muted" style={{ margin: 0 }}>CSV, DXF, DWG, JPG, PNG, or PDF</p>
          </Surface>
        </div>
      )}
      <Overview viewport={viewport} />
      <PanHint empty={empty} conciergeUp={conciergeUp} />
      <HelpFab />
    </motion.div>
  );
}
