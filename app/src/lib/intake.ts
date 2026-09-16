/*
 * Fake file understanding, front to back. See docs/model-integration.md.
 *
 * The real path is upload -> Artifact -> BFF file inspector -> our structuring model,
 * which answers with a message and suggested actions. Nothing here survives that.
 *
 * This round: only csv / dxf / 3dm. Format decides the job app — no name heuristics.
 */

/** Job apps Concierge can hand a file to in this round. */
export type IntakeApp = "boxouts" | "simpleparts";

export type IntakeFormat = "csv" | "dxf" | "3dm";

export const FILE_ACCEPT = ".csv,.dxf,.3dm,text/csv,image/vnd.dxf,application/dxf,model/x.stl-binary,application/x-rhino";

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
};

function extensionOf(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

function formatOf(file: File): IntakeFormat | null {
  const ext = extensionOf(file.name);
  if (ext === "csv" || ext === "dxf" || ext === "3dm") return ext;
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
    return `This looks like a table of box dimensions in ${fileName}. Opening Door Box Out for you.`;
  }
  if (format === "3dm") {
    return `This looks like a Rhino model (${fileName}). Opening Simple Parts for you.`;
  }
  return `This looks like a part drawing (${fileName}). Opening Simple Parts for you.`;
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
      message: `I can't read ${ext ? `.${ext}` : "this file"} yet. Drop a CSV, DXF, or 3DM.`,
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
