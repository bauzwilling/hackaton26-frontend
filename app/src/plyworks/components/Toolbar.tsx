import { t } from "../lib/i18n";
import { exportDXF, exportSTL, exportSTEP } from "../lib/geometry";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";
import type { ReactNode } from "react";

interface Props {
  store: ConfiguratorStore;
  onResetView: () => void;
}

export function Toolbar({ store, onResetView }: Props) {
  const lang = store.lang;

  return (
    <div className="pw-toolbar">
      <ToolGroup label={String(t(lang, "tools"))}>
        <Btn onClick={() => store.addBoard("h")} title={String(t(lang, "horiz"))}>
          ─
        </Btn>
        <Btn onClick={() => store.addBoard("v")} title={String(t(lang, "vert"))}>
          │
        </Btn>
      </ToolGroup>

      <ToolGroup label={String(t(lang, "view"))}>
        <Btn
          onClick={() =>
            store.setMode(store.mode === "comic" ? "real" : "comic")
          }
        >
          {String(store.mode === "comic" ? t(lang, "renderReal") : t(lang, "showSketch"))}
        </Btn>
        <Btn onClick={store.toggleDims}>
          {String(store.dims ? t(lang, "dimsOff") : t(lang, "dimsOn"))}
        </Btn>
        <Btn onClick={onResetView}>{String(t(lang, "reset"))}</Btn>
      </ToolGroup>

      <ToolGroup label={String(t(lang, "download"))}>
        <Btn onClick={() => exportSTEP(store.boards)}>STEP</Btn>
        <Btn onClick={() => exportDXF(store.boards)}>DXF</Btn>
        <Btn onClick={() => exportSTL(store.boards)}>STL</Btn>
      </ToolGroup>

      <span className="pw-count">
        {store.boards.length} {String(t(lang, "parts"))}
      </span>
    </div>
  );
}

function ToolGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="pw-group">
      <span className="pw-label">{label}</span>
      <div className="pw-row">{children}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={active ? "pw-btn is-on" : "pw-btn"}
    >
      {children}
    </button>
  );
}
