import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { COMPANIES, ROLES, type Session } from "../lib/auth";
import { ACCENTS, useSession, type AccentId } from "../context/session";

export type Relief = "raised" | "inset" | "accent" | "ghost";

type SurfaceProps<T extends ElementType> = {
  as?: T;
  relief?: Relief;
  active?: boolean;
  className?: string;
  ref?: React.Ref<HTMLElement | null>;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

/** The only visual primitive. Every card, button, chip and window is an instance. */
export function Surface<T extends ElementType = "div">({
  as,
  relief = "raised",
  active,
  className,
  ...rest
}: SurfaceProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const cls = ["sf", `sf-${relief}`, active ? "is-on" : "", className ?? ""].filter(Boolean).join(" ");
  return createElement(Tag, { className: cls, ...rest });
}

export function Brand({ kicker = "Manufacturing as a service" }: { kicker?: string }) {
  return (
    <Surface className="chrome-brand">
      <span className="chrome-mark">d</span>
      <span>
        <div className="chrome-title">FILE <span>→</span> FACTORY</div>
        <div className="chrome-kicker">{kicker}</div>
      </span>
    </Surface>
  );
}

export function Segment({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <Surface relief="inset" className="seg">
      {options.map((o) => (
        <Surface key={o.id} as="button" type="button" active={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </Surface>
      ))}
    </Surface>
  );
}

export function Slider({
  min, max, step = 1, value, onChange,
}: { min: number; max: number; step?: number; value: number; onChange: (n: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const pct = (value - min) / (max - min);
  function setFromX(clientX: number) {
    const el = track.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const raw = min + t * (max - min);
    onChange(Math.round(raw / step) * step);
  }
  return (
    <div
      ref={track}
      className="sf sf-inset slider"
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromX(e.clientX);
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => { if (e.buttons) setFromX(e.clientX); }}
    >
      <span className="slider-fill" style={{ width: `calc(${(pct * 100).toFixed(1)}% - 6px)` }} />
      <span className="slider-thumb" style={{ left: `${(pct * 100).toFixed(1)}%` }} />
    </div>
  );
}

export function Switch({ on, onToggle, label, note }: { on: boolean; onToggle: () => void; label: string; note: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <button type="button" className={`sf sf-inset switch${on ? " is-on" : ""}`} onClick={onToggle} aria-pressed={on}>
        <span className="switch-knob" />
      </button>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="muted">{note}</span>
    </div>
  );
}

export function Choice({
  selected, chip, title, note, onClick,
}: { selected: boolean; chip: string; title: string; note: string; onClick: () => void }) {
  return (
    <Surface as="button" type="button" className="choice" active={selected} onClick={onClick}>
      <span className="choice-chip" style={{ background: chip }} />
      <strong>{title}</strong>
      <span className="muted" style={{ fontSize: 12.5 }}>{note}</span>
    </Surface>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Surface relief="inset" className="fact">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </Surface>
  );
}

export function Window({
  title, code, z, x, y, width = 420, height, kind, hidden, autoSize, tilt, onFocus, onClose, onHide, onDrag, onGrab, onFit, children,
}: {
  title: string; code: string; z: number; x: number; y: number; width?: number; height?: number;
  kind?: string; hidden?: boolean; autoSize?: boolean; tilt?: number;
  onFocus: () => void; onClose: () => void; onHide?: () => void;
  onDrag: (e: PointerEvent<HTMLDivElement>) => void;
  onGrab?: (e: PointerEvent<HTMLDivElement>) => void;
  onFit?: (w: number, h: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = autoSize !== false && !hidden;
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  useEffect(() => {
    if (!fit) return;
    const el = ref.current;
    if (!el) return;
    const report = () => onFitRef.current?.(el.offsetWidth, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <Surface
      ref={ref}
      className={`win${kind ? ` win-${kind}` : ""}${fit ? " win-autosize" : ""}`}
      style={{
        left: x,
        top: y,
        zIndex: z,
        width,
        height: fit ? undefined : height,
        display: hidden ? "none" : undefined,
        transform: tilt && Math.abs(tilt) > 0.05 ? `rotate(${tilt.toFixed(2)}deg)` : undefined,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onFocus();
        if (!onGrab || e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("button, input, textarea, a, select")) return;
        onGrab(e);
      }}
    >
      <div className="win-bar" onPointerDown={onDrag}>
        <span className="win-dot" />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{title}</span>
        <span className="muted" style={{ fontSize: 10 }}>{code}</span>
        {onHide && (
          <Surface as="button" type="button" relief="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={onHide} style={{ width: 28, height: 28, borderRadius: 8 }} title="Hide">–</Surface>
        )}
        <Surface as="button" type="button" relief="ghost" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8 }} title="Close">×</Surface>
      </div>
      <div className="win-body">{children}</div>
    </Surface>
  );
}

function VizAccordion() {
  const { theme, setTheme, accent, setAccent, showWires, setShowWires, showGrid, setShowGrid, bubbleMode, setBubbleMode } = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDoc);
    return () => window.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const swatch = ACCENTS[accent];

  return (
    <div className="viz" ref={box}>
      <Surface as="button" type="button" className="viz-toggle" active={open} onClick={() => setOpen((v) => !v)}>
        <span className="viz-swatch" style={{ background: theme === "dark" ? swatch.dark : swatch.acc }} />
        Look
        <span className="muted" style={{ fontSize: 11 }}>{open ? "▴" : "▾"}</span>
      </Surface>
      {open && (
        <Surface className="viz-panel">
          <div className="viz-label">Theme</div>
          <Segment
            value={theme}
            options={[{ id: "bright", label: "Light" }, { id: "dark", label: "Dark" }]}
            onChange={(id) => setTheme(id as "bright" | "dark")}
          />
          <Switch on={showWires} onToggle={() => setShowWires(!showWires)} label="Show wires" note={showWires ? "On" : "Off"} />
          <Switch on={showGrid} onToggle={() => setShowGrid(!showGrid)} label="Show grid" note={showGrid ? "On" : "Off"} />
          <Switch on={bubbleMode} onToggle={() => setBubbleMode(!bubbleMode)} label="Bubble mode" note={bubbleMode ? "On" : "Off"} />
          <div className="viz-label">Accent color</div>
          <div className="viz-accents">
            {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`viz-dot${accent === id ? " is-on" : ""}`}
                style={{ background: ACCENTS[id].acc }}
                title={ACCENTS[id].label}
                onClick={() => setAccent(id)}
              />
            ))}
          </div>
        </Surface>
      )}
    </div>
  );
}

export function Chrome({
  session, onSignOut,
}: {
  session: Session | null;
  onSignOut: () => void;
}) {
  return (
    <header className="chrome">
      <Link to={session ? "/" : "/login"}><Brand /></Link>
      <div className="chrome-actions">
        <VizAccordion />
        {session && (
          <Surface className="user-chip">
            <span className="avatar">{session.name[0]}</span>
            <span>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{session.name}</div>
              <div className="muted" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {ROLES_LABEL(session)}
              </div>
            </span>
            <Surface as="button" type="button" relief="inset" style={{ borderRadius: 999, padding: "7px 12px", fontSize: 12 }} onClick={onSignOut}>
              Sign out
            </Surface>
          </Surface>
        )}
      </div>
    </header>
  );
}

function ROLES_LABEL(session: Session) {
  return `${ROLES[session.role].label} · ${COMPANIES[session.company].name}`;
}
