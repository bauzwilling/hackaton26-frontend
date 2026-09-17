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

export type MachineId =
  | "machine-1a"
  | "machine-2b"
  | "machine-3c"
  | "machine-4d"
  | "machine-5d";

export type Machine = {
  id: MachineId;
  name: string;
  available: boolean;
};

// WAITING BFF: machine availability and operator-machine claims come from authenticated BFF session claims.
// WAITING DATABASE: machine occupancy and shift assignments live in the platform production store.
export const MACHINES: Machine[] = [
  { id: "machine-1a", name: "Machine 1A", available: true },
  { id: "machine-2b", name: "Machine 2B", available: false },
  { id: "machine-3c", name: "Machine 3C", available: false },
  { id: "machine-4d", name: "Machine 4D", available: true },
  { id: "machine-5d", name: "Machine 5D", available: true },
];

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

export type JobFeedback = {
  id: string;
  message: string;
  at: number;
  by: string;
  byName: string;
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
  assignedMachineId: MachineId | null;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: number | null;
  feedback: JobFeedback[];
  history: JobEvent[];
  snapshot: JobSnapshot;
};

const JOBS_KEY = "f2f.jobs.v1";
const OPERATOR_MACHINE_KEY = "f2f.operatorMachine.v1";
const listeners = new Set<() => void>();

// WAITING DATABASE: ProductionRequest owns machine assignment, claims, feedback, fulfillment, and immutable order snapshots.
// WAITING BFF: replace this browser repository and client-side role checks with authorized Platform BFF production endpoints.
function readAll(): Job[] {
  try {
    const value = JSON.parse(localStorage.getItem(JOBS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.map(normalizeJob).filter((job): job is Job => job !== null);
  } catch {
    return [];
  }
}

function isMachineId(value: unknown): value is MachineId {
  return MACHINES.some((machine) => machine.id === value);
}

function normalizeJob(value: unknown): Job | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Partial<Job> & {
    assignedTo?: unknown;
    assignedToName?: unknown;
  };
  if (typeof legacy.id !== "string" || !legacy.snapshot || !Array.isArray(legacy.history)) return null;

  const assignedMachineId = isMachineId(legacy.assignedMachineId)
    ? legacy.assignedMachineId
    : null;
  const legacyPersonallyAssigned = !assignedMachineId && typeof legacy.assignedTo === "string";
  const resetLegacyProgress = legacyPersonallyAssigned
    && (legacy.status === "assigned" || legacy.status === "queued" || legacy.status === "in_progress");
  const preserveLegacyClaim = legacyPersonallyAssigned && !resetLegacyProgress;
  const machineJob = { ...legacy };
  delete machineJob.assignedTo;
  delete machineJob.assignedToName;

  return {
    ...(machineJob as Job),
    status: resetLegacyProgress ? "unassigned" : (legacy.status ?? "unassigned"),
    assignedMachineId,
    claimedBy: typeof legacy.claimedBy === "string"
      ? legacy.claimedBy
      : preserveLegacyClaim ? legacy.assignedTo as string : null,
    claimedByName: typeof legacy.claimedByName === "string"
      ? legacy.claimedByName
      : preserveLegacyClaim && typeof legacy.assignedToName === "string" ? legacy.assignedToName : null,
    claimedAt: typeof legacy.claimedAt === "number" ? legacy.claimedAt : null,
    feedback: Array.isArray(legacy.feedback) ? legacy.feedback : [],
  };
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
    assignedMachineId: null,
    claimedBy: null,
    claimedByName: null,
    claimedAt: null,
    feedback: [],
    history: [{ status: "unassigned", at: now, by: actor.email }],
    snapshot: structuredClone(input.snapshot),
  };
  writeAll([job, ...readAll()]);
  return job;
}

export function jobsFor(actor: Session | null, jobs = getJobsSnapshot(), machineId: MachineId | null = null) {
  if (!actor || (actor.role !== "manager" && actor.role !== "operator")) return [];
  const companyJobs = jobs.filter((job) => job.company === actor.company);
  return actor.role === "manager"
    ? companyJobs
    : companyJobs.filter((job) => machineId && job.assignedMachineId === machineId);
}

