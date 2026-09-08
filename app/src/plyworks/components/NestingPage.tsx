import NestingCurvePreview from "../nesting-preview/NestingCurvePreviewComponent";
import { nestingZipUrl } from "../lib/produceApi";

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

export function NestingPage({ jobId = "" }: { jobId?: string }) {
  return (
    <div style={{ ...styles.root, ...PREVIEW_TOKENS }}>
      <div style={styles.canvas}>
        <NestingCurvePreview
          jobId={jobId}
          open
          solving={false}
          layout="fill"
          zipUrl={previewZipUrl}
        />
      </div>
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
