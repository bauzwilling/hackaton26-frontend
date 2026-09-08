import type { WorkspaceApp } from "../context/workspace";

export const HELP_MSG = "f2f-help";
export const HELP_ZOOM_MAX = 2.4;

export type HelpTopicId = "studio" | "boxouts" | "simpleparts" | "plyworks";
export type HelpPhase = "idle" | "offering" | "touring" | "iframe";

export type HelpAnchor =
  | { type: "node"; id: string }
  | { type: "help"; id: string }
  | { type: "selector"; selector: string }
  | { type: "app"; appId: WorkspaceApp };

export type HelpPrepare =
  | "focus-concierge"
  | "focus-log"
  | "overview-open"
  | "overview-close"
  | "look-open"
  | "open-boxouts"
  | "open-simpleparts"
  | "open-plyworks";

export type HelpStep = {
  id: string;
  title: string;
  body: string;
  anchor: HelpAnchor;
  pad?: number;
  prepare?: HelpPrepare;
  handoff?: "plyworks-iframe";
};

export const HELP_APP_TOPICS: HelpTopicId[] = ["boxouts", "simpleparts", "plyworks"];

export const HELP_TOPIC_LABEL: Record<HelpTopicId, string> = {
  studio: "General use",
  boxouts: "Door Box Out",
  simpleparts: "Simple Parts",
  plyworks: "Plyworks",
};

const OFFER_EXACT = /^(help|tour|help me|i need help)[!?.]?$/i;
const OFFER_PHRASE = /give me a tour|show me (a |the )?tour|how do i use (this|the studio)|walk me through/;

function matchAppName(lower: string): HelpTopicId | null {
  if (/\bplyworks\b|\bply works\b/.test(lower)) return "plyworks";
  if (/\bbox\s*outs?\b|\bdoor box/.test(lower)) return "boxouts";
  if (/\bsimple\s*parts?\b/.test(lower)) return "simpleparts";
  if (/\b(general use|the studio)\b/.test(lower)) return "studio";
  return null;
}

function isHelpish(lower: string) {
  return /\b(help|tour|explain|walk me through|show me around)\b/.test(lower)
    || /how do i use/.test(lower);
}

/** Idle Concierge intercept: offer chips, or jump into a named-app tour. */
export function matchHelpIntent(query: string): { kind: "offer" } | { kind: "topic"; topic: HelpTopicId } | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;
  const app = matchAppName(lower);
  if (app && isHelpish(lower)) return { kind: "topic", topic: app };
  if (OFFER_EXACT.test(lower) || OFFER_PHRASE.test(lower)) return { kind: "offer" };
  return null;
}

/** Follow-up while the help-offer chips are showing. */
export function matchHelpTopic(query: string): HelpTopicId | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;
  if (/^(general|studio|general use|dashboard)$/i.test(lower)) return "studio";
  const app = matchAppName(lower);
  if (app) return app;
  const intent = matchHelpIntent(query);
  if (intent?.kind === "topic") return intent.topic;
  if (intent?.kind === "offer") return "studio";
  return null;
}

export const STUDIO_TOUR: HelpStep[] = [
  {
    id: "concierge",
    title: "Concierge",
    body: "Ask in words or drop a file. Replies land here, and the right app opens on the canvas.",
    anchor: { type: "node", id: "concierge" },
    prepare: "focus-concierge",
    pad: 10,
  },
  {
    id: "log",
    title: "Request log",
    body: "Every ask is kept here. Click a row to zoom back to that window.",
    anchor: { type: "node", id: "request-log" },
    prepare: "focus-log",
    pad: 10,
  },
  {
    id: "canvas",
    title: "Canvas",
    body: "Right-drag to pan. Scroll to zoom. Drag a window by its title bar to move it.",
    anchor: { type: "help", id: "studio-canvas" },
    pad: 4,
  },
  {
    id: "hint",
    title: "Right-click ask",
    body: "Right-click empty canvas for a quick ask menu — same Concierge, without hunting for the window.",
    anchor: { type: "help", id: "studio-hint" },
    pad: 8,
  },
  {
    id: "overview",
    title: "All windows",
    body: "Overview lists every window. Arrange tiles them, hide tucks one away, and templates replay a view.",
    anchor: { type: "help", id: "overview" },
    prepare: "overview-open",
    pad: 10,
  },
  {
    id: "drop",
    title: "File drop",
    body: "Drop CSV, DXF, images, or PDF onto the canvas. The Concierge routes the file to the right app.",
    anchor: { type: "help", id: "studio-drop" },
    prepare: "overview-close",
    pad: 4,
  },
  {
    id: "look",
    title: "Look",
    body: "Theme, accent colour, and canvas options (wires, grid, bubble mode) live up here.",
    anchor: { type: "help", id: "chrome-look" },
    prepare: "look-open",
    pad: 10,
  },
];

