import { ROLES, type RoleId } from "./auth";
import { ADMIN_ROLE_CHIPS, MANAGER_ROLE_CHIPS, OPERATOR_ROLE_CHIPS } from "./catalog";
import type { WorkspaceApp } from "../context/workspace";

export const HELP_MSG = "f2f-help";
export const HELP_ZOOM_MAX = 2.4;

export type HelpTopicId = "studio" | "boxouts" | "simpleparts" | "plyworks" | "user" | "operator" | "manager" | "admin";
export type HelpPhase = "idle" | "offering" | "choosing-tour" | "touring" | "iframe";
export type LiveTourRole = "user" | "operator" | "manager" | "admin";

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
  | "open-plyworks"
  | "account-open"
  | "chrome-close"
  | "network-open"
  | "ensure-hero"
  | "ask-design-something"
  | "expand-history"
  | "select-table"
  | "focus-plyworks-produce"
  | "windows-demo"
  | "dock-concierge"
  | "open-jobs"
  | "open-orbit"
  | "open-profiles"
  | "open-machines-admin";

export type HelpStep = {
  id: string;
  title: string;
  body: string;
  anchor: HelpAnchor;
  pad?: number;
  prepare?: HelpPrepare;
  handoff?: "plyworks-native";
  /** Async prepare must finish before Next is enabled. */
  awaitPrepare?: boolean;
};

export const HELP_APP_TOPICS: HelpTopicId[] = ["boxouts", "simpleparts", "plyworks"];

export const HELP_TOPIC_LABEL: Record<HelpTopicId, string> = {
  studio: "General use",
  boxouts: "Door Box Out",
  simpleparts: "Simple Parts",
  plyworks: "Plyworks",
  user: "Studio tour",
  operator: "Operator tour",
  manager: "Manager tour",
  admin: "Admin tour",
};

export function isLiveTourRole(role: RoleId | null | undefined): role is LiveTourRole {
  return role === "user" || role === "operator" || role === "manager" || role === "admin";
}

export function canRequestRoleTour(role: RoleId | null | undefined) {
  return isLiveTourRole(role) || role === "superuser";
}

export function tourTopicForRole(role: RoleId | null | undefined): HelpTopicId | null {
  return isLiveTourRole(role) ? role : null;
}

/**
 * Role-chip → window for staff tours (same path as the user tour sending "table" into Plyworks).
 * WAITING MODEL: Concierge should open the matching app from the ask; these chips are the stand-in.
 */
export function staffTourAsk(topic: HelpTopicId | null, prepare: HelpPrepare): { query: string; app: WorkspaceApp } | null {
  if (prepare === "open-jobs") {
    if (topic === "operator") return { query: OPERATOR_ROLE_CHIPS[0], app: "jobs" };
    if (topic === "manager") return { query: MANAGER_ROLE_CHIPS[0], app: "jobs" };
  }
  if (prepare === "open-orbit") {
    if (topic === "operator") return { query: OPERATOR_ROLE_CHIPS[1], app: "orbit" };
    if (topic === "manager") return { query: MANAGER_ROLE_CHIPS[1], app: "orbit" };
  }
  if (prepare === "open-profiles" && topic === "admin") {
    return { query: ADMIN_ROLE_CHIPS[0], app: "profiles" };
  }
  if (prepare === "open-machines-admin" && topic === "admin") {
    return { query: ADMIN_ROLE_CHIPS[1], app: "machines-admin" };
  }
  return null;
}

export const TOUR_DESIGN_ASK = "I want to design something";
export const TOUR_TABLE_ASK = "table";

/** Fixed Help offer chips (tour held; capabilities go through Concierge/LLM). */
export type HelpOfferId = "capabilities" | "tour";

