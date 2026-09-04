import { EmbeddedApp } from "../components/EmbeddedApp";

export const PLYWORKS_URL = import.meta.env.VITE_PLYWORKS_URL || "http://localhost:5176";

export function PlyworksPage() {
  return <EmbeddedApp src={PLYWORKS_URL} title="Plyworks" complementBg />;
}

export function PlyworksJwPage({ jobId }: { jobId?: string }) {
  const base = PLYWORKS_URL.replace(/\/$/, "");
  const src = jobId
    ? `${base}/jw?jobId=${encodeURIComponent(jobId)}`
    : `${base}/jw`;
  return <EmbeddedApp src={src} title="Plyworks JointWiz" complementBg />;
}

export function PlyworksNestingPage({ jobId }: { jobId?: string }) {
  const base = PLYWORKS_URL.replace(/\/$/, "");
  const src = jobId
    ? `${base}/nesting?jobId=${encodeURIComponent(jobId)}`
    : `${base}/nesting`;
  return <EmbeddedApp src={src} title="Plyworks nesting" complementBg />;
}
