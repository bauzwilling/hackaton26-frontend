import { useState } from "react";
import { t } from "../lib/i18n";
import { exportDXF, exportSTL, exportSTEP } from "../lib/geometry";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";
import type { ReactNode } from "react";
import { STOCK_THICKNESSES } from "../types";

interface Props {
  store: ConfiguratorStore;
  onResetView: () => void;
  onProduce?: () => void;
  produceBusy?: boolean;
  forceOpen?: boolean;
  templatesOpen?: boolean;
  onToggleTemplates?: () => void;
  children?: ReactNode;
}

function materialBreakdown(store: ConfiguratorStore, lang: ConfiguratorStore["lang"]) {
  const film = store.boards.filter((b) => b.material === "film").length;
  const kiefer = store.boards.length - film;
  const same = store.kieferThickness === store.filmThickness;
  return [
    kiefer &&
      `${kiefer} ${String(t(lang, "kiefer"))}${same ? "" : ` · ${store.kieferThickness} mm`}`,
    film &&
      `${film} ${String(t(lang, "film"))}${same ? "" : ` · ${store.filmThickness} mm`}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function Toolbar({
  store,
  onResetView,
  onProduce,
  produceBusy,
  forceOpen,
  templatesOpen,
  onToggleTemplates,
  children,
}: Props) {
  const lang = store.lang;
  const [open, setOpen] = useState(true);
  const shown = forceOpen || open;
  const same = store.kieferThickness === store.filmThickness;
  const count = same
    ? `${store.boards.length} ${String(t(lang, "parts"))} · ${store.kieferThickness} mm`
    : `${store.boards.length} ${String(t(lang, "parts"))}`;
  const mats = materialBreakdown(store, lang);

  return (
    <div className="pw-tools-cluster">
      {shown ? (
        <aside className="pw-toolbar">
          <header className="pw-toolbar-head">
            <div>
              <div className="pw-toolbar-title">{String(t(lang, "tools"))}</div>
              <div className="pw-toolbar-sub">{count}</div>
              {mats ? <div className="pw-toolbar-mats">{mats}</div> : null}
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

          <ToolGroup tone="material" label={String(t(lang, "material"))}>
            <StockSelect
              label={String(t(lang, "kiefer"))}
              value={store.kieferThickness}
              onChange={(thickness) => store.setStockThickness("kiefer", thickness)}
            />
            <StockSelect
              label={String(t(lang, "film"))}
              value={store.filmThickness}
              onChange={(thickness) => store.setStockThickness("film", thickness)}
            />
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
      ) : (
        <button
          type="button"
          className="pw-toolbar-fab"
          onClick={() => setOpen(true)}
          title={String(t(lang, "tools"))}
        >
          <span className="pw-fab-title">{String(t(lang, "tools"))}</span>
          <span className="pw-fab-count">{count}</span>
          {mats ? <span className="pw-fab-mats">{mats}</span> : null}
        </button>
      )}
      {onToggleTemplates && (
        <div className="pw-templates">
          {children}
          <button
            type="button"
            className="pw-corner-chip"
            aria-expanded={templatesOpen}
            onClick={onToggleTemplates}
          >
            {String(t(lang, "templates"))}
          </button>
        </div>
      )}
      {onProduce && (
        <button
          type="button"
          className="pw-corner-chip is-produce"
          onClick={onProduce}
          disabled={produceBusy}
        >
          {produceBusy ? String(t(lang, "producing")) : String(t(lang, "produce"))}
        </button>
      )}
    </div>
  );
}

function ToolGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "insert" | "view" | "download" | "material";
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

function StockSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (thickness: number) => void;
}) {
  return (
    <label className="pw-stock">
      <span className="pw-stock-label">{label}</span>
      <select
        className="pw-stock-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {STOCK_THICKNESSES.map((mm) => (
          <option key={mm} value={mm}>
            {mm} mm
          </option>
        ))}
      </select>
    </label>
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
