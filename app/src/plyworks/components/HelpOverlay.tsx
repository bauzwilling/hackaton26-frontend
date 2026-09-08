import { useEffect, useLayoutEffect, useState } from "react";
import { PLYWORKS_TOUR, queryPlyHelp } from "../lib/helpTour";

const CARD_W = 340;
const CARD_H = 176;
const MARGIN = 12;

function placeCard(hole: { top: number; left: number; width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  const spots = [
    { x: hole.left - CARD_W - 12, y: hole.top },
    { x: hole.left, y: bottom + 12 },
    { x: right + 12, y: hole.top },
    { x: hole.left, y: hole.top - CARD_H - 12 },
  ];
  for (const s of spots) {
    if (s.x >= MARGIN && s.y >= MARGIN && s.x + CARD_W <= vw - MARGIN && s.y + CARD_H <= vh - MARGIN) {
      return s;
    }
  }
  return {
    x: Math.min(vw - CARD_W - MARGIN, Math.max(MARGIN, MARGIN)),
    y: Math.min(vh - CARD_H - MARGIN, Math.max(MARGIN, vh - CARD_H - MARGIN)),
  };
}

export function HelpOverlay({
  index,
  onNext,
  onBack,
  onStop,
}: {
  index: number;
  onNext: () => void;
  onBack: () => void;
  onStop: () => void;
}) {
  const step = PLYWORKS_TOUR[index];
  const [hole, setHole] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = queryPlyHelp(step.selector);
      if (!el) {
        setHole(null);
        return;
      }
      const box = el.getBoundingClientRect();
      const pad = 8;
      setHole({
        top: box.top - pad,
        left: box.left - pad,
        width: Math.max(24, box.width + pad * 2),
        height: Math.max(24, box.height + pad * 2),
      });
    };
    const timer = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [step, index]);

  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = queryPlyHelp(step.selector);
      if (!el) return;
      const box = el.getBoundingClientRect();
      const pad = 8;
      setHole({
        top: box.top - pad,
        left: box.left - pad,
        width: Math.max(24, box.width + pad * 2),
        height: Math.max(24, box.height + pad * 2),
      });
    };
    const id = window.setInterval(measure, 400);
    return () => window.clearInterval(id);
  }, [step, index]);

  if (!step) return null;

  const card = hole ? placeCard(hole) : { x: MARGIN, y: window.innerHeight - CARD_H - MARGIN };
  const last = index >= PLYWORKS_TOUR.length - 1;

  return (
    <div className="pw-help-overlay" role="dialog" aria-label="Plyworks tour">
      <div className={`pw-help-dim${hole ? " is-cutout" : ""}`} />
      {hole && (
        <div
          className="pw-help-hole"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <div className="pw-help-card" style={{ left: card.x, top: card.y }}>
        <p className="pw-help-kicker">{index + 1} / {PLYWORKS_TOUR.length}</p>
        <h2 className="pw-help-title">{step.title}</h2>
        <p className="pw-help-body">{step.body}</p>
        <div className="pw-help-actions">
          <button type="button" className="pw-btn" onClick={onBack}>Back</button>
          <button type="button" className="pw-btn" onClick={onStop}>Skip</button>
          <button type="button" className="pw-btn is-primary" onClick={onNext}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
