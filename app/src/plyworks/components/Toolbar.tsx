import { useState } from "react";
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
  const [open, setOpen] = useState(true);
  const count = `${store.boards.length} ${String(t(lang, "parts"))}`;

  if (!open) {
    return (
      <button
        type="button"
        className="pw-toolbar-fab"
        onClick={() => setOpen(true)}
        title={String(t(lang, "tools"))}
      >
        <span className="pw-fab-title">{String(t(lang, "tools"))}</span>
        <span className="pw-fab-count">{count}</span>
      </button>
    );
  }

  return (
    <aside className="pw-toolbar">
      <header className="pw-toolbar-head">
        <div>
          <div className="pw-toolbar-title">{String(t(lang, "tools"))}</div>
          <div className="pw-toolbar-sub">{count}</div>
        </div>
        <button
          type="button"
          className="pw-close"
          onClick={() => setOpen(false)}
          aria-label={String(t(lang, "done"))}
        >
          ×
        </button>
      </header>

      <ToolGroup tone="insert" label={String(t(lang, "insert"))}>
        <div className="pw-tiles">
          <Tile
            onClick={() => store.addBoard("h")}
            title={String(t(lang, "horiz"))}
          >
            <HorizontalPanelIcon />
          </Tile>
          <Tile
            onClick={() => store.addBoard("v")}
            title={String(t(lang, "vert"))}
          >
            <VerticalPanelIcon />
          </Tile>
        </div>
      </ToolGroup>

      <ToolGroup tone="view" label={String(t(lang, "view"))}>
        <Btn
          primary
          onClick={() =>
            store.setMode(store.mode === "comic" ? "real" : "comic")
          }
        >
          {String(store.mode === "comic" ? t(lang, "renderReal") : t(lang, "showSketch"))}
        </Btn>
        <Btn active={store.dims} onClick={store.toggleDims}>
          {String(store.dims ? t(lang, "dimsOff") : t(lang, "dimsOn"))}
        </Btn>
        <Btn onClick={onResetView}>{String(t(lang, "reset"))}</Btn>
      </ToolGroup>

      <ToolGroup tone="download" label={String(t(lang, "download"))}>
        <Btn primary onClick={() => exportSTEP(store.boards)}>
          STEP
        </Btn>
        <p className="pw-note">{String(t(lang, "stepNote"))}</p>
        <div className="pw-row">
          <Btn onClick={() => exportDXF(store.boards)}>DXF</Btn>
          <Btn onClick={() => exportSTL(store.boards)}>STL</Btn>
        </div>
      </ToolGroup>
    </aside>
  );
}

function ToolGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "insert" | "view" | "download";
  children: ReactNode;
}) {
  return (
    <section className={`pw-group is-${tone}`}>
      <span className="pw-label">{label}</span>
      <div className="pw-stack">{children}</div>
    </section>
  );
}

function Btn({
  children,
  onClick,
  title,
  active,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  primary?: boolean;
}) {
  const cls = ["pw-btn", primary && "is-primary", active && "is-on"]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" onClick={onClick} title={title} className={cls}>
      {children}
    </button>
  );
}

function Tile({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="pw-tile"
    >
      {children}
    </button>
  );
}

function HorizontalPanelIcon() {
  return (
    <svg viewBox="0 0 56 34" className="pw-tile-icon" aria-hidden="true">
      <path d="M6 19 L21 9 L50 13 L34 24 Z" className="pw-icon-face" />
      <path d="M6 19 L6 22 L34 27 L34 24 Z" className="pw-icon-edge" />
      <path d="M34 24 L34 27 L50 16 L50 13 Z" className="pw-icon-edge" />
    </svg>
  );
}

function VerticalPanelIcon() {
  return (
    <svg viewBox="0 0 56 34" className="pw-tile-icon" aria-hidden="true">
      <path d="M17 7 L33 4 L33 27 L17 31 Z" className="pw-icon-face" />
      <path d="M33 4 L39 7 L39 29 L33 27 Z" className="pw-icon-edge" />
    </svg>
  );
}
