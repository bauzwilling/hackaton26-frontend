import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { CHAT_MOVE } from "../components/kit";
import { CHAT_RAIL_W, CHAT_SIDEBAR_W, MAX_STORED_CHATS, PAIR_SHAPE_MS, pastSessions, relativeSessionTime, useWorkspace, type ChatSession } from "../context/workspace";

const WIDTH_S = 0.28;
const HEIGHT_S = 0.34;
const STAGGER = 0.07;
const EASE = CHAT_MOVE.ease;
const DOT_NAME = 22;

function truncName(title: string) {
  const t = title.trim();
  if (t.length <= DOT_NAME) return t;
  return `${t.slice(0, DOT_NAME - 1)}…`;
}

function IconPanel({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`session-panel-icon${filled ? " is-filled" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden
    >
      {filled && (
        <path className="session-panel-icon-side" d="M5 4h4v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      )}
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function SessionRow({
  session,
  active,
  show,
  index,
  count: _count,
  onOpen,
  onRename,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  show: boolean;
  index: number;
  count: number;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function commitRename() {
    onRename(draft);
    setEditing(false);
  }

  if (confirm) {
    return (
      <motion.li
        className={`session-row is-confirm${active ? " is-active" : ""}`}
        initial={false}
        animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.1, delay: show ? index * STAGGER : 0, ease: EASE }}
      >
        <p className="session-confirm-copy">Delete this chat?</p>
        <div className="session-confirm-actions">
          <button type="button" className="session-text-btn" onClick={() => setConfirm(false)}>Back</button>
          <button type="button" className="session-text-btn is-danger" onClick={onDelete}>Delete</button>
        </div>
      </motion.li>
    );
  }

  return (
    <motion.li
      className={`session-row${active ? " is-active" : ""}`}
      initial={false}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.1, delay: show ? index * STAGGER : 0, ease: EASE }}
    >
      {editing ? (
        <input
          ref={input}
          className="session-rename"
          value={draft}
          aria-label="Rename"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(session.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button type="button" className="session-row-hit" onClick={onOpen}>
          <span className="session-title">{session.title}</span>
          <span className="session-when">{relativeSessionTime(session.updatedAt)}</span>
        </button>
      )}
      {!editing && (
        <div className="session-row-tools">
          <button type="button" className="session-icon-btn" title="Rename" aria-label="Rename" onClick={() => { setDraft(session.title); setEditing(true); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button type="button" className="session-icon-btn" title="Delete" aria-label="Delete" onClick={() => setConfirm(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
        </div>
      )}
    </motion.li>
  );
}

export type RailPair = { dir: "open" | "close"; step: "fade" | "shape" | "in" } | null;

function railExpanded(
  docked: boolean,
  peek: boolean,
  historyCollapsed: boolean,
  pair: RailPair,
) {
  if (pair?.dir === "open") return pair.step === "fade";
  if (pair?.dir === "close") return pair.step === "shape";
  return docked ? !historyCollapsed : peek;
}

export function SessionRail({
  docked,
  peek,
  pair = null,
  onPeekChange,
  onRailWidth,
}: {
  docked: boolean;
  peek: boolean;
  pair?: RailPair;
  onPeekChange: (open: boolean) => void;
  onRailWidth: (width: number) => void;
}) {
  const {
    sessions,
    activeSessionId,
    historyCollapsed,
    setHistoryCollapsed,
    switchSession,
    renameSession,
    deleteSession,
    clearPastSessions,
  } = useWorkspace();
  const reduce = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const boot = useRef(true);
  const wasDocked = useRef(docked);
  const listed = pastSessions(sessions);
  const canClearPast = sessions.some((s) => s.id !== activeSessionId);
  const [clearConfirm, setClearConfirm] = useState(false);
  const expanded = railExpanded(docked, peek, historyCollapsed, pair);
  const filled = docked && expanded && !pair;
  const [tallH, setTallH] = useState(480);
  const [showChats, setShowChats] = useState(expanded);
  const tallHRef = useRef(tallH);
  tallHRef.current = tallH;

  useEffect(() => {
    if (!showChats) setClearConfirm(false);
  }, [showChats]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setTallH(Math.max(CHAT_RAIL_W, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (docked || (expanded && showChats)) el.style.height = `${tallH}px`;
  }, [tallH, expanded, showChats, docked]);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const id = ++seq.current;
    const live = () => seq.current === id;
    const w = expanded ? CHAT_SIDEBAR_W : CHAT_RAIL_W;
    const leavingDock = wasDocked.current && !docked;
    wasDocked.current = docked;
    const shapeS = pair ? PAIR_SHAPE_MS / 1000 : expanded ? WIDTH_S : HEIGHT_S;

    if (boot.current || reduce) {
      boot.current = false;
      el.style.width = `${w}px`;
      el.style.height = `${docked || expanded ? tallHRef.current : CHAT_RAIL_W}px`;
      el.style.opacity = docked || expanded ? "1" : "0";
      setShowChats(expanded);
      onRailWidth(w);
      return;
    }

    if (pair?.step === "fade") {
      setShowChats(false);
      onRailWidth(w);
      return;
    }

    if (pair?.step === "in") return;

    if (docked) {
      setShowChats(false);
      onRailWidth(w);
      void (async () => {
        await animate(el, { width: w, height: tallHRef.current, opacity: 1 }, { duration: shapeS, ease: EASE });
        if (!live()) return;
        if (expanded && pair?.step !== "shape") setShowChats(true);
      })();
      return;
    }

    if (expanded) {
      setShowChats(false);
      onRailWidth(CHAT_SIDEBAR_W);
      void (async () => {
        if (leavingDock) {
          el.style.width = `${CHAT_SIDEBAR_W}px`;
          el.style.height = `${tallHRef.current}px`;
          el.style.opacity = "1";
          setShowChats(true);
          return;
        }
        await animate(el, { width: CHAT_SIDEBAR_W, height: CHAT_RAIL_W, opacity: 1 }, { duration: WIDTH_S, ease: EASE });
        if (!live()) return;
        setShowChats(true);
        await animate(el, { height: tallHRef.current }, { duration: HEIGHT_S, ease: EASE });
      })();
      return;
    }

    setShowChats(false);
    void (async () => {
      await animate(el, { height: CHAT_RAIL_W }, { duration: HEIGHT_S, ease: EASE });
      if (!live()) return;
      await animate(el, { width: CHAT_RAIL_W, opacity: 0 }, { duration: WIDTH_S, ease: EASE });
      if (!live()) return;
      onRailWidth(CHAT_RAIL_W);
    })();
  }, [expanded, docked, reduce, onRailWidth, pair]);

  useEffect(() => {
    if (docked || !peek) return;
    function onDoc(e: Event) {
      const t = e.target as HTMLElement;
      if (host.current?.contains(t)) return;
      if (t.closest?.(".help-overlay, .help-fab")) return;
      onPeekChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onPeekChange(false);
    }
    const arm = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDoc);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [docked, peek, onPeekChange]);

  function onToggle() {
    if (docked) setHistoryCollapsed(!historyCollapsed);
    else onPeekChange(!peek);
  }

  const open = expanded || showChats;
  const showDots = docked && !expanded && listed.length > 0 && pair?.step !== "shape";
  const label = !open
    ? (docked ? "Open sidebar" : "Open history")
    : docked
      ? "Close sidebar"
      : "Close history";

  return (
    <div
      ref={host}
      className={`session-rail${docked ? " is-docked" : ""}${open ? " is-open" : ""}`}
      data-help="session-history"
    >
      <button
        type="button"
        className={`chrome-icon studio-tool session-rail-icon${filled ? " is-on" : ""}`}
        title={label}
        aria-label={label}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <IconPanel filled={filled} />
      </button>
      {showChats && (
        <div className="session-rail-clear">
          {clearConfirm ? (
            <div className="session-rail-clear-confirm">
              <button type="button" className="session-text-btn" onClick={() => setClearConfirm(false)}>Back</button>
              <button
                type="button"
                className="session-text-btn is-danger"
                onClick={() => {
                  clearPastSessions();
                  setClearConfirm(false);
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="session-icon-btn"
              title="Clear all chats"
              aria-label="Clear all chats"
              disabled={!canClearPast}
              onClick={() => setClearConfirm(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </div>
      )}
      {listed.length > 0 && (
        <ul className="session-rail-dots" aria-hidden={!showDots} aria-label="Chat history">
          {listed.map((s) => (
            <li key={s.id}>
              <span
                className={`session-rail-dot${docked && s.id === activeSessionId ? " is-active" : ""}`}
                aria-label={truncName(s.title)}
              >
                <span className="session-rail-dot-tip">{truncName(s.title)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        ref={panel}
        className={`session-rail-panel${docked ? " is-docked" : ""}`}
      >
        <div className="session-rail-body" style={{ width: CHAT_SIDEBAR_W, minWidth: CHAT_SIDEBAR_W }}>
        {listed.length === 0 ? (
          <motion.p
            className="session-history-empty"
            initial={false}
            animate={showChats ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.1, ease: EASE }}
          >
            Start a new chat to see it here.
          </motion.p>
        ) : (
          <ul className="session-list">
            {listed.map((s, i) => (
              <SessionRow
                key={s.id}
                session={s}
                active={docked && s.id === activeSessionId}
                show={showChats}
                index={i}
                count={listed.length}
                onOpen={() => switchSession(s.id)}
                onRename={(title) => renameSession(s.id, title)}
                onDelete={() => deleteSession(s.id)}
              />
            ))}
            {import.meta.env.DEV && listed.length >= MAX_STORED_CHATS && (
              <li
                className="session-history-cap"
                style={{ opacity: showChats ? 1 : 0 }}
              >
                In dev mode, app only stores {MAX_STORED_CHATS} chats at most.
              </li>
            )}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}
