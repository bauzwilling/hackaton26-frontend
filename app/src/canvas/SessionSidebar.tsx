import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CHAT_MOVE, Surface } from "../components/kit";
import { pastSessions, relativeSessionTime, useWorkspace, type ChatSession } from "../context/workspace";

function IconPanel() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 8v5l3 2" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function SessionRow({
  session,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
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
      <li className={`session-row is-confirm${active ? " is-active" : ""}`}>
        <p className="session-confirm-copy">Delete this chat?</p>
        <div className="session-confirm-actions">
          <button type="button" className="session-text-btn" onClick={() => setConfirm(false)}>Back</button>
          <button type="button" className="session-text-btn is-danger" onClick={onDelete}>Delete</button>
        </div>
      </li>
    );
  }

  return (
    <li className={`session-row${active ? " is-active" : ""}`}>
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
    </li>
  );
}

export function SessionSidebar() {
  const {
    sessions,
    activeSessionId,
    historyCollapsed,
    setHistoryCollapsed,
    switchSession,
    renameSession,
    deleteSession,
  } = useWorkspace();
  const reduce = useReducedMotion();
  const listed = pastSessions(sessions);

  return (
    <motion.aside
      className={`session-sidebar${historyCollapsed ? " is-collapsed" : ""}`}
      data-help="session-history"
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: -16 }}
      transition={reduce ? { duration: 0 } : CHAT_MOVE}
    >
      <div className="session-sidebar-tools">
        <button
          type="button"
          className="session-icon-btn is-lg"
          title={historyCollapsed ? "Open history" : "Close history"}
          aria-label={historyCollapsed ? "Open history" : "Close history"}
          onClick={() => setHistoryCollapsed(!historyCollapsed)}
        >
          <IconPanel />
        </button>
      </div>
      {!historyCollapsed && (
        listed.length === 0 ? (
          <p className="session-history-empty">No earlier chats.</p>
        ) : (
          <ul className="session-list">
            {listed.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                onOpen={() => switchSession(s.id)}
                onRename={(title) => renameSession(s.id, title)}
                onDelete={() => deleteSession(s.id)}
              />
            ))}
          </ul>
        )
      )}
    </motion.aside>
  );
}

export function SessionHistory() {
  const {
    sessions,
    activeSessionId,
    switchSession,
    renameSession,
    deleteSession,
    resuming,
  } = useWorkspace();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listed = pastSessions(sessions);

  useEffect(() => {
    if (resuming) setOpen(false);
  }, [resuming]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as HTMLElement;
      if (box.current?.contains(t)) return;
      if (t.closest?.(".help-overlay, .help-fab")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const arm = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDoc);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="session-history is-hero" ref={box} data-help="session-history">
      <button
        type="button"
        className="chrome-icon studio-tool session-history-fab"
        title={open ? "Close history" : "Open history"}
        aria-label={open ? "Close history" : "Open history"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconHistory />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="session-history-pop"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <Surface className="session-history-card" role="dialog" aria-label="Chat history">
              {listed.length === 0 ? (
                <p className="session-history-empty">No earlier chats.</p>
              ) : (
                <ul className="session-list">
                  {listed.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      active={s.id === activeSessionId}
                      onOpen={() => {
                        setOpen(false);
                        switchSession(s.id);
                      }}
                      onRename={(title) => renameSession(s.id, title)}
                      onDelete={() => deleteSession(s.id)}
                    />
                  ))}
                </ul>
              )}
            </Surface>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
