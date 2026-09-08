import { t, boardName } from "../lib/i18n";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";
import { DEFAULT_LOOK, MATERIALS, plateThickness, type PlateMaterial } from "../types";
import { thinField } from "../lib/geometry";

interface Props {
  store: ConfiguratorStore;
}

function commonNumber(values: number[]): { value: number; mixed: boolean } | null {
  if (!values.length) return null;
  const first = values[0];
  return { value: first, mixed: values.some((v) => v !== first) };
}

export function SelectionPanel({ store }: Props) {
  const selected = store.selectedBoards;
  if (!selected.length) return null;

  const lang = store.lang;
  const multi = selected.length > 1;
  const title = multi
    ? `${selected.length} ${String(t(lang, "parts"))}`
    : boardName(lang, selected[0].name);

  const stocks = selected.map((b) =>
    plateThickness(b.material ?? "kiefer", {
      kiefer: store.kieferThickness,
      film: store.filmThickness,
    })
  );
  const stock = commonNumber(stocks);

  const mats = selected.map((b) => b.material ?? "kiefer");
  const mixedMat = mats.some((m) => m !== mats[0]);
  const material = mixedMat ? null : mats[0];

  const looks = selected.map((b) => b.look ?? DEFAULT_LOOK);
  const mixedLook = looks.some((item) => item !== looks[0]);
  const look = mixedLook ? null : looks[0];
  const lookNames = t(lang, "mats") as Record<string, string>;

  const dim = (field: "w" | "h" | "d") =>
    commonNumber(selected.filter((b) => thinField(b) !== field).map((b) => b[field]));

  const width = dim("w");
  const height = dim("h");
  const depth = dim("d");

  return (
    <div style={styles.panel} data-help="selection">
      <div style={styles.header}>
        <div>
          <div style={styles.name}>{title}</div>
          {!multi && <div style={styles.hint}>{String(t(lang, "multiHint"))}</div>}
        </div>
        <button onClick={store.deleteSelected} style={styles.close} title={t(lang, "del")}>
          ×
        </button>
      </div>

      <div style={styles.toggle}>
        <PlateToggle
          value={material}
          onChange={(next) => store.setBoardMaterial(next)}
          kieferLabel={String(t(lang, "kiefer"))}
          filmLabel={String(t(lang, "film"))}
        />
      </div>

      <div style={styles.colors} data-help="color">
        <span style={styles.dimName}>{String(t(lang, "color"))}</span>
        <div style={styles.swatches} role="group" aria-label={String(t(lang, "color"))}>
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              type="button"
              title={lookNames[m.id] ?? m.id}
              aria-label={lookNames[m.id] ?? m.id}
              aria-pressed={look === m.id}
              onClick={() => store.setBoardLook(m.id)}
              style={{
                ...styles.swatch,
                background: m.swatch,
                boxShadow:
                  look === m.id
                    ? "0 0 0 2px var(--pw-surface, #fffdf8), 0 0 0 4px var(--pw-accent, #c67139)"
                    : "0 0 0 1px rgba(0,0,0,.16)",
              }}
            />
          ))}
        </div>
      </div>

      <div style={styles.dims}>
        {stock && (
          <DimReadout
            label={t(lang, "thickness")}
            value={stock.value}
            mixed={stock.mixed}
          />
        )}
        {width && (
          <DimInput
            label={t(lang, "width")}
            value={width.value}
            mixed={width.mixed}
            onChange={(v) => store.setDim("w", v)}
          />
        )}
        {height && (
          <DimInput
            label={t(lang, "height")}
            value={height.value}
            mixed={height.mixed}
            onChange={(v) => store.setDim("h", v)}
          />
        )}
        {depth && (
          <DimInput
            label={t(lang, "depth")}
            value={depth.value}
            mixed={depth.mixed}
            onChange={(v) => store.setDim("d", v)}
          />
        )}
      </div>

      <div style={styles.actions}>
        <button onClick={() => store.rotate("z")} style={styles.btn}>
          {t(lang, "rotate")}
        </button>
        <button onClick={() => store.select(null)} style={styles.btn}>
          {t(lang, "done")}
        </button>
      </div>
    </div>
  );
}

