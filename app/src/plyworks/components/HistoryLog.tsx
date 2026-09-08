import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";

interface Props {
  store: ConfiguratorStore;
  helpOpen?: boolean;
}

export function HistoryLog({ store, helpOpen }: Props) {
  const [open, setOpen] = useState(false);
  const lang = store.lang;

  useEffect(() => {
    if (helpOpen) setOpen(true);
  }, [helpOpen]);

  return (
    <div style={styles.wrap} data-help="history">
      <button onClick={() => setOpen(!open)} style={styles.trigger}>
        {t(lang, "log")} ({store.logs.length})
      </button>

      {open && (
        <div style={styles.panel}>
          {store.logs.length === 0 ? (
            <div style={styles.empty}>{t(lang, "logEmpty")}</div>
          ) : (
            <div style={styles.list}>
              {store.logs.map((entry) => (
                <div key={entry.id} style={styles.entry}>
                  <span style={styles.time}>{entry.time}</span>
                  <span>{entry.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: "absolute", bottom: 26, left: 26, zIndex: 10 },
  trigger: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 10,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "Figtree, system-ui, sans-serif",
    background: "var(--pw-surface, #fffdf8)",
    boxShadow: "0 1px 4px rgba(0,0,0,.08)",
  },
  panel: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: 0,
    width: 280,
    maxHeight: 300,
    overflow: "auto",
    background: "var(--pw-surface, #fffdf8)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(33,31,29,.1), 0 8px 22px rgba(33,31,29,.14)",
    padding: 12,
    fontFamily: "Figtree, system-ui, sans-serif",
    fontSize: 12,
  },
  empty: { opacity: 0.4, fontStyle: "italic", padding: 8 },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  entry: { display: "flex", gap: 8 },
  time: { opacity: 0.35, fontVariantNumeric: "tabular-nums", flexShrink: 0 },
};
