import { useState } from "react";
import { t } from "../lib/i18n";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";

interface Props {
  store: ConfiguratorStore;
}

export function HistoryLog({ store }: Props) {
  const [open, setOpen] = useState(false);
  const lang = store.lang;

  return (
    <div className="pw-log">
      <div className="pw-log-bar">
        <button type="button" onClick={() => setOpen(!open)} className="pw-log-trigger">
          {String(t(lang, "log"))} ({store.logs.length})
        </button>
        {store.logs.length > 0 && (
          <button type="button" onClick={store.undo} className="pw-btn">
            {String(t(lang, "undo"))}
          </button>
        )}
      </div>

      {open && (
        <div className="pw-log-panel">
          {store.logs.length === 0 ? (
            <div className="pw-log-empty">{String(t(lang, "logEmpty"))}</div>
          ) : (
            <div className="pw-log-list">
              {store.logs.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className="pw-log-entry"
                  title={String(t(lang, "undoTo"))}
                  onClick={() => store.undoTo(entry.id)}
                >
                  <span className="pw-log-time">{entry.time}</span>
                  <span>{entry.msg}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
