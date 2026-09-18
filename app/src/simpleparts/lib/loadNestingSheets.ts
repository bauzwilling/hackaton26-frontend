import JSZip from "jszip";
import type { NestingSheetPayload } from "../components/NestingSheetsViewer";

function baseName(name: string): string {
  return name.split("/").pop() || "";
}

/**
 * Main Flask ZIP entries are `{stem}_{001}.dxf` (1-based). See simple-parts-back
 * `_branch_dxf_entry_name`.
 */
export function sheetIndexFromZipEntry(name: string): number | null {
  const match = baseName(name).match(/_(\d+)\.dxf$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}

/** Unpack a Simple Parts nesting ZIP into NestingSheetsViewer payloads. */
export async function sheetsFromSimplePartsZip(buffer: ArrayBuffer): Promise<NestingSheetPayload[]> {
  const zip = await JSZip.loadAsync(buffer);
  const files: { path: string; file: { async: (type: "string") => Promise<string> } }[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir || !/\.dxf$/i.test(relativePath)) return;
    files.push({ path: relativePath, file });
  });
  files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const sheets: NestingSheetPayload[] = [];
  for (const [i, entry] of files.entries()) {
    const dxfText = await entry.file.async("string");
    sheets.push({
      index: sheetIndexFromZipEntry(entry.path) ?? i,
      dxfText,
      kind: "sheet",
    });
  }
  sheets.sort((a, b) => a.index - b.index);
  if (!sheets.length) {
    throw new Error("No sheet DXFs found in nesting result");
  }
  return sheets;
}

export async function loadSimplePartsNestingSheets(
  zipUrl: string,
  signal?: AbortSignal,
): Promise<NestingSheetPayload[]> {
  const response = await fetch(zipUrl, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to load nesting sheets");
  }
  return sheetsFromSimplePartsZip(await response.arrayBuffer());
}
