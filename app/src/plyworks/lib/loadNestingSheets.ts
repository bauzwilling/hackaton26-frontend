import JSZip from "jszip";
import type { NestingSheetPayload } from "../../simpleparts/components/NestingSheetsViewer";

type Material = "kiefer" | "film";

const MATERIAL_PREFIX: Record<Material, RegExp> = {
  kiefer: /^Kiefer_(\d+)\.dxf$/i,
  film: /^Film_(\d+)\.dxf$/i,
};

const MATERIAL_LABEL: Record<Material, string> = {
  kiefer: "Kiefer",
  film: "Film",
};

function baseName(name: string): string {
  return name.split("/").pop() || "";
}

function sheetIndexFromName(name: string): number | null {
  const match = baseName(name).match(/_(\d+)\.dxf$/i);
  return match ? Math.max(0, Number(match[1]) - 1) : null;
}

function materialForEntry(name: string): Material | null {
  const base = baseName(name);
  if (MATERIAL_PREFIX.kiefer.test(base)) return "kiefer";
  if (MATERIAL_PREFIX.film.test(base)) return "film";
  return null;
}

/** Unpack a Plyworks nesting ZIP into the shared NestingSheetsViewer payload shape. */
export async function loadPlyworksNestingSheets(
  zipUrl: string,
  signal?: AbortSignal,
): Promise<NestingSheetPayload[]> {
  const response = await fetch(zipUrl, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Failed to load nesting sheets");
  }
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const grouped: Record<Material, { index: number; dxfText: string }[]> = {
    kiefer: [],
    film: [],
  };
  const pending: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir || !/\.dxf$/i.test(relativePath)) return;
    const kind = materialForEntry(relativePath);
    const index = sheetIndexFromName(relativePath);
    if (!kind || index == null) return;
    pending.push(file.async("string").then((dxfText) => {
      grouped[kind].push({ index, dxfText });
    }));
  });
  await Promise.all(pending);
  grouped.kiefer.sort((a, b) => a.index - b.index);
  grouped.film.sort((a, b) => a.index - b.index);

  const sheets: NestingSheetPayload[] = [];
  let nextIndex = 0;
  for (const material of ["kiefer", "film"] as const) {
    const label = MATERIAL_LABEL[material];
    const total = grouped[material].length;
    for (const sheet of grouped[material]) {
      sheets.push({
        index: nextIndex,
        dxfText: sheet.dxfText,
        kind: "sheet",
        label: total > 1 ? `${label} ${sheet.index + 1}` : label,
      });
      nextIndex += 1;
    }
  }
  if (!sheets.length) {
    throw new Error("No sheet DXFs found in nesting result");
  }
  return sheets;
}
