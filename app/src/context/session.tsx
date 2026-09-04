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

export const ACCENTS: Record<AccentId, {
  label: string;
  acc: string;
  lite: string;
  deep: string;
  dark: string;
  bg: string;
  bgDark: string;
  grid: string;
  gridDark: string;
  face2: string;
  face2Dark: string;
  pwBg: string;
  pwBgDark: string;
  pwFace2: string;
  pwFace2Dark: string;
}> = {
  yellow: {
    label: "Orange", acc: "#e07a22", lite: "#f4b57a", deep: "#c45f10", dark: "#f0a45a",
    bg: "#f4f1ea", bgDark: "#181614", grid: "#d9cbb4", gridDark: "#2c2822", face2: "#faf8f4", face2Dark: "#26221e",
    pwBg: "#e8eef4", pwBgDark: "#14161a", pwFace2: "#f5f8fb", pwFace2Dark: "#1c2026",
  },
  blue: {
    label: "Blue", acc: "#1a73e8", lite: "#8ab4f8", deep: "#0f3d82", dark: "#8ab4f8",
    bg: "#e8eef6", bgDark: "#14161a", grid: "#c5d2e4", gridDark: "#242a32", face2: "#f4f7fb", face2Dark: "#1e2228",
    pwBg: "#f4efe6", pwBgDark: "#181614", pwFace2: "#faf8f4", pwFace2Dark: "#26221e",
  },
  red: {
    label: "Red", acc: "#ea4335", lite: "#f28b82", deep: "#a01a17", dark: "#f28b82",
    bg: "#f5ebe8", bgDark: "#181414", grid: "#e0c8c2", gridDark: "#322624", face2: "#faf6f5", face2Dark: "#261e1e",
    pwBg: "#e7f1ef", pwBgDark: "#121817", pwFace2: "#f4f9f8", pwFace2Dark: "#1a2220",
  },
  green: {
    label: "Green", acc: "#34a853", lite: "#81c995", deep: "#12602a", dark: "#81c995",
    bg: "#e8f0ea", bgDark: "#141814", grid: "#c5d4c8", gridDark: "#242c26", face2: "#f4f8f5", face2Dark: "#1e241e",
    pwBg: "#f3ebee", pwBgDark: "#181416", pwFace2: "#faf7f8", pwFace2Dark: "#261e22",
  },
  purple: {
    label: "Purple", acc: "#a142f4", lite: "#c58af9", deep: "#5b1d8f", dark: "#c58af9",
    bg: "#efeaf4", bgDark: "#16141a", grid: "#d0c6dc", gridDark: "#2a2430", face2: "#f7f5fa", face2Dark: "#221e28",
    pwBg: "#eef2e8", pwBgDark: "#141612", pwFace2: "#f7f9f4", pwFace2Dark: "#20241c",
  },
  grey: {
    label: "Graphite", acc: "#5f6368", lite: "#9aa0a6", deep: "#202124", dark: "#9aa0a6",
    bg: "#eeeeec", bgDark: "#141414", grid: "#c8c8c4", gridDark: "#2a2a2a", face2: "#f6f6f5", face2Dark: "#242424",
    pwBg: "#f4f1ea", pwBgDark: "#161412", pwFace2: "#faf8f4", pwFace2Dark: "#24211c",
  },
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

export function lookTokens(theme: Theme, accent: AccentId) {
  const a = ACCENTS[accent];
  const dark = theme === "dark";
  return {
    acc: dark ? a.dark : a.acc,
    accLite: dark ? a.acc : a.lite,
    accDeep: dark ? a.dark : a.deep,
    bg: dark ? a.bgDark : a.bg,
    grid: dark ? a.gridDark : a.grid,
    face2: dark ? a.face2Dark : a.face2,
    pwBg: dark ? a.pwBgDark : a.pwBg,
    pwFace2: dark ? a.pwFace2Dark : a.pwFace2,
  };
}

function applyLook(theme: Theme, accent: AccentId, bubbleMode: boolean) {
  const t = lookTokens(theme, accent);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  if (bubbleMode) root.dataset.bubble = "on";
  else delete root.dataset.bubble;
  root.style.setProperty("--acc", t.acc);
  root.style.setProperty("--acc-lite", t.accLite);
  root.style.setProperty("--acc-deep", t.accDeep);
  root.style.setProperty("--bg", t.bg);
  root.style.setProperty("--grid", t.grid);
  root.style.setProperty("--face2", t.face2);
  if (document.body) document.body.style.backgroundColor = t.bg;
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
      applyLook(next.theme, next.accent, next.bubbleMode);
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
