/**
 * Last-resort intent match, used only when the assistant request fails.
 *
 * Claude does the routing on the happy path; this exists so a dead backend does not
 * make the Studio unusable (msd-concierge-ui: "manufacturing stays usable without AI").
 *
 * WAITING BFF: the capability manifest is BFF-owned, so this alias table is a fixture.
 *
 * Deliberately narrow: it matches app names people actually type, not domain nouns.
 * Opening the wrong window is worse than opening none.
 */
const APP_ALIASES: { app: string; patterns: RegExp[] }[] = [
  { app: "boxouts", patterns: [/\bdoor\s*box\s*-?\s*outs?\b/i, /\bbox\s*-?\s*outs?\b/i] },
  { app: "simpleparts", patterns: [/\bsimple\s*-?\s*parts?\b/i] },
  { app: "plyworks", patterns: [/\bply\s*-?\s*works?\b/i] },
  { app: "orbit", patterns: [/\b(cnc\s*)?orbit\b/i] },
  { app: "admin", patterns: [/\badmin(\s*console)?\b/i] },
  { app: "projects", patterns: [/\bprojects?\b/i] },
];

/** Returns a workspace app id when the text plainly names one, otherwise null. */
export function matchApp(message: string): string | null {
  for (const { app, patterns } of APP_ALIASES) {
    if (patterns.some((p) => p.test(message))) return app;
  }
  return null;
}