export const HELP_PLEASE = "Help please!";
export const HELP_OFFER_REPLY = "How can I help?";
export const HELP_OFFER_CHIPS: HelpOfferId[] = ["capabilities", "tour"];
export const HELP_OFFER_LABEL: Record<HelpOfferId, string> = {
  capabilities: "What can I do here?",
  tour: "Give me a tour",
};
export const TOUR_STUB_REPLY = "Tour is under development at the moment";

/** Real roles a superuser can preview — Superuser itself is not a tour. */
export const SUPERUSER_TOUR_ROLES: LiveTourRole[] = ["user", "operator", "manager", "admin"];
export const SUPERUSER_TOUR_REPLY =
  "Superuser is not a separate tour. Pick a role to walk through that journey.";
export const SUPERUSER_TOUR_ROLE_LABEL: Record<LiveTourRole, string> = {
  user: ROLES.user.label,
  operator: ROLES.operator.label,
  manager: ROLES.manager.label,
  admin: ROLES.admin.label,
};

export function matchTourRoleChoice(query: string): LiveTourRole | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;
  if (/^(user|studio)( tour)?[!?.]?$/.test(lower)) return "user";
  if (/^operator( tour)?[!?.]?$/.test(lower)) return "operator";
  if (/^manager( tour)?[!?.]?$/.test(lower)) return "manager";
  if (/^admin( tour)?[!?.]?$/.test(lower)) return "admin";
  return null;
}

const OFFER_EXACT = /^(help|tour|help me|i need help|help please)[!?.]?$/i;
const OFFER_PHRASE = /give me a tour|show me (a |the )?tour|how do i use (this|the studio)|walk me through/;

function matchAppName(lower: string): HelpTopicId | null {
  if (/\bplyworks\b|\bply works\b/.test(lower)) return "plyworks";
  if (/\bbox\s*outs?\b|\bdoor box/.test(lower)) return "boxouts";
  if (/\bsimple\s*parts?\b/.test(lower)) return "simpleparts";
  if (/\b(general use|the studio)\b/.test(lower)) return "studio";
  return null;
}

/** Idle Concierge intercept: open the Help offer (tour not started yet). */
export function matchHelpIntent(query: string): { kind: "offer" } | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;
  if (OFFER_EXACT.test(lower) || OFFER_PHRASE.test(lower)) return { kind: "offer" };
  return null;
}

/** Follow-up while the Help offer chips are showing. */
export function matchHelpOfferChoice(query: string): HelpOfferId | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;
  if (/^(what can i do( here)?|capabilities|what am i able to do)[!?.]?$/i.test(lower)) {
    return "capabilities";
  }
  if (/^(give me a tour|tour|show me (a |the )?tour)[!?.]?$/i.test(lower) || OFFER_PHRASE.test(lower)) {
    return "tour";
  }
  return null;
}

/** Legacy topic match kept for stored transcript chips / later tour wiring. */
export function matchHelpTopic(query: string): HelpTopicId | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;
  if (/^(general|studio|general use|dashboard)$/i.test(lower)) return "studio";
  return matchAppName(lower);
}

export const STUDIO_TOUR: HelpStep[] = [
  {
    id: "concierge",
    title: "Concierge",
    body: "Ask in words or drop a file. This is the Concierge — replies land here, and the right app opens on the canvas.",
    anchor: { type: "help", id: "concierge" },
    prepare: "focus-concierge",
    pad: 10,
  },
  {
    id: "history",
    title: "Chat history",
    body: "The sidebar mark lists earlier chats. Click it to open a temporary list — click outside to close. Open a chat and the thread slides out as the sidebar shrinks. While a chat is open, a filled mark means the sidebar is expanded. Collapsed, each earlier chat is a dot — hover for its name.",
    anchor: { type: "help", id: "session-history" },
    pad: 8,
  },
  {
    id: "log",
    title: "Activity log",
    body: "Opened and closed windows show up as timestamped italic lines in Concierge. The app name jumps to that window. The Logs button shows only those.",
    anchor: { type: "help", id: "concierge-log" },
    prepare: "focus-log",
    pad: 10,
  },
  {
    id: "canvas",
    title: "Canvas",
    body: "Once a window is on the board, drag to pan (two-finger slide on a trackpad), scroll or pinch to zoom, and drag a window by its title bar to move it.",
    anchor: { type: "help", id: "studio-canvas" },
    pad: 4,
  },
  {
    id: "hint",
    title: "Help",
    body: "The question mark opens this tour. Tips along the bottom appear after the first window is on the board.",
    anchor: { type: "help", id: "help-fab" },
    pad: 8,
  },
  {
    id: "overview",
    title: "All windows",
    body: "Windows lists every open app. Hover a row to find it on the canvas, click to zoom, then hide or close from the row.",
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
    title: "Settings",
    body: "Theme, accent colour, and canvas options (wires, grid) live in Settings up here.",
    anchor: { type: "help", id: "chrome-settings" },
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
    handoff: "plyworks-native",
  },
];

