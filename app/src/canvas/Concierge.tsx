import { useEffect, useRef } from "react";
import { Surface } from "../components/kit";
import { appLabel, useWorkspace, type RequestEntry } from "../context/workspace";

function replyOf(entry: RequestEntry) {
  return entry.reply ?? entry.routeWhy ?? "Answered on the canvas";
}

export function ConciergeChat() {
  const { entries, selectedEntryId, setSelectedEntryId, confirmIntake, clearTranscript } = useWorkspace();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="concierge-chat" ref={listRef} onWheel={(e) => e.stopPropagation()}>
      <div className="panel-clear">
        <Surface as="button" type="button" relief="inset" style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }} onClick={clearTranscript} disabled={entries.length === 0}>
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
                    relief="inset"
                    style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }}
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
  );
}
