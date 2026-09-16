import { useEffect, useRef, useState } from "react";
import { Composer } from "../components/Composer";
import { Surface } from "../components/kit";
import { plyworksDesignLabel } from "../lib/concierge";
import { HELP_TOPIC_LABEL, type HelpTopicId } from "../lib/help";
import {
  activityClock,
  activityFocusIds,
  activityName,
  appLabel,
  isActivityEntry,
  isRelayEntry,
  sessionIsEmpty,
  useWorkspace,
  type RequestEntry,
  type WorkspaceApp,
} from "../context/workspace";
import { useHelp } from "../context/help";

function replyOf(entry: RequestEntry) {
  return entry.reply ?? entry.routeWhy ?? "Answered on the canvas";
}

function AppBadge({
  app,
  onClick,
}: {
  app: WorkspaceApp;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="chat-app-badge"
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      title={`Focus ${appLabel(app)}`}
    >
      {appLabel(app)}
    </button>
  );
}

function ThreadSettings({
  logOnly,
  onLog,
}: {
  logOnly: boolean;
  onLog: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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
    <div className="concierge-settings" ref={box}>
      <button
        type="button"
        className={`session-icon-btn is-lg${open ? " is-on" : ""}`}
        data-help="concierge-settings"
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <div className="concierge-settings-pop" role="dialog" aria-label="Settings">
          <Surface className="concierge-settings-card">
            <button
              type="button"
              className={`concierge-settings-item${logOnly ? " is-on" : ""}`}
              data-help="concierge-log"
              aria-pressed={logOnly}
              onClick={onLog}
            >
              Log
            </button>
          </Surface>
        </div>
      )}
    </div>
  );
}

export function ConciergeThread() {
  const {
    entries, selectedEntryId, setSelectedEntryId, ask, confirmIntake,
    nodes, focusTargets, activeSession, createSession, returnToLanding,
  } = useWorkspace();
  const { pickTopic } = useHelp();
  const listRef = useRef<HTMLDivElement>(null);
  const [logOnly, setLogOnly] = useState(false);
  const visible = logOnly ? entries.filter(isActivityEntry) : entries;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, logOnly]);

  function onActivity(entry: RequestEntry) {
    setSelectedEntryId(entry.id);
    const ids = activityFocusIds(entry, nodes);
    if (!ids.length) return;
    focusTargets(ids);
  }

  function onBadge(entry: RequestEntry) {
    setSelectedEntryId(entry.id);
    const ids = activityFocusIds(entry, nodes);
    if (!ids.length) return;
    focusTargets(ids);
  }

  return (
    <div className="concierge-scroll" ref={listRef} onWheel={(e) => e.stopPropagation()}>
      <div className="concierge-head">
        <h2 className="concierge-title">{activeSession?.title ?? "New chat"}</h2>
        {activeSession && !sessionIsEmpty(activeSession) && (
          <button type="button" className="concierge-new" onClick={createSession}>
            New chat
          </button>
        )}
        <ThreadSettings
          logOnly={logOnly}
          onLog={() => setLogOnly((on) => !on)}
        />
        <button
          type="button"
          className="session-icon-btn is-lg concierge-close"
          title="Close"
          aria-label="Close"
          onClick={returnToLanding}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {visible.length === 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {logOnly ? "No window activity yet." : "Ask anything or drop a file — replies land here."}
        </p>
      )}
      {visible.map((e) => (
        isActivityEntry(e) ? (
          <p
            key={e.id}
            className={`chat-activity${selectedEntryId === e.id ? " is-selected" : ""}`}
          >
            <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
            {" "}
            <span className="chat-activity-text">
              {e.activity === "closed" ? "Closed" : "Opened"}{" "}
              <button
                type="button"
                className="chat-activity-app"
                onClick={() => onActivity(e)}
              >
                {activityName(e)}
              </button>
            </span>
          </p>
        ) : isRelayEntry(e) ? (
          <div
            key={e.id}
            className={`chat-turn chat-relay${selectedEntryId === e.id ? " is-selected" : ""}`}
            onClick={() => onBadge(e)}
          >
            <div className="chat-bubble chat-assistant">
              <div className="chat-assistant-meta">
                <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                {(e.badgeApp ?? e.appId) && (
                  <AppBadge app={(e.badgeApp ?? e.appId)!} onClick={() => onBadge(e)} />
                )}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{replyOf(e)}</p>
            </div>
          </div>
        ) : (
          <div
            key={e.id}
            className={`chat-turn${selectedEntryId === e.id ? " is-selected" : ""}`}
            onClick={() => setSelectedEntryId(e.id)}
          >
            <div className="chat-bubble chat-user">
              <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
              {e.query}
            </div>
            <div className={`chat-bubble chat-assistant${e.pending ? " is-pending" : ""}`}>
              <div className="chat-assistant-meta">
                <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                {e.badgeApp && (
                  <AppBadge app={e.badgeApp} onClick={() => onBadge(e)} />
                )}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{replyOf(e)}</p>
              {e.confirmApps && e.confirmApps.length > 0 && (
                <div className="concierge-confirm">
                  {e.confirmApps.map((app) => (
                    <Surface
                      key={app}
                      as="button"
                      type="button"
                      className="chip"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        confirmIntake(e.id, app);
                      }}
                    >
                      {appLabel(app)}
                    </Surface>
                  ))}
                </div>
              )}
              {e.choices && e.choices.length > 0 && (
                <div className="concierge-confirm">
                  {e.choices.map((id) => (
                    <Surface
                      key={id}
                      as="button"
                      type="button"
                      className="chip"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        ask(id);
                      }}
                    >
                      {plyworksDesignLabel(id)}
                    </Surface>
                  ))}
                </div>
              )}
              {e.helpTopics && e.helpTopics.length > 0 && (
                <div className="concierge-confirm">
                  {e.helpTopics.map((id: HelpTopicId) => (
                    <Surface
                      key={id}
                      as="button"
                      type="button"
                      className="chip"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        pickTopic(id);
                      }}
                    >
                      {HELP_TOPIC_LABEL[id]}
                    </Surface>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

export function ConciergeChat() {
  const { entries } = useWorkspace();
  const handedOff = useRef(entries.some((e) => e.pending)).current;

  return (
    <div className="concierge">
      <ConciergeThread />
      <Composer variant="panel" autoFocus={handedOff} placeholder="Ask, or drop a file…" />
    </div>
  );
}
