import { useEffect, useMemo, useState } from "react";
import NestingResultModalComponent from "../../simpleparts/components/NestingResultModalComponent";
import type { NestingSheetPayload } from "../../simpleparts/components/NestingSheetsViewer";
import { getProduce, nestingZipUrl, type ProduceJob } from "../lib/produceApi";
import { loadPlyworksNestingSheets } from "../lib/loadNestingSheets";
import "../../simpleparts/simpleparts.css";
import "../../simpleparts/simpleparts-react.css";

const NA = "n/a";

/**
 * Plyworks nesting Studio window — same chrome/logic as Simple Parts nesting.
 * Sheet DXFs come from the produce ZIP; missing nest metadata shows as n/a.
 */
export function NestingPage({ jobId = "" }: { jobId?: string }) {
  const [sheets, setSheets] = useState<NestingSheetPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ProduceJob | null>(null);

  useEffect(() => {
    if (!jobId) {
      setSheets([]);
      setError("");
      setJob(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSheets([]);

    void (async () => {
      try {
        // WAITING BFF: produce job + ZIP become run/artifact downloads via Platform BFF.
        const [produce, loaded] = await Promise.all([
          getProduce(jobId).catch(() => null),
          loadPlyworksNestingSheets(nestingZipUrl(jobId, true), controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setJob(produce);
        setSheets(loaded);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Failed to load nesting sheets");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [jobId]);

  const sheetCount = sheets.length || job?.sheetCount || 0;
  const nestingMetrics = useMemo(() => ({
    sheetAmount: sheetCount > 0 ? sheetCount : null,
    cutLength: null,
    boreCount: null,
    grossArea: null,
    netArea: null,
  } as Record<string, number | null>), [sheetCount]);

  const activeMaterial = useMemo(() => {
    const first = sheets[0]?.label ?? "";
    if (/^kiefer/i.test(first)) return "Kiefer";
    if (/^film/i.test(first)) return "Film";
    return NA;
  }, [sheets]);

  if (!jobId) {
    return <div className="simpleparts-preview-notice">No nesting result selected.</div>;
  }

  return (
    <NestingResultModalComponent
      open
      variant="page"
      jobId={jobId}
      partCount={0}
      nestedCount={0}
      unassignedCount={0}
      unassignedIds={[]}
      unassignedReasons={[]}
      hasUnassignedDxf={false}
      sheetCount={Math.max(1, sheetCount)}
      sheetX={null}
      sheetY={null}
      sheetThickness={null}
      defaultMaterial={activeMaterial}
      nestingMetrics={nestingMetrics}
      preloadedSheets={sheets}
      sheetsLoading={loading}
      sheetsError={error}
      emptyValue={NA}
      nestZipHref={(filename) => {
        const url = nestingZipUrl(jobId, false);
        const sep = url.includes("?") ? "&" : "?";
        return `${url}${sep}filename=${encodeURIComponent(filename)}`;
      }}
    />
  );
}
