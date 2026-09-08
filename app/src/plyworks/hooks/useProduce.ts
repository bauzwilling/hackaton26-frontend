import { useCallback, useRef, useState } from "react";
import { buildSTEP } from "../lib/geometry";
import { getProduce, startProduce, type ProduceJob } from "../lib/produceApi";
import type { Board } from "../types";

// WAITING BFF: browser polling of Flask produce jobs is parked unused; BFF BackgroundService owns the loop (boundary-plan §16).

const POLL_MS = 1200;
export const NESTING_MESSAGE_TYPE = "plyworks-nesting";
export const JW_MESSAGE_TYPE = "plyworks-jw";

export function useProduce(
  boards: Board[],
  kieferThickness: number,
  filmThickness: number
) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [kind, setKind] = useState<"ok" | "fail" | "error" | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const openedJwRef = useRef(false);

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const validationPassed = useCallback((job: ProduceJob) => {
    return job.validationBool ?? job.valid;
  }, []);

  const openJwIfValid = useCallback((job: ProduceJob) => {
    if (openedJwRef.current) return;
    if (validationPassed(job) !== true) return;
    openedJwRef.current = true;
    window.parent.postMessage({ type: JW_MESSAGE_TYPE, jobId: job.jobId }, "*");
  }, [validationPassed]);

  const applyValidation = useCallback((job: ProduceJob) => {
    const passed = validationPassed(job);
    const summary = job.validationReportSummary || job.validationReport;
    if (passed != null && job.message) {
      setKind(passed ? "ok" : "fail");
      setMessage(job.message);
      setReport(summary);
    }
  }, [validationPassed]);

  const applyJob = useCallback((job: ProduceJob) => {
    setJobId(job.jobId);
    if (job.status === "running") {
      applyValidation(job);
      openJwIfValid(job);
      return;
    }
    stopPoll();
    setBusy(false);
    if (job.status === "joined") {
      setKind("ok");
      setMessage(job.message);
      setReport(job.validationReportSummary || job.validationReport);
      openJwIfValid(job);
      return;
    }
    if (job.status === "completed") {
      setKind("ok");
      setMessage(job.message);
      setReport(job.validationReportSummary || job.validationReport);
      window.parent.postMessage(
        { type: NESTING_MESSAGE_TYPE, jobId: job.jobId },
        "*"
      );
      return;
    }
    if (job.message) {
      setKind("fail");
      setMessage(job.message);
      setReport(job.validationReportSummary || job.validationReport);
      return;
    }
    setKind("error");
    setMessage(job.error || "Produce failed.");
    setReport(null);
  }, [applyValidation, openJwIfValid, stopPoll]);

  const start = useCallback(async () => {
    if (busy) return;
    stopPoll();
    setBusy(true);
    setMessage(null);
    setReport(null);
    setKind(null);
    setJobId(null);
    openedJwRef.current = false;
    try {
      const { jobId: id } = await startProduce(buildSTEP(boards), boards, undefined, {
        KieferThickness: kieferThickness,
        FilmThickness: filmThickness,
      });
      setJobId(id);
      const first = await getProduce(id);
      applyJob(first);
      if (first.status === "running") {
        pollRef.current = window.setInterval(async () => {
          try {
            applyJob(await getProduce(id));
          } catch (err) {
            stopPoll();
            setBusy(false);
            setKind("error");
            setMessage(err instanceof Error ? err.message : "Produce failed.");
            setReport(null);
          }
        }, POLL_MS);
      }
    } catch (err) {
      setBusy(false);
      setKind("error");
      setMessage(err instanceof Error ? err.message : "Produce failed.");
      setReport(null);
    }
  }, [applyJob, boards, busy, filmThickness, kieferThickness, stopPoll]);

  return { busy, message, report, kind, jobId, start };
}
