import { useCallback, useEffect, useRef, useState } from "react";
import { getProduce, startNest, type ProduceJob } from "../lib/produceApi";
import { NESTING_MESSAGE_TYPE } from "../hooks/useProduce";
import { createDocFromGhResponse } from "../lib/createDocFromGhResponse";
import { createViewerScene } from "../lib/viewerScene";

// Parked unused: Studio still iframes /jw. JointWiz is existing-system Plyworks, not a second Studio mill pipeline.

const POLL_MS = 1200;

function validationPassed(job: ProduceJob): boolean | null {
  return job.validationBool ?? job.valid;
}

export function JointWizPage() {
  const jobId = new URLSearchParams(window.location.search).get("jobId") || "";
  const [job, setJob] = useState<ProduceJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nesting, setNesting] = useState(false);
  const [viewerNote, setViewerNote] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof createViewerScene> | null>(null);
  const shownPayloadRef = useRef<ProduceJob["geometryPayload"] | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyJob = useCallback((next: ProduceJob) => {
    setJob(next);
    if (next.status === "failed" && validationPassed(next) === false) {
      setError(next.message || next.error || "Geometry did not pass validation.");
      stopPoll();
      return;
    }
    if (next.status === "failed") {
      setError(next.error || next.message || "JointWiz failed.");
      stopPoll();
      return;
    }
    if (next.status === "joined" || next.status === "completed") {
      stopPoll();
    }
    if (next.status === "completed") {
      window.parent.postMessage({ type: NESTING_MESSAGE_TYPE, jobId: next.jobId }, "*");
    }
  }, [stopPoll]);

  useEffect(() => {
    if (!jobId) {
      setError("No JointWiz job id.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const first = await getProduce(jobId);
        if (cancelled) return;
        applyJob(first);
        if (first.status === "running") {
          pollRef.current = window.setInterval(async () => {
            try {
              applyJob(await getProduce(jobId));
            } catch (err) {
              stopPoll();
              setError(err instanceof Error ? err.message : "Failed to load JointWiz.");
            }
          }, POLL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load JointWiz.");
        }
      }
    })();
    return () => {
      cancelled = true;
      stopPoll();
    };
  }, [applyJob, jobId, stopPoll]);

  const onNest = useCallback(async () => {
    if (!jobId || nesting) return;
    setNesting(true);
    setError(null);
    try {
      const started = await startNest(jobId);
      applyJob(started);
      if (started.status === "running") {
        pollRef.current = window.setInterval(async () => {
          try {
            applyJob(await getProduce(jobId));
          } catch (err) {
            stopPoll();
            setNesting(false);
            setError(err instanceof Error ? err.message : "Nesting failed.");
          }
        }, POLL_MS);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nesting failed.");
    } finally {
      setNesting(false);
    }
  }, [applyJob, jobId, nesting, stopPoll]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewer = createViewerScene(host);
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
      shownPayloadRef.current = null;
    };
  }, []);

  useEffect(() => {
    const payload = job?.geometryPayload;
    const viewer = viewerRef.current;
    if (!payload || !viewer || payload === shownPayloadRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { doc, geometryCount } = await createDocFromGhResponse(payload);
        if (cancelled) return;
        shownPayloadRef.current = payload;
        if (!geometryCount) {
          setViewerNote("Joints ready, but no meshes came back.");
          viewer.clearSceneMeshes();
          return;
        }
        setViewerNote(null);
        await viewer.showDoc(doc);
      } catch (err) {
        if (!cancelled) {
          setViewerNote(err instanceof Error ? err.message : "Could not display JointWiz meshes.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job?.geometryPayload]);

  const passed = job ? validationPassed(job) : null;
  const blocked = passed === false;
  const ready = job?.status === "joined" && passed === true;
  const runningJw = job?.status === "running" && (job.stage === "joined" || passed === true);
  const nestBusy = nesting || (job?.status === "running" && job.stage === "nest");

  return (
    <div style={styles.root}>
      <header style={styles.bar}>
        <strong>Plyworks JointWiz</strong>
        <span style={styles.muted}>{jobId ? `Job ${jobId.slice(0, 8)}` : ""}</span>
        <button type="button" style={styles.nest} disabled={!ready || nestBusy} onClick={onNest}>
          {nestBusy ? "Nesting…" : "Nest"}
        </button>
      </header>
      {blocked && (
        <p style={styles.err}>
          {error || "Validation failed. JointWiz will not run."}
        </p>
      )}
      {!blocked && error && <p style={styles.err}>{error}</p>}
      {!blocked && !error && runningJw && (
        <p style={styles.note}>Validation passed. Building joints…</p>
      )}
      {!blocked && !error && ready && viewerNote && <p style={styles.note}>{viewerNote}</p>}
      <div ref={hostRef} style={styles.canvas} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    width: "100%",
    height: "100vh",
    overflow: "hidden",
    background: "var(--bg, #f5ead8)",
    fontFamily: "Figtree, system-ui, sans-serif",
    color: "var(--ink, #201e1d)",
  },
  bar: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    gap: 16,
    alignItems: "center",
    padding: "8px 16px",
    background: "var(--face2, #fffdf8)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(33,31,29,.1), 0 8px 22px rgba(33,31,29,.14)",
  },
  muted: { opacity: 0.55, fontSize: 12 },
  note: { position: "absolute", top: 80, left: 24, zIndex: 11, color: "#fff" },
  err: { position: "absolute", top: 80, left: 24, color: "#9a3412", zIndex: 11 },
  canvas: { position: "absolute", inset: 0, background: "#333333" },
  nest: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 8,
    padding: "5px 12px",
    cursor: "pointer",
    background: "var(--acc, #c67139)",
    color: "#fff",
    fontFamily: "inherit",
  },
};
