import { useEffect, useRef } from "react";
import { Composer } from "../components/Composer";
import { Surface } from "../components/kit";
import { appLabel, useWorkspace, type RequestEntry } from "../context/workspace";

function replyOf(entry: RequestEntry) {
  return entry.reply ?? entry.routeWhy ?? "Answered on the canvas";
}

export function ConciergeChat() {
  const { entries, selectedEntryId, setSelectedEntryId, confirmIntake, clearTranscript } = useWorkspace();
  const listRef = useRef<HTMLDivElement>(null);
  // A pending entry on mount means we opened straight off the hero composer, so take its focus.
  // A restored transcript never has one: reviveEntry clears pending on load.
  const handedOff = useRef(entries.some((e) => e.pending)).current;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="concierge">
      <div className="concierge-scroll" ref={listRef} onWheel={(e) => e.stopPropagation()}>
        <div className="panel-clear">
          <Surface as="button" type="button" className="chip" onClick={clearTranscript} disabled={entries.length === 0}>
            Clear
          </Surface>
        </div>
        {entries.length === 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ask anything or drop a file — replies land here.</p>
        )}
        {entries.map((e) => (
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
            </div>
          </div>
        ))}
      </div>
      <Composer variant="panel" autoFocus={handedOff} placeholder="Ask, or drop a file…" />
    </div>
  );
}
