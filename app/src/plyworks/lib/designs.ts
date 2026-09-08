import type { Board } from "../types";
import { DEFAULT_LOOK, THICKNESS } from "../types";

export const DESIGN_IDS = ["shelf", "table", "stool", "bench"] as const;
export type DesignId = (typeof DESIGN_IDS)[number];

const T = THICKNESS;

/** Existing 7-panel cabinet, ~800 × 1200 × 320. Unchanged. */
const SHELF: Board[] = [
  { id: 1, name: "Side left",  w: T,   h: 1200, d: 320, x: -391, y: 600,  z: 0,    material: "kiefer" },
  { id: 2, name: "Side right", w: T,   h: 1200, d: 320, x: 391,  y: 600,  z: 0,    material: "kiefer" },
  { id: 3, name: "Top",        w: 800, h: T,    d: 320, x: 0,    y: 1191, z: 0,    material: "kiefer" },
  { id: 4, name: "Bottom",     w: 800, h: T,    d: 320, x: 0,    y: 9,    z: 0,    material: "kiefer" },
  { id: 5, name: "Shelf 1",    w: 800, h: T,    d: 320, x: 0,    y: 420,  z: 0,    material: "kiefer" },
  { id: 6, name: "Shelf 2",    w: 800, h: T,    d: 320, x: 0,    y: 800,  z: 0,    material: "kiefer" },
  { id: 7, name: "Back",       w: 800, h: 1200, d: T,   x: 0,    y: 600,  z: -151, material: "kiefer" },
];

/**
 * Slab-leg dining table: top 1400 × 18 × 800, top face at 750 mm.
 * Two side slabs + one long stretcher (not four posts).
 * Legs run through the top; stretcher runs through both legs (given joints).
 */
const TABLE: Board[] = [
  { id: 1, name: "Top",       w: 1400, h: T,   d: 800, x: 0,    y: 741, z: 0, material: "kiefer" },
  { id: 2, name: "Leg left",  w: T,    h: 750, d: 700, x: -641, y: 375, z: 0, material: "kiefer" },
  { id: 3, name: "Leg right", w: T,    h: 750, d: 700, x: 641,  y: 375, z: 0, material: "kiefer" },
  { id: 4, name: "Stretcher", w: 1300, h: 120, d: T,   x: 0,    y: 200, z: 0, material: "kiefer" },
];

/** Seat 350 × 18 × 350 at 450 mm; two side panels; front/back stretchers. */
const STOOL: Board[] = [
  { id: 1, name: "Seat",            w: 350, h: T,   d: 350, x: 0,    y: 441, z: 0,    material: "kiefer" },
  { id: 2, name: "Leg left",        w: T,   h: 450, d: 310, x: -146, y: 225, z: 0,    material: "kiefer" },
  { id: 3, name: "Leg right",       w: T,   h: 450, d: 310, x: 146,  y: 225, z: 0,    material: "kiefer" },
  { id: 4, name: "Stretcher front", w: 310, h: 80,  d: T,   x: 0,    y: 120, z: 120,  material: "kiefer" },
  { id: 5, name: "Stretcher back",  w: 310, h: 80,  d: T,   x: 0,    y: 120, z: -120, material: "kiefer" },
];

/** Same language as the stool; seat 1200 × 18 × 350. */
const BENCH: Board[] = [
  { id: 1, name: "Seat",            w: 1200, h: T,   d: 350, x: 0,    y: 441, z: 0,    material: "kiefer" },
  { id: 2, name: "Leg left",        w: T,    h: 450, d: 310, x: -571, y: 225, z: 0,    material: "kiefer" },
  { id: 3, name: "Leg right",       w: T,    h: 450, d: 310, x: 571,  y: 225, z: 0,    material: "kiefer" },
  { id: 4, name: "Stretcher front", w: 1160, h: 80,  d: T,   x: 0,    y: 120, z: 120,  material: "kiefer" },
  { id: 5, name: "Stretcher back",  w: 1160, h: 80,  d: T,   x: 0,    y: 120, z: -120, material: "kiefer" },
];

export const BASE_DESIGNS: Record<DesignId, Board[]> = {
  shelf: SHELF,
  table: TABLE,
  stool: STOOL,
  bench: BENCH,
};

export function parseDesignId(raw: string | null | undefined): DesignId {
  const id = (raw ?? "").trim().toLowerCase();
  return (DESIGN_IDS as readonly string[]).includes(id) ? (id as DesignId) : "shelf";
}

export function designFromSearch(search: string): DesignId {
  return parseDesignId(new URLSearchParams(search).get("design"));
}

export function boardsFor(id: DesignId): Board[] {
  return BASE_DESIGNS[id].map((b) => ({ look: DEFAULT_LOOK, ...b }));
}

export const OPEN_DESIGN_MESSAGE = "plyworks-open";

export function inStudioFrame() {
  return typeof window !== "undefined" && window.parent !== window;
}

export function requestNewDesignWindow(id: DesignId) {
  if (inStudioFrame()) {
    window.parent.postMessage({ type: OPEN_DESIGN_MESSAGE, design: id }, "*");
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("design", id);
  window.open(url.toString(), "_blank", "noopener");
}
