import { plyworksApi } from "../api";

export type GhGeometryLeaf = {
  type?: string;
  data?: unknown;
};

export type GeometryPayload = {
  values?: Array<{
    ParamName?: string;
    InnerTree?: Record<string, GhGeometryLeaf[]>;
  }>;
};

export type ProduceJob = {
  jobId: string;
  status: "running" | "joined" | "completed" | "failed";
  stage: string;
  valid: boolean | null;
  validationBool: boolean | null;
  validationReport: string | null;
  validationReportSummary: string | null;
  message: string | null;
  kSheetNr: number | null;
  fSheetNr: number | null;
  sheetCount: number;
  geometryPayload?: GeometryPayload | null;
  error: string | null;
};

export type ProduceBoard = {
  id: number;
  name?: string;
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  material?: "kiefer" | "film";
};

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return body as T;
}

export async function startProduce(
  stepText: string,
  boards: ProduceBoard[],
  filename = "plyworks-18mm.step",
  thicknesses: { KieferThickness: number; FilmThickness: number }
): Promise<{ jobId: string }> {
  // WAITING BFF: POST /produce is the existing Flask stand-in for accepting a platform action and starting a run.
  const res = await fetch(plyworksApi("/produce"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stepText,
      filename,
      boards,
      KieferThickness: thicknesses.KieferThickness,
      FilmThickness: thicknesses.FilmThickness,
    }),
  });
  return readJson(res);
}

export async function getProduce(jobId: string): Promise<ProduceJob> {
  // WAITING BFF: polling the existing Flask job moves to GET /api/runs/:runId.
  const res = await fetch(plyworksApi(`/produce/${encodeURIComponent(jobId)}`));
  return readJson(res);
}

export async function startNest(jobId: string): Promise<ProduceJob> {
  // WAITING BFF: nesting starts through a BFF-owned SuggestedAction, not this Flask route.
  const res = await fetch(plyworksApi(`/produce/${encodeURIComponent(jobId)}/nest`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return readJson(res);
}

export function nestingZipUrl(jobId: string, preview = true): string {
  const q = preview ? "?preview=1" : "";
  // WAITING BFF: the nesting ZIP becomes a BFF-owned Artifact URL.
  return plyworksApi(`/produce/${encodeURIComponent(jobId)}/download${q}`);
}

export function input3dmUrl(jobId: string): string {
  // WAITING BFF: the Rhino input becomes a BFF-owned Artifact URL.
  return plyworksApi(`/produce/${encodeURIComponent(jobId)}/input-3dm`);
}

export async function downloadInput3dm(jobId: string): Promise<void> {
  const res = await fetch(input3dmUrl(jobId));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plyworks-hops-input.3dm";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
