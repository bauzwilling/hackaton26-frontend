import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Surface } from "../components/kit";
import { measureAnchor, useHelp } from "../context/help";

const CARD_W = 360;
const CARD_H = 188;
const MARGIN = 16;

export function HelpFab() {
  const { startHelp } = useHelp();
  return (
    <Surface
      as="button"
      type="button"
      relief="raised"
      className="studio-tool help-fab chrome-icon"
      data-help="help-fab"
      onClick={startHelp}
      aria-label="Help"
      title="Help"
    >
      <span className="studio-tool-tip" aria-hidden>Help</span>
      <span className="studio-help-mark">?</span>
    </Surface>
  );
}

const PAN_HINT_KEY = "f2f.panHintSeen";

function panHintSeen() {
  try {
    return localStorage.getItem(PAN_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

function markPanHintSeen() {
  try {
    localStorage.setItem(PAN_HINT_KEY, "1");
  } catch { /* ignore */ }
}

/** First-visit canvas tip. Not the Help tour overlay. */
export function PanHint({ interactive }: { interactive: boolean }) {
  const { phase, startRoleTour } = useHelp();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(() => !panHintSeen());

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || !visible) return;
    if (phase !== "idle") {
      markPanHintSeen();
      setVisible(false);
    }
  }, [ready, visible, phase]);

  function dismiss() {
    markPanHintSeen();
    setVisible(false);
  }

  if (!ready || !visible || !interactive || phase !== "idle") return null;

  return (
    <Surface className="pan-hint" role="status">
      <p className="pan-hint-copy">This is a canvas. Drag to pan (two-finger slide on a trackpad), scroll or pinch to zoom.</p>
      <div className="pan-hint-actions">
        <Surface as="button" type="button" relief="ghost" className="help-card-btn" onClick={dismiss}>
          Got it
        </Surface>
        <Surface
          as="button"
          type="button"
          relief="accent"
          className="help-card-btn"
          onClick={() => {
            dismiss();
            startRoleTour();
          }}
        >
          Give me a tour
        </Surface>
      </div>
    </Surface>
  );
}

export function HelpOverlay() {
  const { phase, step, steps, stepIndex, appNodeId, iframeReady, pending, next, back, stop } = useHelp();
  const [hole, setHole] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const active = Boolean(step) && (phase === "touring" || (phase === "iframe" && !iframeReady));

  useLayoutEffect(() => {
    if (!active || !step) {
      setHole(null);
      return;
    }
    let timer = 0;
    const measure = () => {
      setHole(measureAnchor(step.anchor, appNodeId, step.pad ?? 8));
    };
    timer = window.setTimeout(measure, 120);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [active, step, appNodeId, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const measure = () => setHole(step ? measureAnchor(step.anchor, appNodeId, step.pad ?? 8) : null);
    const id = window.setInterval(measure, 400);
    return () => window.clearInterval(id);
  }, [active, step, appNodeId, stepIndex]);

  if (!active || !step) return null;

  // Always dock the explainer bottom-right so it never covers the spotlight.
  const card = {
    x: Math.max(MARGIN, window.innerWidth - CARD_W - MARGIN),
    y: Math.max(MARGIN, window.innerHeight - CARD_H - MARGIN),
  };
  const last = stepIndex >= steps.length - 1;
  const nextLabel = pending ? "Working…" : step.handoff === "plyworks-native" ? "Continue" : last ? "Done" : "Next";
  const backDisabled = pending || stepIndex <= 0;

  return createPortal(
    <div className="help-overlay" role="dialog" aria-label="Studio tour">
      <div
        className={`help-dim${hole ? " is-cutout" : ""}`}
        onPointerDown={(e) => e.preventDefault()}
      />
      {hole && (
        <div
          className="help-hole"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <Surface className="help-card is-docked" style={{ left: card.x, top: card.y }}>
        <p className="help-card-kicker">{stepIndex + 1} / {steps.length}</p>
        <h2 className="help-card-title">{step.title}</h2>
        <p className="help-card-body">{step.body}</p>
        <div className="help-card-actions">
          <Surface
            as="button"
            type="button"
            relief="ghost"
            className="help-card-btn"
            onClick={back}
            disabled={backDisabled}
            aria-disabled={backDisabled}
          >
            Previous
          </Surface>
          <Surface as="button" type="button" relief="ghost" className="help-card-btn" onClick={stop}>
            Exit tour
          </Surface>
          <Surface
            as="button"
            type="button"
            relief="accent"
            className="help-card-btn"
            onClick={next}
            disabled={pending}
            aria-disabled={pending}
          >
            {nextLabel}
          </Surface>
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