/** Shared hero + chrome prefix for every live role tour. */
export const TOUR_CHROME_PREFIX: HelpStep[] = [
  {
    id: "hero-chat",
    title: "Central chat",
    body: "Describe what you want to make, or drop a file. This is where every request starts.",
    anchor: { type: "help", id: "concierge" },
    prepare: "ensure-hero",
    pad: 10,
  },
  {
    id: "hero-chips",
    title: "Sample prompts",
    body: "These chips are ready-made asks — including a tour — to get you moving quickly.",
    anchor: { type: "help", id: "hero-chips" },
    pad: 8,
  },
  {
    id: "account",
    title: "Account",
    body: "Your profile lives here — name, email, and sign out.",
    anchor: { type: "help", id: "chrome-account" },
    prepare: "account-open",
    pad: 10,
  },
  {
    id: "settings",
    title: "Settings",
    body: "Theme, accent colour, and canvas options (wires, grid) live in Settings.",
    anchor: { type: "help", id: "chrome-settings" },
    prepare: "look-open",
    pad: 10,
  },
  {
    id: "network",
    title: "Network",
    body: "This mark shows the decentralized manufacturing network is online.",
    anchor: { type: "help", id: "chrome-network" },
    prepare: "network-open",
    pad: 8,
  },
];

const TOUR_HISTORY_STEP: HelpStep = {
  id: "history",
  title: "Chat history",
  body: "Open the sidebar to see earlier chats. Each past chat is listed here.",
  anchor: { type: "help", id: "session-history" },
  prepare: "expand-history",
  pad: 8,
};

const TOUR_WINDOWS_STEP: HelpStep = {
  id: "windows-canvas",
  title: "Open canvas",
  body: "Windows lets you find, hide, and tile apps on the board. Happy manufacturing.",
  anchor: { type: "help", id: "overview" },
  prepare: "windows-demo",
  awaitPrepare: true,
  pad: 10,
};

/** Live guided tour for the user role — always starts from the hero. */
export const USER_TOUR: HelpStep[] = [
  ...TOUR_CHROME_PREFIX,
  {
    id: "concierge-live",
    title: "Concierge",
    body: "You can talk to the Concierge here. Replies and choices land in this chat.",
    anchor: { type: "help", id: "concierge" },
    prepare: "ask-design-something",
    awaitPrepare: true,
    pad: 10,
  },
  TOUR_HISTORY_STEP,
  {
    id: "table-plyworks",
    title: "Design apps",
    body: "Pick a base design — Table opens Plyworks on the canvas.",
    anchor: { type: "app", appId: "plyworks" },
    prepare: "select-table",
    awaitPrepare: true,
    pad: 8,
  },
  {
    id: "produce-joinwiz",
    title: "Produce",
    body: "Produce checks the design for manufacture. JoinWiz opens when validation passes.",
    anchor: { type: "selector", selector: ".pw-corner-chip.is-produce, [data-help='tour-produce']" },
    prepare: "focus-plyworks-produce",
    awaitPrepare: true,
    pad: 8,
  },
  TOUR_WINDOWS_STEP,
];

