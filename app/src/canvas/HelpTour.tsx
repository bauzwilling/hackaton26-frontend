import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Surface } from "../components/kit";
import { measureAnchor, useHelp } from "../context/help";

const CARD_W = 360;
const CARD_H = 188;
const MARGIN = 16;

function placeCard(hole: { top: number; left: number; width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  const spots = [
    { x: right + 12, y: hole.top },
    { x: hole.left, y: bottom + 12 },
    { x: hole.left - CARD_W - 12, y: hole.top },
    { x: hole.left, y: hole.top - CARD_H - 12 },
  ];
  for (const s of spots) {
    if (s.x >= MARGIN && s.y >= MARGIN && s.x + CARD_W <= vw - MARGIN && s.y + CARD_H <= vh - MARGIN) {
      return s;
    }
  }
  return {
    x: Math.min(vw - CARD_W - MARGIN, Math.max(MARGIN, vw - CARD_W - MARGIN)),
    y: Math.min(vh - CARD_H - MARGIN, Math.max(MARGIN, vh - CARD_H - MARGIN)),
  };
}

export function HelpFab() {
  const { phase, startHelp } = useHelp();
  const busy = phase !== "idle";
  return (
    <Surface
      as="button"
      type="button"
      relief={busy ? "accent" : "raised"}
      className="help-fab"
      onClick={startHelp}
      aria-label={busy ? "Exit help" : "Help"}
    >
      {busy ? "Exit" : "Help"}
    </Surface>
  );
}

export function HelpOverlay() {
  const { phase, step, steps, stepIndex, appNodeId, iframeReady, next, back, stop } = useHelp();
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
  }, [active, step, appNodeId]);

  if (!active || !step) return null;

  const card = hole ? placeCard(hole) : { x: MARGIN, y: window.innerHeight - CARD_H - MARGIN };
  const last = stepIndex >= steps.length - 1;
  const nextLabel = step.handoff === "plyworks-iframe" ? "Continue" : last ? "Done" : "Next";

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
      <Surface className="help-card" style={{ left: card.x, top: card.y }}>
        <p className="help-card-kicker">{stepIndex + 1} / {steps.length}</p>
        <h2 className="help-card-title">{step.title}</h2>
        <p className="help-card-body">{step.body}</p>
        <div className="help-card-actions">
          <Surface as="button" type="button" relief="ghost" className="help-card-btn" onClick={back}>
            Back
          </Surface>
          <Surface as="button" type="button" relief="ghost" className="help-card-btn" onClick={stop}>
            Skip
          </Surface>
          <Surface as="button" type="button" relief="accent" className="help-card-btn" onClick={next}>
            {nextLabel}
          </Surface>
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
