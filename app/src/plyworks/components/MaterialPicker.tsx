import { useState } from "react";
import { MATERIALS } from "../types";
import { t } from "../lib/i18n";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";

interface Props {
  store: ConfiguratorStore;
}

export function MaterialPicker({ store }: Props) {
  const [open, setOpen] = useState(false);
  const lang = store.lang;
  const mats = t(lang, "mats") as Record<string, string>;

  return (
    <div className="pw-picker">
      <button type="button" onClick={() => setOpen(!open)} className="pw-picker-trigger">
        <span
          className="pw-swatch"
          style={{ background: MATERIALS.find((m) => m.id === store.mat)?.swatch }}
        />
        <span>{mats[store.mat] ?? store.mat}</span>
      </button>

      {open && (
        <div className="pw-dropdown">
          <div className="pw-note">{String(t(lang, "matNote"))}</div>
          <div className="pw-grid">
            {MATERIALS.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => {
                  store.setMaterial(m.id);
                  setOpen(false);
                }}
                className={store.mat === m.id ? "pw-chip is-on" : "pw-chip"}
                title={mats[m.id]}
              >
                <span className="pw-dot" style={{ background: m.swatch }} />
                <span>{mats[m.id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