export function getJobFor(actor: Session | null, id: string, machineId: MachineId | null = null) {
  return jobsFor(actor, getJobsSnapshot(), machineId).find((job) => job.id === id) ?? null;
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

export function assignJob(actor: Session, id: string, machineId: MachineId) {
  // WAITING BFF: manager authorization and machine assignment are validated and written by the production endpoint.
  if (actor.role !== "manager") throw new Error("Only managers can assign jobs.");
  if (!isMachineId(machineId)) throw new Error("Choose a machine.");
  return replaceJob(id, (job) => {
    if (job.company !== actor.company || job.status !== "unassigned") throw new Error("This job cannot be assigned.");
    return {
      ...withStatus(job, "assigned", actor),
      assignedMachineId: machineId,
      claimedBy: null,
      claimedByName: null,
      claimedAt: null,
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

export function updateJobProgress(
  actor: Session,
  id: string,
  machineId: MachineId,
  status: "queued" | "in_progress" | "completed",
) {
  // WAITING BFF: operator authorization, active machine claim, and status transition are validated by the production endpoint.
  if (actor.role !== "operator") throw new Error("Only operators can update production progress.");
  if (!machineIsAvailable(machineId)) throw new Error("Select an available machine.");
  return replaceJob(id, (job) => {
    if (job.company !== actor.company || job.assignedMachineId !== machineId) throw new Error("This job is not assigned to your machine.");
    if (!OPERATOR_TRANSITIONS[job.status].includes(status)) throw new Error("That status change is not allowed.");
    const next = withStatus(job, status, actor);
    if ((job.status !== "assigned" && job.status !== "queued") || job.claimedBy) return next;
    return {
      ...next,
      claimedBy: actor.email,
      claimedByName: actor.name,
      claimedAt: next.updatedAt,
    };
  });
}

export function sendJobFeedback(actor: Session, id: string, machineId: MachineId, message: string) {
  // WAITING BFF: production feedback is submitted to the assigned ProductionRequest through the authorized endpoint.
  if (actor.role !== "operator") throw new Error("Only operators can send production feedback.");
  if (!machineIsAvailable(machineId)) throw new Error("Select an available machine.");
  const clean = message.trim();
  if (!clean) throw new Error("Enter feedback before sending.");
  if (clean.length > 500) throw new Error("Feedback must be 500 characters or fewer.");
  return replaceJob(id, (job) => {
    if (job.company !== actor.company || job.assignedMachineId !== machineId) throw new Error("This job is not assigned to your machine.");
    const now = Date.now();
    return {
      ...job,
      updatedAt: now,
      feedback: [
        ...job.feedback,
        {
          id: `feedback-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          message: clean,
          at: now,
          by: actor.email,
          byName: actor.name,
        },
      ],
    };
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

export function machineFor(id: MachineId | null | undefined) {
  return MACHINES.find((machine) => machine.id === id) ?? null;
}

export function machineIsAvailable(id: MachineId | null | undefined): id is MachineId {
  return Boolean(machineFor(id)?.available);
}

// WAITING BFF: selected machine is an authenticated operator-session claim returned by the BFF.
// WAITING DATABASE: operator-machine login belongs to an active shift/session record.
export function getOperatorMachine(actor: Session | null): MachineId | null {
  if (!actor || actor.role !== "operator") return null;
  try {
    const value = JSON.parse(localStorage.getItem(OPERATOR_MACHINE_KEY) ?? "{}") as Record<string, unknown>;
    const machineId = value[actor.email];
    return machineIsAvailable(machineId as MachineId) ? machineId as MachineId : null;
  } catch {
    return null;
  }
}

export function setOperatorMachine(actor: Session, machineId: MachineId | null) {
  if (actor.role !== "operator") throw new Error("Only operators select machines.");
  if (machineId && !machineIsAvailable(machineId)) throw new Error("That machine is already in use.");
  try {
    const value = JSON.parse(localStorage.getItem(OPERATOR_MACHINE_KEY) ?? "{}") as Record<string, unknown>;
    if (machineId) value[actor.email] = machineId;
    else delete value[actor.email];
    // WAITING DATABASE: persist this selection on the operator's active machine session.
    localStorage.setItem(OPERATOR_MACHINE_KEY, JSON.stringify(value));
  } catch {
    throw new Error("The machine selection could not be saved.");
  }
}
