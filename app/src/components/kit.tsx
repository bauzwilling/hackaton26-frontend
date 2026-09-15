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
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { COMPANIES, ROLES, type Session } from "../lib/auth";
import { ACCENTS, THEME_DISSOLVE_MS, useSession, type AccentId } from "../context/session";
import { canDeleteNode, CONCIERGE_ID, useWorkspace } from "../context/workspace";

export const LAYOUT_MARK = "f2f-mark";
export const LAYOUT_WORD = "f2f-wordmark";
export const LAYOUT_KICKER = "f2f-kicker";
export const LAYOUT_DOT = "f2f-network-dot";
export const LAYOUT_CHROME = "f2f-chrome";
export const LAYOUT_CHAT = "f2f-chat";
export const LAYOUT_COMPOSER = "f2f-composer";
export const LAYOUT_ATTACH = "f2f-attach";
export const LAYOUT_FIELD = "f2f-field";
export const LAYOUT_SEND = "f2f-send";
export const LAYOUT_MINIMAP = "f2f-minimap";

export const LAYOUT_MOVE = {
  type: "tween" as const,
  duration: 1,
  ease: [0.4, 0, 0.2, 1] as const,
};

export const LAND_FADE = {
  type: "tween" as const,
  delay: 0.2,
  duration: 0.8,
  ease: "easeOut" as const,
};

export const CHAT_MOVE = {
  type: "tween" as const,
  duration: 0.5,
  ease: [0.4, 0, 0.2, 1] as const,
};

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