export const BOXOUTS_TOUR: HelpStep[] = [
  {
    id: "boxouts-what",
    title: "Door Box Out",
    body: "Dimensioned wood box-outs for doors and openings — widths, heights, depths, and counts.",
    anchor: { type: "app", appId: "boxouts" },
    prepare: "open-boxouts",
    pad: 8,
  },
  {
    id: "boxouts-start",
    title: "Start from the Concierge",
    body: "Ask for a box-out in words, or drop a CSV. You can also open Door Box Out from the chips.",
    anchor: { type: "app", appId: "boxouts" },
    pad: 8,
  },
  {
    id: "boxouts-results",
    title: "Results on the canvas",
    body: "The app stays in this window. Quotes, nests, and follow-ups remain on the board next to the Concierge.",
    anchor: { type: "app", appId: "boxouts" },
    pad: 8,
  },
];

export const SIMPLEPARTS_TOUR: HelpStep[] = [
  {
    id: "parts-what",
    title: "Simple Parts",
    body: "Laser-cut and milled parts from DXF — brackets, plates, acrylic, metal.",
    anchor: { type: "app", appId: "simpleparts" },
    prepare: "open-simpleparts",
    pad: 8,
  },
  {
    id: "parts-start",
    title: "Start from the Concierge",
    body: "Drop a DXF or ask to open Simple Parts. The Concierge puts the file in this window.",
    anchor: { type: "app", appId: "simpleparts" },
    pad: 8,
  },
  {
    id: "parts-results",
    title: "Results on the canvas",
    body: "Previews and exports stay here on the canvas, wired back to the request that opened them.",
    anchor: { type: "app", appId: "simpleparts" },
    pad: 8,
  },
];

export const PLYWORKS_HOST_TOUR: HelpStep[] = [
  {
    id: "plyworks-what",
    title: "Plyworks",
    body: "A plywood furniture configurator. Next we will walk through the panels inside this window.",
    anchor: { type: "app", appId: "plyworks" },
    prepare: "open-plyworks",
    pad: 8,
    handoff: "plyworks-iframe",
  },
];

export function tourFor(topic: HelpTopicId): HelpStep[] {
  if (topic === "boxouts") return BOXOUTS_TOUR;
  if (topic === "simpleparts") return SIMPLEPARTS_TOUR;
  if (topic === "plyworks") return PLYWORKS_HOST_TOUR;
  return STUDIO_TOUR;
}

export function queryHelpAnchor(anchor: HelpAnchor, appNodeId?: string | null): HTMLElement | null {
  if (anchor.type === "node") return document.querySelector(`[data-node-id="${anchor.id}"]`);
  if (anchor.type === "help") return document.querySelector(`[data-help="${anchor.id}"]`);
  if (anchor.type === "selector") return document.querySelector(anchor.selector);
  if (appNodeId) return document.querySelector(`[data-node-id="${appNodeId}"]`);
  return null;
}

type HelpAskHandler = (query: string) => boolean;
let helpAskHandler: HelpAskHandler | null = null;

export function setHelpAskHandler(handler: HelpAskHandler | null) {
  helpAskHandler = handler;
}

export function tryHelpAsk(query: string) {
  return helpAskHandler?.(query) ?? false;
}
