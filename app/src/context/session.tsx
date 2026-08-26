import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearSession, loadSession, type Session } from "../lib/auth";

export type Theme = "bright" | "dark";
export type AccentId = "yellow" | "blue" | "red" | "green" | "purple" | "grey";

export const ACCENTS: Record<AccentId, { label: string; acc: string; lite: string; deep: string; dark: string }> = {
  yellow: { label: "Yellow", acc: "#f9ab00", lite: "#fdd663", deep: "#ea8600", dark: "#fdd663" },
  blue: { label: "Blue", acc: "#1a73e8", lite: "#8ab4f8", deep: "#0f3d82", dark: "#8ab4f8" },
  red: { label: "Red", acc: "#ea4335", lite: "#f28b82", deep: "#a01a17", dark: "#f28b82" },
  green: { label: "Green", acc: "#34a853", lite: "#81c995", deep: "#12602a", dark: "#81c995" },
  purple: { label: "Purple", acc: "#a142f4", lite: "#c58af9", deep: "#5b1d8f", dark: "#c58af9" },
  grey: { label: "Graphite", acc: "#5f6368", lite: "#9aa0a6", deep: "#202124", dark: "#9aa0a6" },
};

const APPEARANCE_KEY = "f2f.appearance";

type Appearance = {
  theme: Theme;
  accent: AccentId;
  showWires: boolean;
  showGrid: boolean;
};

const DEFAULT_APPEARANCE: Appearance = {
  theme: "bright",
  accent: "yellow",
  showWires: false,
  showGrid: true,
};

function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const data = JSON.parse(raw) as Partial<Appearance>;
    return {
      theme: data.theme === "dark" ? "dark" : "bright",
      accent: data.accent && data.accent in ACCENTS ? data.accent : "yellow",
      showWires: data.showWires === true,
      showGrid: data.showGrid !== false,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

type Ctx = {
  session: Session | null;
  setSession: (s: Session | null) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
  showWires: boolean;
  setShowWires: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  signOut: () => void;
};

const SessionCtx = createContext<Ctx | null>(null);

function applyLook(theme: Theme, accent: AccentId) {
  const a = ACCENTS[accent];
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === "dark") {
    root.style.setProperty("--acc", a.dark);
    root.style.setProperty("--acc-lite", a.acc);
    root.style.setProperty("--acc-deep", a.dark);
  } else {
    root.style.setProperty("--acc", a.acc);
    root.style.setProperty("--acc-lite", a.lite);
    root.style.setProperty("--acc-deep", a.deep);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [look, setLook] = useState<Appearance>(() => {
    const a = loadAppearance();
    applyLook(a.theme, a.accent);
    return a;
  });
  const { theme, accent, showWires, showGrid } = look;

  function patch(partial: Partial<Appearance>) {
    setLook((prev) => ({ ...prev, ...partial }));
  }

  useEffect(() => {
    applyLook(theme, accent);
  }, [theme, accent]);

  useEffect(() => {
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(look));
    } catch { /* ignore */ }
  }, [look]);

  const value = useMemo<Ctx>(() => ({
    session,
    setSession,
    theme,
    setTheme: (t) => patch({ theme: t }),
    accent,
    setAccent: (a) => patch({ accent: a }),
    showWires,
    setShowWires: (v) => patch({ showWires: v }),
    showGrid,
    setShowGrid: (v) => patch({ showGrid: v }),
    signOut: () => { clearSession(); setSession(null); },
  }), [session, theme, accent, showWires, showGrid]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
