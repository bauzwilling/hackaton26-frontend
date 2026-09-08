import { useState } from "react";
import { DESIGN_IDS, requestNewDesignWindow, type DesignId } from "../lib/designs";
import { designLabel, t, type Lang } from "../lib/i18n";
import iconChair from "../assets/icons/icon-chair.svg?raw";
import iconTable from "../assets/icons/icon-table.svg?raw";
import iconStool from "../assets/icons/icon-stool.svg?raw";
import iconBench from "../assets/icons/icon-bench.svg?raw";

const DESIGN_ICONS: Record<DesignId, string> = {
  shelf: iconChair,
  table: iconTable,
  stool: iconStool,
  bench: iconBench,
};

interface Props {
  lang: Lang;
  onOverwrite: (id: DesignId) => void;
  onClose: () => void;
}

export function TemplatePicker({ lang, onOverwrite, onClose }: Props) {
  const [chosen, setChosen] = useState<DesignId | null>(null);

  return (
    <div className="pw-templates-panel" role="dialog" aria-labelledby="pw-templates-title">
      <header className="pw-templates-head">
        <div>
          <div id="pw-templates-title" className="pw-templates-title">
            {String(t(lang, "templates"))}
          </div>
          <div className="pw-templates-hint">{String(t(lang, "templatesHint"))}</div>
        </div>
        <button
          type="button"
          className="pw-close"
          onClick={onClose}
          aria-label={String(t(lang, "done"))}
        >
          ×
        </button>
      </header>

      {chosen ? (
        <div className="pw-stack">
          <p className="pw-note" style={{ margin: 0 }}>
            {designLabel(lang, chosen)} — {String(t(lang, "applyHow"))}
          </p>
          <button type="button" className="pw-btn" onClick={() => onOverwrite(chosen)}>
            {String(t(lang, "overwriteProject"))}
          </button>
          <button
            type="button"
            className="pw-btn"
            onClick={() => {
              requestNewDesignWindow(chosen);
              onClose();
            }}
          >
            {String(t(lang, "openNewWindow"))}
          </button>
          <button type="button" className="pw-btn" onClick={() => setChosen(null)}>
            {String(t(lang, "cancel"))}
          </button>
        </div>
      ) : (
        <div className="pw-template-grid">
          {DESIGN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="pw-template-card"
              onClick={() => setChosen(id)}
            >
              <DesignIcon id={id} />
              <span>{designLabel(lang, id)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DesignIcon({ id }: { id: DesignId }) {
  return (
    <span
      className="pw-template-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: DESIGN_ICONS[id] }}
    />
  );
}
