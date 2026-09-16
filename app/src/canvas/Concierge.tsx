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
  useWorkspace,
  type RequestEntry,
  type WorkspaceApp,
} from "../context/workspace";
import { useHelp } from "../context/help";
import { AppPromptControls } from "./AppPromptControls";

function replyOf(entry: RequestEntry) {
  return entry.reply ?? entry.routeWhy ?? "Answered on the canvas";
}

/** Keep extension visible: thisIsTheFi...dxf */
function truncateFileName(name: string, max = 24) {
  const t = name.trim();
  if (t.length <= max) return t;
  const dot = t.lastIndexOf(".");
  const ext = dot > 0 && dot < t.length - 1 ? t.slice(dot) : "";
  const stem = ext ? t.slice(0, dot) : t;
  const budget = max - ext.length - 3;
  if (budget < 4) return `${t.slice(0, Math.max(1, max - 3))}...`;
  return `${stem.slice(0, budget)}...${ext}`;
}

function displayQuery(entry: RequestEntry) {
  if (entry.attachment) return truncateFileName(entry.query);
  return entry.query;
}

function ActivityLine({
  entry,
  selected,
  verb,
  onOpen,
}: {
  entry: RequestEntry;
  selected: boolean;
  verb: "Opened" | "Closed";
  onOpen: () => void;
}) {
  return (
    <p className={`chat-activity${selected ? " is-selected" : ""}`}>
      <time dateTime={new Date(entry.at).toISOString()}>{activityClock(entry.at)}</time>
      {" "}
      <span className="chat-activity-text">
        {verb}{" "}
        <button type="button" className="chat-activity-app" onClick={onOpen}>
          {activityName(entry)}
        </button>
      </span>
    </p>
  );
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

function LogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </svg>
  );
}

export function ConciergeThread() {
  const {
    entries, selectedEntryId, setSelectedEntryId, ask, confirmIntake,
    nodes, focusTargets, activeSession, returnToLanding,
  } = useWorkspace();
  const { pickTopic } = useHelp();
  const listRef = useRef<HTMLDivElement>(null);
  const [logOnly, setLogOnly] = useState(false);
  // Opened lines from chat handoffs live on the turn (windowOpened); Closed is a dedicated activity entry.
  const visible = logOnly
    ? entries.filter((e) => isActivityEntry(e) || Boolean(e.windowOpened))
    : entries;

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
    <div className="concierge-thread">
      <div className="concierge-head">
        <h2 className="concierge-title">{activeSession?.title ?? "New chat"}</h2>
        <button
          type="button"
          className={`session-icon-btn is-lg${logOnly ? " is-on" : ""}`}
          data-help="concierge-log"
          title={logOnly ? "Show full chat" : "Logs"}
          aria-label="Logs"
          aria-pressed={logOnly}
          onClick={() => setLogOnly((on) => !on)}
        >
          <LogIcon />
        </button>
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
      <div className="concierge-scroll" ref={listRef} onWheel={(e) => e.stopPropagation()}>
        {visible.length === 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {logOnly ? "No window activity yet." : "Ask anything or drop a file — replies land here."}
          </p>
        )}
        {visible.map((e) => {
          if (isActivityEntry(e)) {
            return (
              <ActivityLine
                key={e.id}
                entry={e}
                selected={selectedEntryId === e.id}
                verb={e.activity === "closed" ? "Closed" : "Opened"}
                onOpen={() => onActivity(e)}
              />
            );
          }
          if (logOnly && e.windowOpened) {
            return (
              <ActivityLine
                key={e.id}
                entry={e}
                selected={selectedEntryId === e.id}
                verb="Opened"
                onOpen={() => onActivity(e)}
              />
            );
          }
          if (isRelayEntry(e)) {
            return (
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
                {e.appPrompt && e.appId && (
                  <AppPromptControls
                    entryId={e.id}
                    appId={e.appId}
                    prompt={e.appPrompt}
                  />
                )}
              </div>
            </div>
            );
          }
          if (e.result === "app"
            && e.appId
            && !(e.confirmApps && e.confirmApps.length)
            && !(e.choices && e.choices.length)
            && !(e.helpTopics && e.helpTopics.length)) {
            return (
            <div
              key={e.id}
              className={`chat-turn${selectedEntryId === e.id ? " is-selected" : ""}`}
              onClick={() => setSelectedEntryId(e.id)}
            >
              {e.query.trim() ? (
                <div className="chat-bubble chat-user" title={e.attachment ? e.query : undefined}>
                  {e.attachment ? (
                    <div className="chat-user-meta">
                      <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                      <span className="chat-user-meta-sep" aria-hidden>|</span>
                      <span>Attached File</span>
                    </div>
                  ) : (
                    <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                  )}
                  {displayQuery(e)}
                </div>
              ) : null}
              {e.windowOpened ? (
                <ActivityLine
                  entry={e}
                  selected={selectedEntryId === e.id}
                  verb="Opened"
                  onOpen={() => onBadge(e)}
                />
              ) : null}
            </div>
            );
          }
          return (
            <div
              key={e.id}
              className={`chat-turn${selectedEntryId === e.id ? " is-selected" : ""}`}
              onClick={() => setSelectedEntryId(e.id)}
            >
              <div className="chat-bubble chat-user" title={e.attachment ? e.query : undefined}>
                {e.attachment ? (
                  <div className="chat-user-meta">
                    <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                    <span className="chat-user-meta-sep" aria-hidden>|</span>
                    <span>Attached File</span>
                  </div>
                ) : (
                  <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                )}
                {displayQuery(e)}
              </div>
              <div className={`chat-bubble chat-assistant${e.pending ? " is-pending" : ""}`}>
                <div className="chat-assistant-meta">
                  <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
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
          );
        })}
      </div>
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
