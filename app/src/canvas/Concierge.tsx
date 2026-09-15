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
  useWorkspace,
  type RequestEntry,
} from "../context/workspace";
import { useHelp } from "../context/help";

function replyOf(entry: RequestEntry) {
  return entry.reply ?? entry.routeWhy ?? "Answered on the canvas";
}

export function ConciergeThread() {
  const {
    entries, selectedEntryId, setSelectedEntryId, ask, confirmIntake, clearTranscript,
    nodes, focusTargets,
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

  return (
    <div className="concierge-scroll" ref={listRef} onWheel={(e) => e.stopPropagation()}>
      <div className="concierge-head">
        <button
          type="button"
          className={`concierge-log-btn${logOnly ? " is-on" : ""}`}
          data-help="concierge-log"
          aria-pressed={logOnly}
          title={logOnly ? "Show the conversation" : "Show window activity only"}
          onClick={() => setLogOnly((on) => !on)}
        >
          Log
        </button>
        <Surface as="button" type="button" className="chip" onClick={clearTranscript} disabled={entries.length === 0}>
          Clear
        </Surface>
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
        ) : (
          <div
            key={e.id}
            className={`chat-turn${selectedEntryId === e.id ? " is-selected" : ""}`}
            onClick={() => setSelectedEntryId(e.id)}
          >
            <div className="chat-bubble chat-user">{e.query}</div>
            <div className={`chat-bubble chat-assistant${e.pending ? " is-pending" : ""}`}>
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
