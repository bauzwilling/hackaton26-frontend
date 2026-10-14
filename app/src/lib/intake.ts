/*
 * Fake file understanding, front to back. See docs/model-integration.md.
 *
 * The real path is upload -> Artifact -> BFF file inspector -> our structuring model,
 * which answers with a message and suggested actions. Nothing here survives that.
 *
 * CSV stays Box Outs. Every Simple Parts dev-test upload type goes to Simple Parts.
 * Format decides the job app — no name heuristics.
 */

/** Job apps Concierge can hand a file to in this round. */
export type IntakeApp = "boxouts" | "simpleparts";

export type IntakeFormat = "csv" | "dxf" | "3dm" | "dwg" | "xls" | "xlsx" | "pdf" | "jpg" | "png";

export const FILE_ACCEPT = [
  ".csv",
  ".dxf",
  ".3dm",
  ".dwg",
  ".xls",
  ".xlsx",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  "text/csv",
  "image/vnd.dxf",
  "application/dxf",
  "model/x.stl-binary",
  "application/x-rhino",
  "image/vnd.dwg",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
  "image/jpeg",
  "image/png",
].join(",");

export type IntakeResult =
  | { kind: "route"; fileName: string; format: IntakeFormat; appId: IntakeApp; message: string }
  | { kind: "reject"; fileName: string; format: string | null; message: string };

// WAITING BFF: format detection is inspector work — the BFF returns detectedType and facts
const MIME_TO_FORMAT: Record<string, IntakeFormat> = {
  "text/csv": "csv",
  "application/csv": "csv",
  "image/vnd.dxf": "dxf",
  "application/dxf": "dxf",
  "application/x-dxf": "dxf",
  "image/vnd.dwg": "dwg",
  "application/dwg": "dwg",
  "application/acad": "dwg",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const EXT_TO_FORMAT: Record<string, IntakeFormat> = {
  csv: "csv",
  dxf: "dxf",
  "3dm": "3dm",
  dwg: "dwg",
  xls: "xls",
  xlsx: "xlsx",
  pdf: "pdf",
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
};

function extensionOf(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

function formatOf(file: File): IntakeFormat | null {
  const ext = extensionOf(file.name);
  if (EXT_TO_FORMAT[ext]) return EXT_TO_FORMAT[ext];
  return MIME_TO_FORMAT[(file.type || "").toLowerCase()] ?? null;
}

// WAITING MODEL: format-to-app is a stand-in; the structuring model will propose the job later
function appForFormat(format: IntakeFormat): IntakeApp {
  if (format === "csv") return "boxouts";
  return "simpleparts";
}

// WAITING MODEL: canned copy stands in for the model's message about the file
export function openingMessage(app: IntakeApp, fileName: string, format?: IntakeFormat | null) {
  if (app === "boxouts") {
    return `This looks like a table of box dimensions in ${fileName}.`;
  }
  if (format === "3dm") {
    return `This looks like a Rhino model (${fileName}).`;
  }
  if (format === "dwg") {
    return `This looks like a CAD drawing (${fileName}).`;
  }
  if (format === "xls" || format === "xlsx") {
    return `This looks like a parts spreadsheet (${fileName}).`;
  }
  if (format === "pdf" || format === "jpg" || format === "png") {
    return `This looks like a sketch (${fileName}).`;
  }
  return `This looks like a part drawing (${fileName}).`;
}

// WAITING BFF: it should be a reply to an uploaded artifact, not a synchronous local call
// WAITING MODEL: format-to-app is a stand-in; the structuring model will propose the job later
export function classifyFile(file: File): IntakeResult {
  const fileName = file.name?.trim() || "untitled";
  const format = formatOf(file);
  if (!format) {
    const ext = extensionOf(fileName);
    return {
      kind: "reject",
      fileName,
      format: ext || null,
      message: `I can't read ${ext ? `.${ext}` : "this file"} yet. Drop a CSV, or a DXF, DWG, 3DM, Excel, PDF, or image.`,
    };
  }

  const appId = appForFormat(format);
  return {
    kind: "route",
    fileName,
    format,
    appId,
    message: openingMessage(appId, fileName, format),
  };
}
