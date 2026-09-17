import { useMemo, useState, useSyncExternalStore } from "react";
import { DIRECTORY, companyOf, type Session } from "../lib/auth";
import {
  JOB_STATUS_LABELS,
  assignJob,
  getJobsSnapshot,
  jobsFor,
  subscribeJobs,
  updateJobFulfillment,
  updateJobProgress,
  type Job,
} from "../lib/jobs";
import { useSession } from "../context/session";
import { useWorkspace } from "../context/workspace";

function dateTime(value: number) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function JobsPage() {
  const { session } = useSession();
  const { inspectJob } = useWorkspace();
  const allJobs = useSyncExternalStore(subscribeJobs, getJobsSnapshot, () => []);
  const jobs = useMemo(() => jobsFor(session, allJobs), [session, allJobs]);
  const operators = useMemo(() => DIRECTORY.filter((person) => (
    person.role === "operator" && session && companyOf(person.email) === session.company
  )), [session]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function run(action: () => void) {
    try {
      setError("");
      action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The job could not be updated.");
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
        <span>{jobs.length} {jobs.length === 1 ? "job" : "jobs"}</span>
      </header>
      {error && <p className="jobs-error" role="alert">{error}</p>}
      {!jobs.length ? (
        <div className="jobs-empty">
          {session.role === "manager" ? "No orders have been placed yet." : "No jobs are assigned to you."}
        </div>
      ) : (
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Operator</th>
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
                  operators={operators}
                  operatorChoice={choice[job.id] ?? ""}
                  onOperatorChoice={(email) => setChoice((current) => ({ ...current, [job.id]: email }))}
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
  operators,
  operatorChoice,
  onOperatorChoice,
  onInspect,
  onRun,
}: {
  job: Job;
  session: Session;
  operators: typeof DIRECTORY;
  operatorChoice: string;
  onOperatorChoice: (email: string) => void;
  onInspect: () => void;
  onRun: (action: () => void) => void;
}) {
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
            <select value={operatorChoice} onChange={(event) => onOperatorChoice(event.target.value)} aria-label="Choose operator">
              <option value="">Choose operator</option>
              {operators.map((operator) => <option key={operator.email} value={operator.email}>{operator.name}</option>)}
            </select>
            <button
              type="button"
              disabled={!operatorChoice}
              onClick={() => {
                const operator = operators.find((person) => person.email === operatorChoice);
                if (operator) onRun(() => assignJob(session, job.id, { ...operator, company: session.company }));
              }}
            >
              Assign
            </button>
          </div>
        ) : (job.assignedToName ?? "—")}
      </td>
      <td><time dateTime={new Date(job.updatedAt).toISOString()}>{dateTime(job.updatedAt)}</time></td>
      <td>
        <div className="job-actions">
          <button type="button" onClick={onInspect}>Inspect</button>
          {session.role === "operator" && job.status === "assigned" && (
            <>
              <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, "queued"))}>Add to queue</button>
              <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, "in_progress"))}>Start</button>
            </>
          )}
          {session.role === "operator" && job.status === "queued" && (
            <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, "in_progress"))}>Start</button>
          )}
          {session.role === "operator" && job.status === "in_progress" && (
            <button type="button" onClick={() => onRun(() => updateJobProgress(session, job.id, "completed"))}>Mark completed</button>
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