export function Brand({
  kicker = "Manufacturing as a service",
  afterTitle,
}: {
  kicker?: string;
  afterTitle?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const layout = reduce ? { duration: 0 } : LAYOUT_MOVE;
  return (
    <span className="chrome-brand">
      <motion.span layout layoutId={LAYOUT_MARK} className="chrome-mark-wrap" transition={{ layout }}>
        <BrandMark />
      </motion.span>
      <span>
        <div className="chrome-title">
          <motion.span layout layoutId={LAYOUT_WORD} className="chrome-title-word" transition={{ layout }}>
            FILE <span className="chrome-title-arrow">→</span> FACTORY
          </motion.span>
          {afterTitle}
        </div>
        <motion.div layout layoutId={LAYOUT_KICKER} className="chrome-kicker" transition={{ layout }}>
          {kicker}
        </motion.div>
      </span>
    </span>
  );
}

export function NetworkDot() {
  return (
    <span className="chrome-status-dot" aria-hidden>
      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
      </svg>
    </span>
  );
}

const THEME_HI = { bright: "#ffffff", dark: "#1c1c1c" } as const;

export function Segment({
  value,
  options,
  onChange,
  ariaLabel,
  variant,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  ariaLabel?: string;
  variant?: "theme";
}) {
  const reduce = useReducedMotion();
  const themeHi = variant === "theme";
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const count = Math.max(1, options.length);
  const duration = reduce ? 0 : themeHi ? THEME_DISSOLVE_MS / 1000 : 0.2;
  return (
    <Surface
      relief="inset"
      className={`seg${themeHi ? " seg-theme" : ""}`}
      data-value={value}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      <motion.span
        className="seg-hi"
        aria-hidden
        initial={false}
        style={{ width: `calc((100% - 6px - ${(count - 1) * 2}px) / ${count})` }}
        animate={{
          x: `calc(${idx} * (100% + 2px))`,
          ...(themeHi ? { backgroundColor: value === "dark" ? THEME_HI.dark : THEME_HI.bright } : {}),
        }}
        transition={{ duration, ease: [0.4, 0, 0.2, 1] }}
      />
      {options.map((o) => (
        <Surface
          key={o.id}
          as="button"
          type="button"
          role="radio"
          aria-checked={value === o.id}
          active={value === o.id}
          onClick={() => onChange(o.id)}
        >
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

export function Switch({ on, onToggle, label, note }: { on: boolean; onToggle: () => void; label: string; note?: string }) {
  return (
    <div className="chrome-switch-row">
      <span className="chrome-switch-copy">
        <span className="chrome-switch-label">{label}</span>
        {note ? <span className="chrome-switch-note">{note}</span> : null}
      </span>
      <button type="button" className={`sf sf-inset switch${on ? " is-on" : ""}`} onClick={onToggle} aria-pressed={on} aria-label={label}>
        <span className="switch-knob" />
      </button>
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
  title, code, z, x, y, width = 420, height, kind, query, hidden, autoSize, locked, tilt, enter, flash, flashKey, selected, viewport, nodeId, flow, onFocus, onClose, onHide, onDrag, onGrab, onFit, children,
}: {
  title: string; code: string; z: number; x: number; y: number; width?: number; height?: number;
  kind?: string; query?: string; hidden?: boolean; autoSize?: boolean; locked?: boolean; tilt?: number; enter?: boolean;
  flash?: boolean; flashKey?: number;
  selected?: boolean; viewport?: boolean;
  nodeId?: string;
  flow?: boolean;
  onFocus: (e: PointerEvent<HTMLDivElement>) => void; onClose?: () => void; onHide?: () => void;
  onDrag?: (e: PointerEvent<HTMLDivElement>) => void;
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
      className={`win${kind ? ` win-${kind}` : ""}${viewport ? " win-viewport" : ""}${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}${fit ? " win-autosize" : ""}${enter ? " win-enter" : ""}${flow ? " win-flow" : ""}`}
      data-node-id={nodeId}
      style={{
        left: flow ? undefined : x,
        top: flow ? undefined : y,
        zIndex: flow ? undefined : z,
        width: flow ? "100%" : width,
        height: fit ? undefined : height,
        display: hidden ? "none" : undefined,
        transform: tilt && Math.abs(tilt) > 0.05 ? `rotate(${tilt.toFixed(2)}deg)` : undefined,
      }}
      onPointerDown={(e) => {
        if (!flow) e.stopPropagation();
        if (e.button === 0) onFocus(e);
        if (flow || e.button !== 0 || locked) return;
        const t = e.target as HTMLElement;
        if (t.closest("button, input, textarea, a, select, .composer")) return;
        if (onGrab) onGrab(e);
        else if (t.closest(".win-bar")) onDrag?.(e);
      }}
    >
      <div className="win-bar">
        <span className="win-dot" />
        <span className="win-title">{title}</span>
        <span className="win-code">{code}</span>
        {locked && <span className="win-lock" title="Locked in place">Locked</span>}
        {onHide && (
          <Surface as="button" type="button" relief="ghost" className="win-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onHide} title="Hide">–</Surface>
        )}
        {onClose && (
          <Surface as="button" type="button" relief="ghost" className="win-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} title="Close">×</Surface>
        )}
      </div>
      <div className={`win-body${flow ? " nowheel nodrag nopan" : ""}`}>{children}</div>
      <div className="win-far-label" aria-hidden>
        <span className="win-far-title">{title}</span>
        {query ? <span className="win-far-query">{query}</span> : null}
      </div>
      {flash ? <div key={flashKey} className="win-flash-overlay" aria-hidden /> : null}
    </Surface>
  );
}

function AccentDots() {
  const { accent, setAccent } = useSession();
  return (
    <div className="settings-finish">
      <div className="settings-finish-name">{ACCENTS[accent].label}</div>
      <div className="viz-accents" role="group" aria-label="Accent color">
        {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`viz-dot${accent === id ? " is-on" : ""}`}
            style={{ background: ACCENTS[id].acc }}
            title={ACCENTS[id].label}
            aria-label={`Switch to ${ACCENTS[id].label.toLowerCase()} theme`}
            aria-pressed={accent === id}
            onClick={() => setAccent(id)}
          />
        ))}
      </div>
    </div>
  );
}

type ChromeMenuId = "settings" | "account";

function ChromeMenu({
  open,
  onClose,
  label,
  cardClass,
  dataHelp,
  trigger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  cardClass?: string;
  dataHelp?: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as HTMLElement;
      if (box.current?.contains(t)) return;
      if (t.closest?.(".help-overlay, .help-fab")) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    // Arm after this gesture so the opening click cannot dismiss the menu.
    const arm = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDoc);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="chrome-menu" ref={box}>
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            className="chrome-menu-pop"
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <Surface className={`chrome-menu-card${cardClass ? ` ${cardClass}` : ""}`} role="dialog" aria-label={label} data-help={dataHelp}>
              {children}
            </Surface>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LookOverflow({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const {
    theme, setTheme,
    showWires, setShowWires, showGrid, setShowGrid,
  } = useSession();

  return (
    <ChromeMenu
      open={open}
      onClose={() => onOpenChange(false)}
      label="Settings"
      cardClass="viz-panel"
      trigger={(
        <Surface
          as="button"
          type="button"
          relief="ghost"
          className="viz-toggle chrome-icon"
          active={open}
          onClick={() => onOpenChange(!open)}
          aria-label="Settings"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Surface>
      )}
    >
      <div className="chrome-menu-title">Settings</div>
      <Segment
        value={theme}
        variant="theme"
        ariaLabel="Lighting"
        options={[{ id: "bright", label: "Light" }, { id: "dark", label: "Dark" }]}
        onChange={(id) => setTheme(id as "bright" | "dark")}
      />
      <AccentDots />
      <div className="settings-tools">
        <Switch
          on={showWires}
          onToggle={() => setShowWires(!showWires)}
          label="Wires"
          note="Lines between windows"
        />
        <Switch
          on={showGrid}
          onToggle={() => setShowGrid(!showGrid)}
          label="Grid"
          note="Studio graph paper"
        />
      </div>
    </ChromeMenu>
  );
}

function ProfileMenu({
  session, onSignOut, open, onOpenChange,
}: {
  session: Session;
  onSignOut: () => void;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <ChromeMenu
      open={open}
      onClose={() => onOpenChange(false)}
      label="Account"
      trigger={(
        <Surface
          as="button"
          type="button"
          relief="ghost"
          className="user-menu-toggle chrome-icon"
          active={open}
          onClick={() => onOpenChange(!open)}
          aria-label="Account"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Account"
        >
          <span className="avatar">{session.name[0]}</span>
        </Surface>
      )}
    >
      <div className="chrome-menu-title">Account</div>
      <div className="user-menu-who">
        <span className="avatar">{session.name[0]}</span>
        <span>
          <div className="user-menu-name">{session.name}</div>
          <div className="user-menu-meta">{session.email}</div>
        </span>
      </div>
      <div className="chrome-menu-facts">
        <div className="chrome-menu-fact">
          <span className="chrome-menu-label">Role</span>
          <strong>{ROLES[session.role].label}</strong>
        </div>
        <div className="chrome-menu-fact">
          <span className="chrome-menu-label">Company</span>
          <strong>{COMPANIES[session.company].name}</strong>
        </div>
      </div>
      <Surface as="button" type="button" className="user-chip-out" onClick={onSignOut}>
        Sign out
      </Surface>
    </ChromeMenu>
  );
}

function notePreview(body?: string) {
  return (body ?? "").replace(/\s+/g, " ").trim();
}

function studioSize() {
  const el = document.querySelector(".studio");
  if (!el) return { width: 1200, height: 700 };
  const box = el.getBoundingClientRect();
  return { width: box.width, height: box.height };
}

function IconNote() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M15 3v5h5" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}
function IconTile() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="5.3" height="8" rx="1.2" />
      <rect x="10.3" y="3" width="10.7" height="8" rx="1.2" />
      <rect x="3" y="13" width="10.7" height="8" rx="1.2" />
      <rect x="15.7" y="13" width="5.3" height="8" rx="1.2" />
    </svg>
  );
}
function IconBin() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}
function IconEye({ off }: { off?: boolean }) {
  return off ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4 10 7-.4 1.1-1.2 2.3-2.2 3.4" />
      <path d="M6.1 6.1C4.2 7.5 2.7 9.3 2 12c1 3 5 7 10 7 1.3 0 2.5-.3 3.6-.8" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function WindowsMenu({ onOpen }: { onOpen?: () => void }) {
  const {
    nodes, entries, overviewOpen, setOverviewOpen, previewId, setPreviewId,
    tile, show, hide, close, focusTargets, clear, addNote,
  } = useWorkspace();
  const boardNodes = nodes.filter((n) => n.id !== CONCIERGE_ID && n.kind !== "log");
  const countLabel = boardNodes.length === 1 ? "Windows, 1 open" : `Windows, ${boardNodes.length} open`;
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!overviewOpen) setConfirmClear(false);
  }, [overviewOpen]);

  const hasLogOrConcierge = entries.length > 0 || nodes.some((n) => n.kind === "log" || n.id === CONCIERGE_ID);
  const viewport = studioSize();

  function onClearBoard() {
    if (hasLogOrConcierge) {
      setConfirmClear(true);
      return;
    }
    clear();
  }

  function zoomTo(id: string) {
    show(id);
    focusTargets([id], viewport);
  }

  return (
    <ChromeMenu
      open={overviewOpen}
      onClose={() => setOverviewOpen(false)}
      label="Windows"
      cardClass="overview"
      dataHelp="overview"
      trigger={(
        <Surface
          as="button"
          type="button"
          relief="ghost"
          className="chrome-windows chrome-icon"
          data-help="chrome-windows"
          active={overviewOpen}
          aria-label={countLabel}
          aria-expanded={overviewOpen}
          aria-haspopup="dialog"
          title={countLabel}
          onClick={() => {
            onOpen?.();
            setOverviewOpen(!overviewOpen);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="0" y="0" width="5" height="5" rx="1" />
            <rect x="7" y="0" width="5" height="5" rx="1" />
            <rect x="0" y="7" width="5" height="5" rx="1" />
            <rect x="7" y="7" width="5" height="5" rx="1" />
          </svg>
        </Surface>
      )}
    >
      <div className="overview-head">
        <span className="chrome-menu-title">{confirmClear ? "Clear board" : "Windows"}</span>
        {confirmClear ? (
          <button type="button" className="overview-text-btn" onClick={() => setConfirmClear(false)}>Back</button>
        ) : (
          <span className="overview-count">{boardNodes.length === 0 ? "None open" : boardNodes.length === 1 ? "1 open" : `${boardNodes.length} open`}</span>
        )}
      </div>

      {confirmClear ? (
        <div className="overview-clear-prompt">
          <p>Also clear the request log and Concierge?</p>
          <div className="overview-actions">
            <button type="button" className="overview-action" onClick={() => { setConfirmClear(false); clear(); }}>
              Keep those
            </button>
            <button type="button" className="overview-action is-danger" onClick={() => { setConfirmClear(false); clear({ transcript: true }); }}>
              Clear everything
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="overview-toolbar" role="toolbar" aria-label="Window tools">
            <button type="button" className="overview-tool-btn" disabled={boardNodes.length === 0} onClick={() => addNote()} title="Add a note" aria-label="Add a note">
              <IconNote />
            </button>
            <button type="button" className="overview-tool-btn" disabled={boardNodes.length === 0} onClick={() => tile(viewport)} title="Tile windows" aria-label="Tile windows">
              <IconTile />
            </button>
            <button type="button" className="overview-tool-btn is-danger" disabled={boardNodes.length === 0} onClick={onClearBoard} title="Clear the board" aria-label="Clear the board">
              <IconBin />
            </button>
          </div>

          {boardNodes.length === 0 ? (
            <div className="overview-empty">
              <p>Ask Concierge or add a note. Open apps will show up here.</p>
            </div>
          ) : (
            <ul className="overview-list" onPointerLeave={() => setPreviewId(null)}>
              {boardNodes.map((n) => {
                const preview = n.kind === "note" ? notePreview(n.body) : "";
                return (
                <li
                  key={n.id}
                  className={`overview-row${previewId === n.id ? " is-on" : ""}`}
                  onPointerEnter={() => setPreviewId(n.id)}
                >
                  <button type="button" className="overview-row-hit" onClick={() => zoomTo(n.id)}>
                    <span className="win-dot" />
                    <span className="overview-item-copy">
                      <strong>{n.title}</strong>
                      {n.hidden ? (
                        <span className="overview-item-note">Hidden</span>
                      ) : preview ? (
                        <span className="overview-item-note">{preview}</span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="overview-icon-btn"
                    onClick={() => (n.hidden ? show(n.id) : hide(n.id))}
                    title={n.hidden ? "Show" : "Hide"}
                    aria-label={n.hidden ? `Show ${n.title}` : `Hide ${n.title}`}
                  >
                    <IconEye off={n.hidden} />
                  </button>
                  {canDeleteNode(n) ? (
                    <button type="button" className="overview-icon-btn" onClick={() => close(n.id)} title="Close" aria-label={`Close ${n.title}`}>
                      <IconX />
                    </button>
                  ) : (
                    <span className="overview-icon-spacer" />
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </ChromeMenu>
  );
}

export function Chrome({
  session, onSignOut, leaving = false,
}: {
  session: Session | null;
  onSignOut: () => void;
  leaving?: boolean;
}) {
  const reduce = useReducedMotion();
  const layout = reduce ? { duration: 0 } : LAYOUT_MOVE;
  const land = reduce ? { duration: 0 } : LAND_FADE;
  const extras = leaving ? { opacity: 0 } : { opacity: 1 };
  const extrasMove = leaving
    ? (reduce ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const })
    : land;
  const { overviewOpen, setOverviewOpen } = useWorkspace();
  const [menu, setMenu] = useState<ChromeMenuId | null>(null);

  useEffect(() => {
    if (leaving) {
      setMenu(null);
      setOverviewOpen(false);
    }
  }, [leaving, setOverviewOpen]);

  return (
    <div className="chrome-stack">
      <motion.div layout layoutId={LAYOUT_CHROME} className="chrome-plate" transition={{ layout }} />
      <header className="chrome">
        <Link to={session ? "/" : "/login"} aria-label="File to Factory home"><Brand /></Link>
        <div className="chrome-actions">
          <div className="chrome-tools">
            <motion.div
              className="chrome-status"
              tabIndex={0}
              title="Decentralized network online"
              aria-label="Decentralized network online"
              initial={reduce ? false : { opacity: 0 }}
              animate={extras}
              transition={extrasMove}
            >
              <span className="chrome-status-copy" aria-hidden>
                <span className="chrome-status-copy-inner">Decentralized network online</span>
              </span>
              <motion.span layout layoutId={LAYOUT_DOT} className="chrome-network-dot" transition={{ layout }}>
                <NetworkDot />
              </motion.span>
            </motion.div>
            <span className="chrome-tools-gap" aria-hidden />
            <motion.div
              className="chrome-tool-btns"
              data-help="chrome-look"
              initial={reduce ? false : { opacity: 0 }}
              animate={extras}
              transition={extrasMove}
            >
              {session && <WindowsMenu onOpen={() => setMenu(null)} />}
              <LookOverflow
                open={menu === "settings"}
                onOpenChange={(next) => {
                  if (next) setOverviewOpen(false);
                  setMenu(next ? "settings" : null);
                }}
              />
              {session && (
                <ProfileMenu
                  session={session}
                  onSignOut={onSignOut}
                  open={menu === "account"}
                  onOpenChange={(next) => {
                    if (next) setOverviewOpen(false);
                    setMenu(next ? "account" : null);
                  }}
                />
              )}
            </motion.div>
          </div>
        </div>
      </header>
    </div>
  );
}