export const OPERATOR_TOUR: HelpStep[] = [
  ...TOUR_CHROME_PREFIX,
  {
    id: "staff-concierge",
    title: "Concierge",
    body: "Ask here to open Jobs or Orbit. Concierge cannot assign or update jobs in chat yet — use the highlighted window.",
    anchor: { type: "help", id: "concierge" },
    prepare: "dock-concierge",
    awaitPrepare: true,
    pad: 10,
  },
  TOUR_HISTORY_STEP,
  {
    id: "operator-jobs",
    title: "Jobs",
    body: "Pick the machine you are operating to see its queue. Update progress and send feedback from the row.",
    anchor: { type: "selector", selector: "[data-help='jobs-machine-picker'], [data-help='jobs-board']" },
    prepare: "open-jobs",
    awaitPrepare: true,
    pad: 8,
  },
  {
    id: "operator-orbit",
    title: "Orbit",
    body: "CNC Orbit is the shop-floor dashboard — fleet status, worklists, and machines for this company.",
    anchor: { type: "selector", selector: "[data-help='orbit-page']" },
    prepare: "open-orbit",
    awaitPrepare: true,
    pad: 8,
  },
  TOUR_WINDOWS_STEP,
];

export const MANAGER_TOUR: HelpStep[] = [
  ...TOUR_CHROME_PREFIX,
  {
    id: "staff-concierge",
    title: "Concierge",
    body: "Ask here to open Jobs or Orbit. Concierge cannot assign or fulfill jobs in chat yet — use the highlighted window.",
    anchor: { type: "help", id: "concierge" },
    prepare: "dock-concierge",
    awaitPrepare: true,
    pad: 10,
  },
  TOUR_HISTORY_STEP,
  {
    id: "manager-jobs",
    title: "Jobs",
    body: "This is the company job list. Assign machines, then mark shipped and received when production is done.",
    anchor: { type: "selector", selector: "[data-help='jobs-board']" },
    prepare: "open-jobs",
    awaitPrepare: true,
    pad: 8,
  },
  {
    id: "manager-orbit",
    title: "Orbit",
    body: "CNC Orbit is the shop-floor dashboard — who is free, what is online, and worklists for this company.",
    anchor: { type: "selector", selector: "[data-help='orbit-page']" },
    prepare: "open-orbit",
    awaitPrepare: true,
    pad: 8,
  },
  TOUR_WINDOWS_STEP,
];

export const ADMIN_TOUR: HelpStep[] = [
  ...TOUR_CHROME_PREFIX,
  {
    id: "admin-concierge",
    title: "Concierge",
    body: "Ask here to open Profile Manager or Machine Inventory. Concierge cannot apply admin changes in chat yet — use the highlighted window.",
    anchor: { type: "help", id: "concierge" },
    prepare: "dock-concierge",
    awaitPrepare: true,
    pad: 10,
  },
  TOUR_HISTORY_STEP,
  {
    id: "admin-profiles",
    title: "Profile Manager",
    body: "Add, suspend, or change roles here. New profiles start suspended until you activate them.",
    anchor: { type: "selector", selector: "[data-help='profiles-head']" },
    prepare: "open-profiles",
    awaitPrepare: true,
    pad: 8,
  },
  {
    id: "admin-machines",
    title: "Machine Inventory",
    body: "Add, remove, or enable fleet machines for this company.",
    anchor: { type: "selector", selector: "[data-help='machines-admin-head']" },
    prepare: "open-machines-admin",
    awaitPrepare: true,
    pad: 8,
  },
  TOUR_WINDOWS_STEP,
];

export function tourFor(topic: HelpTopicId): HelpStep[] {
  if (topic === "user") return USER_TOUR;
  if (topic === "operator") return OPERATOR_TOUR;
  if (topic === "manager") return MANAGER_TOUR;
  if (topic === "admin") return ADMIN_TOUR;
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
