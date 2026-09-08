import { EmbeddedApp } from "../components/EmbeddedApp";

// Pipeline source from hackaton26-plyworks/front is in src/plyworks/; this page still iframes.
export const PLYWORKS_URL = import.meta.env.VITE_PLYWORKS_URL || "http://localhost:5176";

export function PlyworksPage({ design, helpBridge = false }: { design?: string; helpBridge?: boolean }) {
  const base = PLYWORKS_URL.replace(/\/$/, "");
  const src = design
    ? `${base}/?design=${encodeURIComponent(design)}`
    : base;
  return <EmbeddedApp src={src} title="Plyworks" complementBg helpBridge={helpBridge} />;
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
