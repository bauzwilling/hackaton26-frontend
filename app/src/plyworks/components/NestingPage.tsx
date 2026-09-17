import NestingCurvePreview from "../nesting-preview/NestingCurvePreviewComponent";
import { nestingZipUrl } from "../lib/produceApi";
import "../plyworks.css";

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
    <div className="pw" style={PREVIEW_TOKENS}>
      <div className="pw-canvas">
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
