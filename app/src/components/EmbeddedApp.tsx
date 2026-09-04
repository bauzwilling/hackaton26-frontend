import { useCallback, useEffect, useRef } from "react";
import { lookTokens, useSession } from "../context/session";

const LOOK_TYPE = "f2f-look";
const LOOK_READY = "f2f-look-ready";

// WAITING DATABASE: job output from this iframe (nesting ZIP / send-results payload) → product job/artifact API

export function EmbeddedApp({
  src,
  title,
  complementBg = false,
}: {
  src: string;
  title: string;
  complementBg?: boolean;
}) {
  const { theme, accent } = useSession();
  const ref = useRef<HTMLIFrameElement>(null);

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

  useEffect(() => {
    pushLook();
  }, [pushLook]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow) return;
      if (event.data?.type !== LOOK_READY) return;
      pushLook();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushLook]);

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
      onLoad={pushLook}
    />
  );
}
