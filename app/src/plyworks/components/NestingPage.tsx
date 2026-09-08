import { useEffect, useRef } from "react";
import { createApp, type App as VueApp } from "vue";
import NestingCurvePreview from "../nesting-preview/NestingCurvePreviewComponent.vue";
import { nestingZipUrl } from "../lib/produceApi";

// Parked unused: Studio still iframes /nesting. This file is not imported by pages/.

const PREVIEW_TOKENS: React.CSSProperties = {
  ["--color-neutral-bg" as string]: "#fafaf9",
  ["--color-neutral-bg-hover" as string]: "#f5f5f4",
  ["--color-neutral-selected" as string]: "#e7e5e4",
  ["--color-neutral-edited-accent" as string]: "#a8a29e",
  ["--color-result-text" as string]: "#78716c",
};

function previewZipUrl(jobId: string): string {
  return nestingZipUrl(jobId, true);
}

export function NestingPage() {
  const jobId = new URLSearchParams(window.location.search).get("jobId") || "";
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app: VueApp = createApp(NestingCurvePreview, {
      jobId,
      open: true,
      solving: false,
      layout: "fill",
      zipUrl: previewZipUrl,
    });
    app.mount(host);
    return () => app.unmount();
  }, [jobId]);

  return (
    <div style={{ ...styles.root, ...PREVIEW_TOKENS }}>
      <div ref={hostRef} style={styles.canvas} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    width: "100%",
    height: "100vh",
    overflow: "hidden",
    background: "var(--bg, #f5ead8)",
    fontFamily: "Figtree, system-ui, sans-serif",
    color: "var(--ink, #201e1d)",
  },
  canvas: {
    position: "absolute",
    inset: 0,
  },
};
