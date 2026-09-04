import { useCallback, useEffect, useRef } from "react";
import { useSession } from "../context/session";

// WAITING DATABASE: job output from this iframe (nesting ZIP / send-results payload) → product job/artifact API

export function EmbeddedApp({ src, title }: { src: string; title: string }) {
  const { theme, accent } = useSession();
  const ref = useRef<HTMLIFrameElement>(null);

  const pushLook = useCallback(() => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    win.postMessage({
      type: "f2f-look",
      acc: cs.getPropertyValue("--acc").trim(),
      bg: cs.getPropertyValue("--bg").trim(),
      face2: cs.getPropertyValue("--face2").trim(),
      theme: root.dataset.theme === "dark" ? "dark" : "bright",
    }, "*");
  }, []);

  useEffect(() => {
    pushLook();
  }, [theme, accent, pushLook]);

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
