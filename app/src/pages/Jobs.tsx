import { useMemo, useState, useSyncExternalStore } from "react";
import type { Session } from "../lib/auth";
import {
  JOB_STATUS_LABELS,
  MACHINES,
  assignJob,
  getOperatorMachine,
  getJobsSnapshot,
  jobsFor,
  machineFor,
  sendJobFeedback,
  setOperatorMachine,
  subscribeJobs,
  updateJobFulfillment,
  updateJobProgress,
  type Job,
  type MachineId,
} from "../lib/jobs";
import { useSession } from "../context/session";
import { useWorkspace } from "../context/workspace";

function dateTime(value: number) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function JobsPage() {
  // WAITING BFF: role claims, available machines, visible jobs, and permitted row actions come from the authorized jobs response.
  const { session } = useSession();
  const { inspectJob } = useWorkspace();
  const allJobs = useSyncExternalStore(subscribeJobs, getJobsSnapshot, () => []);
  const storedMachine = useMemo(() => getOperatorMachine(session), [session]);
  const [machineOverride, setMachineOverride] = useState<{
    email: string;
    machineId: MachineId | null;
  } | null>(null);
  const selectedMachine = session?.role === "operator"
    ? (machineOverride?.email === session.email ? machineOverride.machineId : storedMachine)
    : null;
  const jobs = useMemo(
    () => jobsFor(session, allJobs, selectedMachine),
    [session, allJobs, selectedMachine],
  );
  const [choice, setChoice] = useState<Record<string, MachineId | "">>({});
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [error, setError] = useState("");

  function run(action: () => void) {
    try {
      setError("");
      action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The job could not be updated.");
      return false;
    }
  }

  if (!session || (session.role !== "manager" && session.role !== "operator")) {
    return <div className="jobs-empty">Jobs are available to managers and operators.</div>;
  }

  return (
    <section className="jobs-page">
      <header className="jobs-head">
        <div>
          <p className="jobs-kicker">Production</p>
          <h1>Jobs</h1>
        </div>
        {session.role === "operator" ? (
          <label className="operator-machine-picker">
            <span>Operating machine</span>
            <select
              value={selectedMachine ?? ""}
              onChange={(event) => {
                const next = event.target.value as MachineId | "";
                if (run(() => setOperatorMachine(session, next || null))) {
                  setMachineOverride({ email: session.email, machineId: next || null });
                  setFeedbackFor(null);
                  setFeedbackDraft("");
                }
              }}
            >
              <option value="">Select a machine</option>
              {MACHINES.map((machine) => (
                <option key={machine.id} value={machine.id} disabled={!machine.available}>
                  {machine.name}{machine.available ? "" : " — In use"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>{jobs.length} {jobs.length === 1 ? "job" : "jobs"}</span>
        )}
      </header>
      {error && <p className="jobs-error" role="alert">{error}</p>}
      {session.role === "operator" && !selectedMachine ? (
        <div className="jobs-empty">Select an available machine to see its job queue.</div>
      ) : !jobs.length ? (
        <div className="jobs-empty">
          {session.role === "manager"
            ? "No orders have been placed yet."
            : `No jobs are assigned to ${machineFor(selectedMachine)?.name ?? "this machine"}.`}
        </div>
      ) : (
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Assigned machine</th>
                <th>Feedback</th>
                <th>Updated</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  session={session}
                  selectedMachine={selectedMachine}
                  machineChoice={choice[job.id] ?? ""}
                  onMachineChoice={(machineId) => setChoice((current) => ({ ...current, [job.id]: machineId }))}
                  feedbackOpen={feedbackFor === job.id}
                  feedbackDraft={feedbackFor === job.id ? feedbackDraft : ""}
                  onFeedbackDraft={setFeedbackDraft}
                  onFeedbackOpen={() => {
                    setFeedbackFor(job.id);
                    setFeedbackDraft("");
                  }}
                  onFeedbackCancel={() => {
                    setFeedbackFor(null);
                    setFeedbackDraft("");
                  }}
                  onInspect={() => inspectJob(job)}
                  onRun={run}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function JobRow({
  job,
  session,
  selectedMachine,
  machineChoice,
  onMachineChoice,
  feedbackOpen,
  feedbackDraft,
  onFeedbackDraft,
  onFeedbackOpen,
  onFeedbackCancel,
  onInspect,
  onRun,
}: {
  job: Job;
  session: Session;
  selectedMachine: MachineId | null;
  machineChoice: MachineId | "";
  onMachineChoice: (machineId: MachineId | "") => void;
  feedbackOpen: boolean;
  feedbackDraft: string;
  onFeedbackDraft: (message: string) => void;
  onFeedbackOpen: () => void;
  onFeedbackCancel: () => void;
  onInspect: () => void;
  onRun: (action: () => void) => boolean;
}) {
  const machine = machineFor(job.assignedMachineId);
  const latestFeedback = job.feedback[job.feedback.length - 1];

  return (
    <tr>
      <td>
        <strong>{job.snapshot.title || "Production order"}</strong>
        <small>{job.sourceApp}</small>
      </td>
      <td>{job.submittedByName}</td>
      <td><span className={`job-status is-${job.status}`}>{JOB_STATUS_LABELS[job.status]}</span></td>
      <td>
        {session.role === "manager" && job.status === "unassigned" ? (
          <div className="job-assign">
            <select
              value={machineChoice}
              onChange={(event) => onMachineChoice(event.target.value as MachineId | "")}
              aria-label="Choose machine"
            >
              <option value="">Choose machine</option>
              {MACHINES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.available ? "" : " — In use"}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!machineChoice}
              onClick={() => machineChoice && onRun(() => assignJob(session, job.id, machineChoice))}
            >
              Assign
            </button>
          </div>
        ) : (
          <div className="job-machine">
            <strong>{machine?.name ?? "—"}</strong>
            {job.claimedByName && <small>Claimed by {job.claimedByName}</small>}
          </div>
        )}
      </td>
      <td>
        {session.role === "operator" ? (
          feedbackOpen ? (
            <div className="job-feedback-form">
              <textarea
                value={feedbackDraft}
                onChange={(event) => onFeedbackDraft(event.target.value)}
                placeholder="Add production feedback"
                aria-label={`Feedback for ${job.snapshot.title || "production order"}`}
                maxLength={500}
                rows={2}
              />
              <div>
                <button
                  type="button"
                  disabled={!feedbackDraft.trim() || !selectedMachine}
                  onClick={() => {
                    if (
                      selectedMachine
                      && onRun(() => sendJobFeedback(session, job.id, selectedMachine, feedbackDraft))
                    ) {
                      onFeedbackCancel();
                    }
                  }}
                >
                  Send
                </button>
                <button type="button" onClick={onFeedbackCancel}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="job-feedback-button" onClick={onFeedbackOpen}>
              Send feedback
            </button>
          )
        ) : latestFeedback ? (
          <div className="job-feedback-summary">
            <span>{latestFeedback.message}</span>
            <small>{latestFeedback.byName} · {dateTime(latestFeedback.at)}</small>
          </div>
        ) : (
          <span className="job-feedback-empty">—</span>
        )}
      </td>
      <td><time dateTime={new Date(job.updatedAt).toISOString()}>{dateTime(job.updatedAt)}</time></td>
      <td>
        <div className="job-actions">
          <button type="button" onClick={onInspect}>Inspect</button>
          {session.role === "operator" && selectedMachine && job.status === "assigned" && (
            <>
              <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, selectedMachine, "queued"))}>Add to queue</button>
              <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, selectedMachine, "in_progress"))}>Start</button>
            </>
          )}
          {session.role === "operator" && selectedMachine && job.status === "queued" && (
            <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, selectedMachine, "in_progress"))}>Start</button>
          )}
          {session.role === "operator" && selectedMachine && job.status === "in_progress" && (
            <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, selectedMachine, "completed"))}>Mark completed</button>
          )}
          {session.role === "manager" && job.status === "completed" && (
            <button type="button" onClick={() => onRun(() => updateJobFulfillment(session, job.id, "shipped"))}>Mark shipped</button>
          )}
          {session.role === "manager" && job.status === "shipped" && (
            <button type="button" onClick={() => onRun(() => updateJobFulfillment(session, job.id, "received"))}>Mark received</button>
          )}
        </div>
      </td>
    </tr>
  );
}
