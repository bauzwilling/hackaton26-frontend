import { t, boardName } from "../lib/i18n";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";

interface Props {
  store: ConfiguratorStore;
}

export function SelectionPanel({ store }: Props) {
  const sel = store.selectedBoard;
  if (!sel) return null;

  const lang = store.lang;

  return (
    <div className="pw-panel">
      <div className="pw-panel-header">
        <span className="pw-panel-name">{boardName(lang, sel.name)}</span>
        <button type="button" onClick={store.deleteSelected} className="pw-close" title={String(t(lang, "del"))}>
          ×
        </button>
      </div>

      <div className="pw-dims">
        <DimInput label={String(t(lang, "width"))} value={sel.w} onChange={(v) => store.setDim("w", v)} />
        <DimInput label={String(t(lang, "height"))} value={sel.h} onChange={(v) => store.setDim("h", v)} />
        <DimInput label={String(t(lang, "depth"))} value={sel.d} onChange={(v) => store.setDim("d", v)} />
      </div>

      <div className="pw-actions">
        <button type="button" onClick={() => store.rotate("z")} className="pw-btn">
          {String(t(lang, "rotate"))}
        </button>
        <button type="button" onClick={() => store.select(null)} className="pw-btn">
          {String(t(lang, "done"))}
        </button>
      </div>
    </div>
  );
}

function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="pw-dim-label">
      <span className="pw-dim-name">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pw-dim-input"
      />
      <span className="pw-unit">mm</span>
    </label>
  );
}
