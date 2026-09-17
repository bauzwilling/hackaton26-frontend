import type { Session } from "./auth";
import type { RequestEntry, WorkspaceNode } from "../workspace/document";
import type { UserEdge } from "../workspace/topology";
import type { ViewportSnapshot } from "../workspace/persist";

export type JobStatus =
  | "unassigned"
  | "assigned"
  | "queued"
  | "in_progress"
  | "completed"
  | "shipped"
  | "received";

export type FrozenAppSnapshot = {
  kind: "simpleparts-nesting" | "plyworks-nesting" | "plyworks";
  nodeId: string;
  data: unknown;
};

export type JobSnapshot = {
  title: string;
  entries: RequestEntry[];
  nodes: WorkspaceNode[];
  userEdges: UserEdge[];
  viewport: ViewportSnapshot;
  zTop: number;
  apps: FrozenAppSnapshot[];
};

export type JobEvent = {
  status: JobStatus;
  at: number;
  by: string;
};

export type Job = {
  id: string;
  company: Session["company"];
  submittedBy: string;
  submittedByName: string;
  sourceSessionId: string;
  sourceApp: string;
  createdAt: number;
  updatedAt: number;
  status: JobStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  history: JobEvent[];
  snapshot: JobSnapshot;
};

const JOBS_KEY = "f2f.jobs.v1";
const listeners = new Set<() => void>();

// WAITING DATABASE: production jobs, role grants, assignments, fulfillment statuses, and immutable order snapshots.
// WAITING BFF: replace this browser repository with Platform BFF production job endpoints.
function readAll(): Job[] {
  try {
    const value = JSON.parse(localStorage.getItem(JOBS_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let cacheRaw: string | null = null;
let cache: Job[] = [];

export function getJobsSnapshot(): Job[] {
  const raw = localStorage.getItem(JOBS_KEY) ?? "[]";
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = readAll();
  }
  return cache;
}

function writeAll(jobs: Job[]) {
  const raw = JSON.stringify(jobs);
  localStorage.setItem(JOBS_KEY, raw);
  cacheRaw = raw;
  cache = jobs;
  for (const listener of listeners) listener();
}

export function subscribeJobs(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== JOBS_KEY) return;
    cacheRaw = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function jobId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createJob(
  actor: Session,
  input: Pick<Job, "sourceSessionId" | "sourceApp" | "snapshot">,
): Job {
  if (actor.role !== "user") throw new Error("Only users can place orders.");
  const now = Date.now();
  const job: Job = {
    id: jobId(),
    company: actor.company,
    submittedBy: actor.email,
    submittedByName: actor.name,
    sourceSessionId: input.sourceSessionId,
    sourceApp: input.sourceApp,
    createdAt: now,
    updatedAt: now,
    status: "unassigned",
    assignedTo: null,
    assignedToName: null,
    history: [{ status: "unassigned", at: now, by: actor.email }],
    snapshot: structuredClone(input.snapshot),
  };
  writeAll([job, ...readAll()]);
  return job;
}

export function jobsFor(actor: Session | null, jobs = getJobsSnapshot()) {
  if (!actor || (actor.role !== "manager" && actor.role !== "operator")) return [];
  const companyJobs = jobs.filter((job) => job.company === actor.company);
  return actor.role === "manager"
    ? companyJobs
    : companyJobs.filter((job) => job.assignedTo === actor.email);
}

export function getJobFor(actor: Session | null, id: string) {
  return jobsFor(actor).find((job) => job.id === id) ?? null;
}

function replaceJob(id: string, update: (job: Job) => Job) {
  const jobs = readAll();
  const index = jobs.findIndex((job) => job.id === id);
  if (index < 0) throw new Error("Job not found.");
  const next = [...jobs];
  next[index] = update(jobs[index]);
  writeAll(next);
  return next[index];
}

function withStatus(job: Job, status: JobStatus, actor: Session): Job {
  const now = Date.now();
  return {
    ...job,
    status,
    updatedAt: now,
    history: [...job.history, { status, at: now, by: actor.email }],
  };
}

export function assignJob(actor: Session, id: string, operator: Pick<Session, "email" | "name" | "company" | "role">) {
  if (actor.role !== "manager") throw new Error("Only managers can assign jobs.");
  if (operator.role !== "operator" || operator.company !== actor.company) throw new Error("Choose an operator from this company.");
  return replaceJob(id, (job) => {
    if (job.company !== actor.company || job.status !== "unassigned") throw new Error("This job cannot be assigned.");
    return {
      ...withStatus(job, "assigned", actor),
      assignedTo: operator.email,
      assignedToName: operator.name,
    };
  });
}

const OPERATOR_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  unassigned: [],
  assigned: ["queued", "in_progress"],
  queued: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
  shipped: [],
  received: [],
};

export function updateJobProgress(actor: Session, id: string, status: "queued" | "in_progress" | "completed") {
  if (actor.role !== "operator") throw new Error("Only operators can update production progress.");
  return replaceJob(id, (job) => {
    if (job.company !== actor.company || job.assignedTo !== actor.email) throw new Error("This job is not assigned to you.");
    if (!OPERATOR_TRANSITIONS[job.status].includes(status)) throw new Error("That status change is not allowed.");
    return withStatus(job, status, actor);
  });
}

export function updateJobFulfillment(actor: Session, id: string, status: "shipped" | "received") {
  if (actor.role !== "manager") throw new Error("Only managers can update fulfillment.");
  return replaceJob(id, (job) => {
    if (job.company !== actor.company) throw new Error("Job not found.");
    const allowed = (job.status === "completed" && status === "shipped")
      || (job.status === "shipped" && status === "received");
    if (!allowed) throw new Error("That status change is not allowed.");
    return withStatus(job, status, actor);
  });
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  queued: "Queued",
  in_progress: "In progress",
  completed: "Completed",
  shipped: "Shipped",
  received: "Received",
};
