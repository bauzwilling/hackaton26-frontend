/**
 * Last-resort intent match, used only when the assistant request fails.
 *
 * Claude does the routing on the happy path; this exists so a dead backend does not
 * make the Studio unusable (msd-concierge-ui: "manufacturing stays usable without AI").
 *
 * WAITING BFF: the capability manifest is BFF-owned, so this alias table is a fixture.
 */
import { PLYWORKS_DESIGNS, type PlyworksDesign } from "./concierge";

const APP_ALIASES: { app: string; patterns: RegExp[] }[] = [
  { app: "boxouts", patterns: [/\bdoor\s*box\s*-?\s*outs?\b/i, /\bbox\s*-?\s*outs?\b/i] },
  { app: "simpleparts", patterns: [/\bsimple\s*-?\s*parts?\b/i] },
  { app: "plyworks", patterns: [/\bply\s*-?\s*works?\b/i] },
  { app: "orbit", patterns: [/\b(cnc\s*)?orbit\b/i] },
  { app: "admin", patterns: [/\badmin(\s*console)?\b/i] },
  { app: "projects", patterns: [/\bprojects?\b/i] },
];

const DESIGN_ALIASES: { design: PlyworksDesign; patterns: RegExp[] }[] = [
  { design: "shelf", patterns: [/\b(book)?shel(?:f|ves)\b/i, /\bcabinets?\b/i, /\bshelving\b/i] },
  { design: "table", patterns: [/\btables?\b/i, /\bdesks?\b/i] },
  { design: "stool", patterns: [/\bstools?\b/i] },
  { design: "bench", patterns: [/\bbenches\b/i, /\bbench\b/i] },
];

const VAGUE_FURNITURE = /\b(furniture|plywood|ply\s*wood)\b/i;

export type LocalRoute = {
  app: string | null;
  design: PlyworksDesign | null;
  choices: PlyworksDesign[] | null;
};

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

/** App + Plyworks design (or choice chips) when Claude is unreachable. */
export function matchLocalRoute(message: string): LocalRoute {
  const named = matchApp(message);
  const design = matchPlyworksDesign(message);

  if (named && named !== "plyworks") {
    return { app: named, design: null, choices: null };
  }
  if (design) {
    return { app: "plyworks", design, choices: null };
  }
  if (named === "plyworks") {
    return { app: "plyworks", design: "shelf", choices: null };
  }
  if (VAGUE_FURNITURE.test(message)) {
    return { app: null, design: null, choices: [...PLYWORKS_DESIGNS] };
  }
  return { app: null, design: null, choices: null };
}
