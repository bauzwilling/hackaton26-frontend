/**
 * Last-resort intent match, used only when the assistant request fails.
 *
 * Claude does the routing on the happy path; this exists so a dead backend does not
 * make the Studio unusable (msd-concierge-ui: "manufacturing stays usable without AI").
 *
 * WAITING BFF: the capability manifest is BFF-owned, so this alias table is a fixture.
 * WAITING MODEL: stands in for the structuring model when /api/chat is unreachable.
 */
import { inferConciergeKind, PLYWORKS_DESIGNS, type ConciergeKind, type PlyworksDesign } from "./concierge";

/** Offline deny copy for the "Will it rain?" landing wildcard. */
export const RAIN_DENY_REPLY =
  "That's outside File → Factory — I can help with design, jobs, machines, or your workspace.";

const APP_ALIASES: { app: string; patterns: RegExp[] }[] = [
  { app: "boxouts", patterns: [/\bdoor\s*box\s*-?\s*outs?\b/i, /\bbox\s*-?\s*outs?\b/i] },
  // Creative landing chips + app names — specific phrases before loose manufacturing language.
  { app: "simpleparts", patterns: [/\blaser[-\s]?cut\s+brackets?\b/i, /\bsimple\s*-?\s*parts?\b/i] },
  { app: "plyworks", patterns: [/\bply\s*-?\s*works?\b/i] },
  {
    app: "orbit",
    patterns: [
      /\b(cnc\s*)?orbit\b/i,
      /\bshop\s*floor\b/i,
      /\bwho'?s\s+free\b/i,
      /\bfree\s+on\s+the\s+floor\b/i,
    ],
  },
  {
    app: "jobs",
    patterns: [
      /\bjob\s+status\b/i,
      /\bassigned\s+jobs?\b/i,
      /\bproduction\s+(?:jobs?|board)\b/i,
      /\bjobs?\b/i,
    ],
  },
  {
    app: "profiles",
    patterns: [
      /\bwho\s+can\s+sign\s+in\b/i,
      /\bcompany\s+profiles?\b/i,
      /\bprofile\s*manager\b/i,
      /\b(admin(\s*console)?|users?\s*manager)\b/i,
    ],
  },
  {
    app: "machines-admin",
    patterns: [
      /\bmachines?\s+(?:are\s+)?in\s+the\s+fleet\b/i,
      /\bmachine\s+fleet\b/i,
      /\bmachine\s*(inventory|manager)\b/i,
    ],
  },
  { app: "projects", patterns: [/\bprojects?\b/i] },
];

const DESIGN_ALIASES: { design: PlyworksDesign; patterns: RegExp[] }[] = [
  { design: "shelf", patterns: [/\b(book)?shel(?:f|ves)\b/i, /\bcabinets?\b/i, /\bshelving\b/i] },
  { design: "table", patterns: [/\btables?\b/i, /\bdesks?\b/i] },
  { design: "stool", patterns: [/\bstools?\b/i] },
  { design: "bench", patterns: [/\bbenches\b/i, /\bbench\b/i] },
];

const VAGUE_FURNITURE = /\b(furniture|plywood|ply\s*wood)\b/i;
/** Vague design asks that should offer Plyworks base designs. */
const DESIGN_SOMETHING = /\bi want to design something\b|\bdesign something\b|\bmake (me )?something\b/i;

/** Loose manufacturing language that could fit more than one job app. */
const AMBIGUOUS_JOB = /\b(parts?\s+to\s+cut|cut\s+parts?|sheet\s+metal|laser\s+cut|cnc\s+parts?|boxes?\s+and\s+parts?)\b/i;

/** WAITING MODEL: off-topic wildcard chip when the structuring model is unreachable. */
const RAIN_ASK = /\bwill it rain\b/i;

export type LocalRoute = {
  kind: ConciergeKind;
  app: string | null;
  design: PlyworksDesign | null;
  choices: PlyworksDesign[] | null;
  confirmApps: string[] | null;
  reply?: string | null;
};

function withKind(route: Omit<LocalRoute, "kind"> & { kind?: ConciergeKind }): LocalRoute {
  const { kind: forced, ...rest } = route;
  return { ...rest, kind: forced ?? inferConciergeKind(rest) };
}

/** Returns a workspace app id when the text plainly names one, otherwise null. */
export function matchApp(message: string): string | null {
  for (const { app, patterns } of APP_ALIASES) {
    if (patterns.some((p) => p.test(message))) return app;
  }
  return null;
}

export function matchPlyworksDesign(message: string): PlyworksDesign | null {
  for (const { design, patterns } of DESIGN_ALIASES) {
    if (patterns.some((p) => p.test(message))) return design;
  }
  return null;
}

/** App + Plyworks design (or choice / confirm chips) when Claude is unreachable. */
export function matchLocalRoute(message: string): LocalRoute {
  if (RAIN_ASK.test(message)) {
    return {
      kind: "deny",
      app: null,
      design: null,
      choices: null,
      confirmApps: null,
      reply: RAIN_DENY_REPLY,
    };
  }

  const named = matchApp(message);
  const design = matchPlyworksDesign(message);

  if (named && named !== "plyworks") {
    return withKind({ app: named, design: null, choices: null, confirmApps: null });
  }
  if (design) {
    return withKind({ app: "plyworks", design, choices: null, confirmApps: null });
  }
  if (named === "plyworks") {
    return withKind({ app: "plyworks", design: "shelf", choices: null, confirmApps: null });
  }
  if (VAGUE_FURNITURE.test(message) || DESIGN_SOMETHING.test(message)) {
    return withKind({ app: null, design: null, choices: [...PLYWORKS_DESIGNS], confirmApps: null });
  }
  if (AMBIGUOUS_JOB.test(message)) {
    return withKind({ app: null, design: null, choices: null, confirmApps: ["boxouts", "simpleparts"] });
  }
  return withKind({ app: null, design: null, choices: null, confirmApps: null });
}
