/* WAITING DATABASE: user profile (appearance and later prefs).
 * localStorage keyed by email until a profile table/API exists. */

export type Theme = "bright" | "dark";
export type AccentId = "yellow" | "blue" | "red" | "green" | "purple" | "grey";

export type Appearance = {
  theme: Theme;
  accent: AccentId;
  showWires: boolean;
  showGrid: boolean;
  bubbleMode: boolean;
};

export type UserProfile = {
  appearance: Appearance;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "bright",
  accent: "yellow",
  showWires: false,
  showGrid: true,
  bubbleMode: false,
};

const ACCENTS: Record<AccentId, true> = {
  yellow: true, blue: true, red: true, green: true, purple: true, grey: true,
};

function key(email: string) {
  return `f2f.profile.${email}`;
}

function parseAppearance(raw: unknown): Appearance {
  const data = raw && typeof raw === "object" ? raw as Partial<Appearance> : {};
  return {
    theme: data.theme === "dark" ? "dark" : "bright",
    accent: data.accent && data.accent in ACCENTS ? data.accent : "yellow",
    showWires: data.showWires === true,
    showGrid: data.showGrid !== false,
    bubbleMode: data.bubbleMode === true,
  };
}

export function loadProfile(email: string): UserProfile {
  try {
    const raw = localStorage.getItem(key(email));
    if (!raw) return { appearance: DEFAULT_APPEARANCE };
    const data = JSON.parse(raw) as Partial<UserProfile>;
    return { appearance: parseAppearance(data.appearance) };
  } catch {
    return { appearance: DEFAULT_APPEARANCE };
  }
}

export function saveProfileAppearance(email: string, appearance: Appearance) {
  try {
    const next: UserProfile = { ...loadProfile(email), appearance };
    localStorage.setItem(key(email), JSON.stringify(next));
  } catch { /* ignore */ }
}
