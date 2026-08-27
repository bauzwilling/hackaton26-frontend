import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearSession, loadSession, type Session } from "../lib/auth";
import {
  DEFAULT_APPEARANCE,
  loadProfile,
  saveProfileAppearance,
  type AccentId,
  type Appearance,
  type Theme,
} from "../lib/profile";

export type { AccentId, Appearance, Theme };

export const ACCENTS: Record<AccentId, { label: string; acc: string; lite: string; deep: string; dark: string }> = {
  yellow: { label: "Yellow", acc: "#f9ab00", lite: "#fdd663", deep: "#ea8600", dark: "#fdd663" },
  blue: { label: "Blue", acc: "#1a73e8", lite: "#8ab4f8", deep: "#0f3d82", dark: "#8ab4f8" },
  red: { label: "Red", acc: "#ea4335", lite: "#f28b82", deep: "#a01a17", dark: "#f28b82" },
  green: { label: "Green", acc: "#34a853", lite: "#81c995", deep: "#12602a", dark: "#81c995" },
  purple: { label: "Purple", acc: "#a142f4", lite: "#c58af9", deep: "#5b1d8f", dark: "#c58af9" },
  grey: { label: "Graphite", acc: "#5f6368", lite: "#9aa0a6", deep: "#202124", dark: "#9aa0a6" },
};

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
  bubbleMode: boolean;
  setBubbleMode: (v: boolean) => void;
  signOut: () => void;
};

const SessionCtx = createContext<Ctx | null>(null);

function applyLook(theme: Theme, accent: AccentId, bubbleMode: boolean) {
  const a = ACCENTS[accent];
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (bubbleMode) root.dataset.bubble = "on";
  else delete root.dataset.bubble;
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

function lookFor(session: Session | null): Appearance {
  // WAITING DATABASE: login is product-default; signed-in look comes from the user profile
  return session ? loadProfile(session.email).appearance : DEFAULT_APPEARANCE;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(() => loadSession());
  const [look, setLook] = useState<Appearance>(() => {
    const a = lookFor(loadSession());
    applyLook(a.theme, a.accent, a.bubbleMode);
    return a;
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { theme, accent, showWires, showGrid, bubbleMode } = look;

  const adoptSession = useCallback((s: Session | null) => {
    setSessionState(s);
    const next = lookFor(s);
    applyLook(next.theme, next.accent, next.bubbleMode);
    setLook(next);
  }, []);

  const patch = useCallback((partial: Partial<Appearance>) => {
    setLook((prev) => {
      const next = { ...prev, ...partial };
      const email = sessionRef.current?.email;
      // WAITING DATABASE: persist look on the signed-in user's profile
      if (email) saveProfileAppearance(email, next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyLook(theme, accent, bubbleMode);
  }, [theme, accent, bubbleMode]);

  const value = useMemo<Ctx>(() => ({
    session,
    setSession: adoptSession,
    theme,
    setTheme: (t) => patch({ theme: t }),
    accent,
    setAccent: (a) => patch({ accent: a }),
    showWires,
    setShowWires: (v) => patch({ showWires: v }),
    showGrid,
    setShowGrid: (v) => patch({ showGrid: v }),
    bubbleMode,
    setBubbleMode: (v) => patch({ bubbleMode: v }),
    signOut: () => { clearSession(); adoptSession(null); },
  }), [session, adoptSession, patch, theme, accent, showWires, showGrid, bubbleMode]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
