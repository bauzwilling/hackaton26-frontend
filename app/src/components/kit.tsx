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
import { useWorkspace } from "../context/workspace";

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

function BrandMark() {
  return (
    <svg className="chrome-mark" viewBox="0 0 36 36" aria-hidden>
      <path
        fill="currentColor"
        d="M18 17.2C12.4 8.2 5.6 5.4 3.2 8.6 1 11.4 3.8 17 10 22.2 13.4 25 16.4 26.6 18 26.6c1.6 0 4.6-1.6 8-4.4C32.2 17 35 11.4 32.8 8.6 30.4 5.4 23.6 8.2 18 17.2z"
      />
    </svg>
  );
}

export function Brand({ kicker = "Manufacturing as a service" }: { kicker?: string }) {
  return (
    <span className="chrome-brand">
      <BrandMark />
      <span>
        <div className="chrome-title">FILE <span>→</span> FACTORY</div>
        <div className="chrome-kicker">{kicker}</div>
      </span>
    </span>
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
  title, code, z, x, y, width = 420, height, kind, hidden, autoSize, tilt, enter, flash, flashKey, selected, viewport, onFocus, onClose, onHide, onDrag, onGrab, onFit, children,
}: {
  title: string; code: string; z: number; x: number; y: number; width?: number; height?: number;
  kind?: string; hidden?: boolean; autoSize?: boolean; tilt?: number; enter?: boolean;
  flash?: boolean; flashKey?: number;
  selected?: boolean; viewport?: boolean;
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
      className={`win${kind ? ` win-${kind}` : ""}${viewport ? " win-viewport" : ""}${selected ? " is-selected" : ""}${fit ? " win-autosize" : ""}${enter ? " win-enter" : ""}`}
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
        if (e.button === 0) onFocus();
        if (!onGrab || e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("button, input, textarea, a, select, .composer")) return;
        onGrab(e);
      }}
    >
      <div className="win-bar" onPointerDown={onDrag}>
        <span className="win-dot" />
        <span className="win-title">{title}</span>
        <span className="win-code">{code}</span>
        {onHide && (
          <Surface as="button" type="button" relief="ghost" className="win-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onHide} title="Hide">–</Surface>
        )}
        <Surface as="button" type="button" relief="ghost" className="win-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} title="Close">×</Surface>
      </div>
      <div className="win-body">{children}</div>
      {flash ? <div key={flashKey} className="win-flash-overlay" aria-hidden /> : null}
    </Surface>
  );
}

function AccentDots() {
  const { accent, setAccent } = useSession();
  return (
    <div className="viz-accents" role="group" aria-label="Accent color">
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
  );
}

function LookOverflow() {
  const { showWires, setShowWires, showGrid, setShowGrid, bubbleMode, setBubbleMode } = useSession();
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

  return (
    <div className="viz" ref={box}>
      <Surface as="button" type="button" relief="ghost" className="viz-toggle" active={open} onClick={() => setOpen((v) => !v)} aria-label="Canvas options" title="Canvas options">
        ···
      </Surface>
      {open && (
        <Surface className="viz-panel">
          <div className="viz-label">Canvas</div>
          <Switch on={showWires} onToggle={() => setShowWires(!showWires)} label="Show wires" note={showWires ? "On" : "Off"} />
          <Switch on={showGrid} onToggle={() => setShowGrid(!showGrid)} label="Show grid" note={showGrid ? "On" : "Off"} />
          <Switch on={bubbleMode} onToggle={() => setBubbleMode(!bubbleMode)} label="Bubble mode" note={bubbleMode ? "On" : "Off"} />
        </Surface>
      )}
    </div>
  );
}

function WindowsToggle() {
  const { nodes, overviewOpen, setOverviewOpen } = useWorkspace();
  return (
    <Surface
      as="button"
      type="button"
      relief="ghost"
      className="chrome-windows"
      active={overviewOpen}
      onClick={() => setOverviewOpen(!overviewOpen)}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
        <rect x="0" y="0" width="5" height="5" rx="1" />
        <rect x="7" y="0" width="5" height="5" rx="1" />
        <rect x="0" y="7" width="5" height="5" rx="1" />
        <rect x="7" y="7" width="5" height="5" rx="1" />
      </svg>
      All windows · {nodes.length}
    </Surface>
  );
}

export function Chrome({
  session, onSignOut,
}: {
  session: Session | null;
  onSignOut: () => void;
}) {
  const { theme, setTheme } = useSession();

  return (
    <header className="chrome">
      <Link to={session ? "/" : "/login"}><Brand /></Link>
      <div className="chrome-actions">
        <div className="chrome-look">
          <div className="chrome-status">
            <span className="chrome-status-dot" />
            Decentralized network online
          </div>
          <div className="chrome-look-row">
            {session && <WindowsToggle />}
            <AccentDots />
            <Segment
              value={theme}
              options={[{ id: "bright", label: "Bright" }, { id: "dark", label: "Dark" }]}
              onChange={(id) => setTheme(id as "bright" | "dark")}
            />
            <LookOverflow />
          </div>
        </div>
        {session && (
          <div className="user-chip">
            <span className="avatar">{session.name[0]}</span>
            <span>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{session.name}</div>
              <div className="muted" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {ROLES_LABEL(session)}
              </div>
            </span>
            <Surface as="button" type="button" relief="ghost" className="user-chip-out" onClick={onSignOut}>
              Sign out
            </Surface>
          </div>
        )}
      </div>
    </header>
  );
}

function ROLES_LABEL(session: Session) {
  return `${ROLES[session.role].label} · ${COMPANIES[session.company].name}`;
}
