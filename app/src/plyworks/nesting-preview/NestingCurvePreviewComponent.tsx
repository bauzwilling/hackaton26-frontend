import { useEffect, useMemo, useRef, useState } from "react";
import { parseDxf, type DxfData } from "dxf-render";
import JSZip from "jszip";
import NestingDxfViewer from "./NestingDxfViewer";
import "./nesting-preview.css";

type Material = "kiefer" | "film";
type PreviewLayout = "panel" | "fill";

interface Sheet {
  index: number;
  dxfText: string;
}

type SheetsByMaterial = Record<Material, Sheet[]>;

export interface NestingCurvePreviewProps {
  jobId?: string | null;
  open?: boolean;
  solving?: boolean;
  zipUrl: (jobId: string) => string;
  layout?: PreviewLayout;
}

const EMPTY_SHEETS: SheetsByMaterial = { kiefer: [], film: [] };
const MATERIAL_PREFIX: Record<Material, RegExp> = {
  kiefer: /^Kiefer_(\d+)\.dxf$/i,
  film: /^Film_(\d+)\.dxf$/i,
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

export default function NestingCurvePreview({
  jobId = null,
  open = false,
  solving = false,
  zipUrl,
  layout = "panel",
}: NestingCurvePreviewProps) {
  const [material, setMaterial] = useState<Material>("kiefer");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetsByMaterial, setSheetsByMaterial] = useState<SheetsByMaterial>(EMPTY_SHEETS);
  const loadedJobId = useRef<string | null | undefined>(undefined);
  const previousSolving = useRef<boolean | undefined>(undefined);

  const sheets = jobId ? sheetsByMaterial[material] : [];
  const currentSheet = sheets[sheetIndex] ?? null;
  const parsedDxf = useMemo<DxfData | null>(() => {
    if (!currentSheet?.dxfText) return null;
    try {
      return parseDxf(currentSheet.dxfText);
    } catch {
      return null;
    }
  }, [currentSheet]);
  const canCycle = sheets.length > 1;
  const sheetLabel = sheets.length ? `Sheet ${sheetIndex + 1}/${sheets.length}` : "No sheets";

  useEffect(() => {
    const jobChanged = loadedJobId.current !== jobId;
    const nestingFinished = previousSolving.current === true && !solving;
    previousSolving.current = solving;
    if (!jobId) {
      loadedJobId.current = null;
      return;
    }
    if (!jobChanged && !nestingFinished) return;

    const controller = new AbortController();
    setSheetsByMaterial(EMPTY_SHEETS);
    setSheetIndex(0);
    setHiddenLayers([]);
    setError(null);
    setLoading(true);

    void fetch(zipUrl(jobId), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || "Failed to load nesting sheets");
        }
        const zip = await JSZip.loadAsync(await response.arrayBuffer());
        const grouped: SheetsByMaterial = { kiefer: [], film: [] };
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
        if (!grouped.kiefer.length && !grouped.film.length) {
          throw new Error("No sheet DXFs found in nesting result");
        }
        if (controller.signal.aborted) return;
        loadedJobId.current = jobId;
        setSheetsByMaterial(grouped);
        setMaterial((current) => {
          if (grouped[current].length) return current;
          return grouped.film.length ? "film" : "kiefer";
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [jobId, solving, zipUrl]);

  const selectMaterial = (next: Material) => {
    if (material === next) return;
    setMaterial(next);
    setSheetIndex(0);
    setHiddenLayers([]);
  };

  const goPrevSheet = () => {
    if (!canCycle) return;
    setSheetIndex((index) => (index - 1 + sheets.length) % sheets.length);
    setHiddenLayers([]);
  };

  const goNextSheet = () => {
    if (!canCycle) return;
    setSheetIndex((index) => (index + 1) % sheets.length);
    setHiddenLayers([]);
  };

  return (
    <section className={`nesting-curve-preview${layout === "fill" ? " nesting-curve-preview--fill" : ""}`}>
      <div className="material-toggle-group" role="group" aria-label="Nesting material">
        <button
          type="button"
          className={`material-toggle material-toggle--kiefer${material === "kiefer" ? " material-toggle--active" : ""}`}
          aria-pressed={material === "kiefer"}
          onClick={() => selectMaterial("kiefer")}
        >
          Kiefer
        </button>
        <button
          type="button"
          className={`material-toggle material-toggle--film${material === "film" ? " material-toggle--active" : ""}`}
          aria-pressed={material === "film"}
          onClick={() => selectMaterial("film")}
        >
          Film
        </button>
      </div>
      <div className="sheet-controls">
        <button type="button" disabled={!canCycle} onClick={goPrevSheet}>Prev</button>
        <span>{sheetLabel}</span>
        <button type="button" disabled={!canCycle} onClick={goNextSheet}>Next</button>
      </div>
      {jobId && loading ? (
        <p className="nesting-status">Loading sheets…</p>
      ) : jobId && error ? (
        <p className="nesting-status nesting-status--error">{error}</p>
      ) : !parsedDxf ? (
        <p className="nesting-status">No sheets for this material.</p>
      ) : open ? (
        <NestingDxfViewer
          dxf={parsedDxf}
          hiddenLayers={hiddenLayers}
          onHiddenLayersChange={setHiddenLayers}
        />
      ) : null}
    </section>
  );
}
