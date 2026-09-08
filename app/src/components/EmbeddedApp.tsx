import { useCallback, useEffect, useRef } from "react";
import { lookTokens, useSession } from "../context/session";
import { useHelpOptional } from "../context/help";
import { HELP_MSG } from "../lib/help";

const LOOK_TYPE = "f2f-look";
const LOOK_READY = "f2f-look-ready";

// WAITING DATABASE: job output from this iframe (nesting ZIP / send-results payload) → product job/artifact API

export function EmbeddedApp({
  src,
  title,
  complementBg = false,
  helpBridge = false,
}: {
  src: string;
  title: string;
  complementBg?: boolean;
  helpBridge?: boolean;
}) {
  const { theme, accent } = useSession();
  const help = useHelpOptional();
  const ref = useRef<HTMLIFrameElement>(null);
  const phase = help?.phase;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const pushLook = useCallback(() => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    const t = lookTokens(theme, accent);
    win.postMessage({
      type: LOOK_TYPE,
      acc: t.acc,
      bg: complementBg ? t.pwBg : t.bg,
      face2: complementBg ? t.pwFace2 : t.face2,
      theme,
    }, "*");
  }, [theme, accent, complementBg]);

  const pushHelp = useCallback((action: "start" | "stop") => {
    if (!helpBridge) return;
    ref.current?.contentWindow?.postMessage({ type: HELP_MSG, action }, "*");
  }, [helpBridge]);

  useEffect(() => {
    pushLook();
  }, [pushLook]);

  useEffect(() => {
    if (!helpBridge) return;
    pushHelp(phase === "iframe" ? "start" : "stop");
  }, [helpBridge, phase, pushHelp]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow) return;
      if (event.data?.type === LOOK_READY) {
        pushLook();
        if (helpBridge && phaseRef.current === "iframe") pushHelp("start");
        return;
      }
      if (!helpBridge || event.data?.type !== HELP_MSG) return;
      const action = event.data.action;
      if (action === "ready") help?.onPlyworksReady();
      if (action === "done" || action === "stop") help?.onPlyworksDone();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [help, helpBridge, pushHelp, pushLook]);

  if (!src) {
    return <p className="muted" style={{ margin: 16 }}>No URL configured.</p>;
  }
  return (
    <iframe
      ref={ref}
      className="embedded-app"
      src={src}
      title={title}
      allow="clipboard-read; clipboard-write"
      onLoad={() => {
        pushLook();
        if (helpBridge && phaseRef.current === "iframe") pushHelp("start");
      }}
    />
  );
}