function PlateToggle({
  value,
  onChange,
  kieferLabel,
  filmLabel,
}: {
  value: PlateMaterial | null;
  onChange: (material: PlateMaterial) => void;
  kieferLabel: string;
  filmLabel: string;
}) {
  return (
    <div style={styles.toggleRow} role="group" aria-label="Material">
      <button
        type="button"
        onClick={() => onChange("kiefer")}
        style={{ ...styles.toggleBtn, ...(value === "kiefer" ? styles.toggleOn : null) }}
      >
        {kieferLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("film")}
        style={{ ...styles.toggleBtn, ...(value === "film" ? styles.toggleOnFilm : null) }}
      >
        {filmLabel}
      </button>
    </div>
  );
}

function DimReadout({
  label,
  value,
  mixed,
}: {
  label: string;
  value: number;
  mixed?: boolean;
}) {
  return (
    <label style={styles.dimLabel}>
      <span style={styles.dimName}>{label}</span>
      <span style={styles.dimReadout}>{mixed ? "—" : value}</span>
      <span style={styles.unit}>mm</span>
    </label>
  );
}

function DimInput({
  label,
  value,
  mixed,
  onChange,
}: {
  label: string;
  value: number;
  mixed?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label style={styles.dimLabel}>
      <span style={styles.dimName}>{label}</span>
      <input
        type="number"
        value={mixed ? "" : value}
        placeholder={mixed ? "—" : undefined}
        onChange={(e) => {
          if (e.target.value === "") return;
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
        style={styles.dimInput}
      />
      <span style={styles.unit}>mm</span>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 26,
    left: 26,
    width: 240,
    background: "var(--pw-surface, #fffdf8)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(33,31,29,.1), 0 8px 22px rgba(33,31,29,.14)",
    padding: 16,
    zIndex: 10,
    fontFamily: "Figtree, system-ui, sans-serif",
    fontSize: 13,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 8,
  },
  name: { fontWeight: 600, fontSize: 14 },
  hint: { fontSize: 11, opacity: 0.45, marginTop: 2, fontWeight: 500 },
  close: {
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 18,
    opacity: 0.5,
    padding: "2px 6px",
  },
  toggle: { marginBottom: 12 },
  colors: { marginBottom: 12 },
  swatches: {
    display: "grid",
    gridTemplateColumns: "repeat(8, 1fr)",
    gap: 6,
    marginTop: 8,
    padding: "3px 2px",
  },
  swatch: {
    width: "100%",
    aspectRatio: "1",
    border: "none",
    borderRadius: "50%",
    padding: 0,
    cursor: "pointer",
    minWidth: 0,
  },
  toggleRow: {
    display: "flex",
    gap: 6,
    padding: 3,
    borderRadius: 9,
    background: "rgba(0,0,0,.04)",
  },
  toggleBtn: {
    flex: 1,
    border: "none",
    borderRadius: 7,
    padding: "6px 8px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "inherit",
    background: "transparent",
    color: "inherit",
    opacity: 0.55,
  },
  toggleOn: {
    background: "var(--pw-surface, #fffdf8)",
    boxShadow: "0 1px 2px rgba(33,31,29,.12)",
    opacity: 1,
  },
  toggleOnFilm: {
    background: "#c4a882",
    color: "#3d2f22",
    boxShadow: "0 1px 2px rgba(33,31,29,.12)",
    opacity: 1,
  },
  dims: { display: "flex", flexDirection: "column", gap: 8 },
  dimLabel: { display: "flex", alignItems: "center", gap: 8 },
  dimName: { width: 48, fontSize: 11, fontWeight: 500, opacity: 0.6 },
  dimInput: {
    flex: 1,
    border: "1px solid rgba(0,0,0,.1)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 13,
    fontFamily: "inherit",
    textAlign: "right" as const,
  },
  dimReadout: {
    flex: 1,
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 13,
    textAlign: "right" as const,
    opacity: 0.7,
  },
  unit: { fontSize: 10, opacity: 0.4, width: 20 },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "inherit",
    background: "var(--pw-surface, #fffdf8)",
  },
};
