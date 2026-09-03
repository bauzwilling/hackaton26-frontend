/*
 * Fake file understanding, front to back. See docs/model-integration.md.
 *
 * The real path is upload -> Artifact -> BFF file inspector -> our structuring model,
 * which answers with a message and suggested actions. Nothing here survives that.
 */

import { plyworksOpening } from "./catalog";

/** Job apps the fake (and later real) structuring step can route into. */
export type IntakeApp = "boxouts" | "simpleparts" | "plyworks";

export type IntakeFormat = "csv" | "dxf" | "dwg" | "jpg" | "png" | "pdf";

export const CONFIRM_APPS: IntakeApp[] = ["boxouts", "simpleparts", "plyworks"];

export const FILE_ACCEPT = ".csv,.dxf,.dwg,.jpg,.jpeg,.png,.pdf,text/csv,image/jpeg,image/png,application/pdf";

export type IntakeResult =
  | { kind: "route"; fileName: string; format: IntakeFormat; appId: IntakeApp; message: string }
  | { kind: "confirm"; fileName: string; format: IntakeFormat; confirmApps: IntakeApp[]; message: string }
  | { kind: "reject"; fileName: string; format: string | null; message: string };

// WAITING BFF: format detection is inspector work — the BFF returns detectedType and facts
const MIME_TO_FORMAT: Record<string, IntakeFormat> = {
  "text/csv": "csv",
  "application/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
  "image/vnd.dxf": "dxf",
  "application/dxf": "dxf",
  "application/x-dxf": "dxf",
  "application/acad": "dwg",
  "application/x-acad": "dwg",
  "application/x-dwg": "dwg",
  "image/vnd.dwg": "dwg",
};

function extensionOf(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

function formatOf(file: File): IntakeFormat | null {
  const ext = extensionOf(file.name);
  if (ext === "jpeg") return "jpg";
  if (ext === "csv" || ext === "dxf" || ext === "dwg" || ext === "jpg" || ext === "png" || ext === "pdf") {
    return ext;
  }
  return MIME_TO_FORMAT[(file.type || "").toLowerCase()] ?? null;
}

// WAITING MODEL: the model picks the job from inspector facts, never from the file name
function keywordApp(fileName: string): IntakeApp | null {
  const stem = fileName.replace(/\.[^.]+$/, "");
  if (/boxout|box[\s_-]?out|\bbox(es)?\b|\bdoor/i.test(stem)) return "boxouts";
  if (/\bpart|\bbracket|\blaser|\bdxf|\bdwg/i.test(stem)) return "simpleparts";
  if (/\bply|\bpanel|\bcabinet|\bshelf|\bfurniture/i.test(stem)) return "plyworks";
  return null;
}

// WAITING MODEL: a format says nothing about the job; the model proposes it
function defaultApp(format: IntakeFormat): IntakeApp | null {
  if (format === "csv" || format === "jpg" || format === "png") return "boxouts";
  if (format === "dxf" || format === "dwg") return "simpleparts";
  return null;
}

// WAITING MODEL: canned copy stands in for the model's message about the file
export function openingMessage(app: IntakeApp, fileName: string, format?: IntakeFormat | null) {
  if (app === "boxouts") {
    if (format === "csv") {
      return `This looks like a table of box dimensions in ${fileName}. Opening Door boxouts for you.`;
    }
    if (format === "jpg" || format === "png") {
      return "Looks like you gave me some boxes to build. Opening Door boxouts for you.";
    }
    return `Looks like you gave me some boxes to build from ${fileName}. Opening Door boxouts for you.`;
  }
  if (app === "simpleparts") {
    return "This looks like a part drawing. Opening Simple Parts for you.";
  }
  if (app === "plyworks") {
    return plyworksOpening("This looks like a panel or furniture job. Opening Plyworks for you.");
  }
  return `Opening that application for you.`;
}

// WAITING MODEL: an ambiguous verdict stands in for several suggested actions
const CONFIRM_MESSAGE = "I can see a drawing, but I’m not sure which job it is. Should I open Door boxouts, Simple Parts, or Plyworks?";

// WAITING MODEL: the whole verdict — our structuring model reads the file, this guesses
// WAITING BFF: it should be a reply to an uploaded artifact, not a synchronous local call
export function classifyFile(file: File): IntakeResult {
  const fileName = file.name?.trim() || "untitled";
  const format = formatOf(file);
  if (!format) {
    const ext = extensionOf(fileName);
    return {
      kind: "reject",
      fileName,
      format: ext || null,
      message: `I can’t read ${ext ? `.${ext}` : "this file"} yet. Drop a CSV, DXF, DWG, JPG, PNG, or PDF.`,
    };
  }

  const appId = keywordApp(fileName) ?? defaultApp(format);
  if (!appId) {
    return {
      kind: "confirm",
      fileName,
      format,
      confirmApps: CONFIRM_APPS,
      message: CONFIRM_MESSAGE,
    };
  }

  return {
    kind: "route",
    fileName,
    format,
    appId,
    message: openingMessage(appId, fileName, format),
  };
}
