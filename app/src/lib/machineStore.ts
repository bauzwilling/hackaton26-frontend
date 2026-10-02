/* WAITING DATABASE: machine fleet CRUD — session overlay until the machine registry API owns fleet state. */
import type { CompanyId } from "./auth";
import { getCompany, listCompanies } from "./companyStore";

export const MACHINES_KEY = "f2f.adminMachines.v1";

export type CatalogMachine = {
  name: string;
  slug: string;
  owner: string;
  location: string;
  online: boolean;
  /** When false, hidden from Orbit/Jobs pickers for this session. Default true. */
  enabled?: boolean;
  /** Owning company when known (session-added machines always set this). */
  companyId?: CompanyId;
};

/** Shape mirrored into the Jobs picker (kept local to avoid a jobs ↔ store cycle). */
export type JobsMachineMirror = {
  id: string;
  name: string;
  available: boolean;
};

type MachinesOverlay = {
  added: CatalogMachine[];
  removed: string[];
  patches: Record<string, Partial<Pick<CatalogMachine, "name" | "online" | "enabled" | "owner" | "location" | "companyId">>>;
  /** Extra slug prefixes granted to a company this session. */
  companySlugs: Partial<Record<CompanyId, string[]>>;
};

const EMPTY: MachinesOverlay = { added: [], removed: [], patches: {}, companySlugs: {} };

const listeners = new Set<() => void>();

let seed: CatalogMachine[] = [];
let jobsSync: ((machines: JobsMachineMirror[]) => void) | null = null;
let cachedSnapshot: CatalogMachine[] | null = null;

/** Bind immutable catalog fixtures once catalog finishes loading. */
export function bindMachineSeed(machines: CatalogMachine[]) {
  seed = machines.map((m) => ({ ...m, enabled: m.enabled !== false }));
  cachedSnapshot = null;
  syncJobsMirror();
}

/** Jobs module registers a sink so admin fleet changes appear in production pickers. */
export function bindJobsMachineSync(sync: (machines: JobsMachineMirror[]) => void) {
  jobsSync = sync;
  syncJobsMirror();
}

function readOverlay(): MachinesOverlay {
  try {
    const raw = sessionStorage.getItem(MACHINES_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<MachinesOverlay>;
    return {
      added: Array.isArray(parsed.added) ? parsed.added.filter(isMachine) : [],
      removed: Array.isArray(parsed.removed)
        ? parsed.removed.filter((s): s is string => typeof s === "string")
        : [],
      patches: parsed.patches && typeof parsed.patches === "object" ? parsed.patches : {},
      companySlugs: parsed.companySlugs && typeof parsed.companySlugs === "object" ? parsed.companySlugs : {},
    };
  } catch {
    return EMPTY;
  }
}

function isMachine(value: unknown): value is CatalogMachine {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<CatalogMachine>;
  return typeof m.name === "string"
    && typeof m.slug === "string"
    && typeof m.owner === "string"
    && typeof m.location === "string"
    && typeof m.online === "boolean";
}

function writeOverlay(next: MachinesOverlay) {
  try {
    sessionStorage.setItem(MACHINES_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  cachedSnapshot = null;
  for (const listener of listeners) listener();
  syncJobsMirror();
}

function applyMachine(base: CatalogMachine, patch?: Partial<CatalogMachine>): CatalogMachine {
  const merged = patch ? { ...base, ...patch, slug: base.slug } : { ...base };
  return { ...merged, enabled: merged.enabled !== false };
}

/** Live catalog for this browser tab session (fixtures ⊕ overlay). Includes disabled. */
export function listMachines(): CatalogMachine[] {
  return getMachinesSnapshot();
}

/** Machines visible to Orbit / company fleet views. */
export function listEnabledMachines(): CatalogMachine[] {
  return listMachines().filter((m) => m.enabled !== false);
}

export function getMachinesSnapshot(): CatalogMachine[] {
  if (cachedSnapshot) return cachedSnapshot;
  const overlay = readOverlay();
  const removed = new Set(overlay.removed);
  const bySlug = new Map<string, CatalogMachine>();

  for (const machine of seed) {
    if (removed.has(machine.slug)) continue;
    bySlug.set(machine.slug, applyMachine(machine, overlay.patches[machine.slug]));
  }
  for (const machine of overlay.added) {
    if (removed.has(machine.slug)) continue;
    bySlug.set(machine.slug, applyMachine(machine, overlay.patches[machine.slug]));
  }
  cachedSnapshot = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return cachedSnapshot;
}

export function subscribeMachines(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function companyMachineSlugs(companyId: CompanyId): string[] {
  const base = getCompany(companyId)?.machineSlugs ?? [];
  const extra = readOverlay().companySlugs[companyId] ?? [];
  return [...new Set([...base, ...extra])];
}

/** Resolve which company inventory group a machine belongs to. */
export function companyIdForMachine(machine: CatalogMachine): CompanyId | null {
  if (machine.companyId && getCompany(machine.companyId)) return machine.companyId;
  const companies = listCompanies();
  const owner = machine.owner.toLowerCase();
  const byOwner = companies.find((c) => (
    c.name.toLowerCase() === owner
    || c.short.toLowerCase() === owner
    || owner.includes(c.short.toLowerCase())
  ));
  if (byOwner) return byOwner.id;

  let best: { id: CompanyId; len: number } | null = null;
  for (const company of companies) {
    for (const prefix of companyMachineSlugs(company.id)) {
      if (!machine.slug.startsWith(prefix)) continue;
      if (!best || prefix.length > best.len) best = { id: company.id, len: prefix.length };
    }
  }
  return best?.id ?? null;
}

function slugToJobsId(slug: string): string {
  return `machine-${slug}`;
}

function toJobsMachine(machine: CatalogMachine): JobsMachineMirror {
  return {
    id: slugToJobsId(machine.slug),
    name: machine.name,
    available: machine.enabled !== false && machine.online,
  };
}

function syncJobsMirror() {
  if (!jobsSync) return;
  // Only enabled catalog machines are mirrored; Jobs keeps its own fixture list separately.
  jobsSync(listEnabledMachines().map(toJobsMachine));
}

export function findMachine(slug: string): CatalogMachine | null {
  return listMachines().find((m) => m.slug === slug) ?? null;
}

function nextSlug(prefix: string): string {
  const existing = listMachines()
    .map((m) => m.slug)
    .filter((s) => s.startsWith(`${prefix}-`));
  let max = 0;
  for (const slug of existing) {
    const tail = slug.slice(prefix.length + 1);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export function addMachine(input: {
  name: string;
  companyId: CompanyId;
  location: string;
  online?: boolean;
}): CatalogMachine {
  const name = String(input.name || "").trim();
  const location = String(input.location || "").trim();
  if (!name) throw new Error("Enter a machine name.");
  if (!location) throw new Error("Enter a location.");
  const company = getCompany(input.companyId);
  if (!company) throw new Error("That company was not found.");

  const prefixes = companyMachineSlugs(input.companyId);
  let prefix = prefixes[0];
  if (!prefix) {
    // New companies may not have a slug prefix yet — derive one from the domain.
    const stem = company.domain.split(".")[0]?.replace(/[^a-z0-9]/gi, "") || "co";
    prefix = `xx-${stem}`.slice(0, 24).toLowerCase();
  }

  const slug = nextSlug(prefix);
  const machine: CatalogMachine = {
    name,
    slug,
    owner: company.name,
    location,
    online: input.online ?? true,
    enabled: false,
    companyId: input.companyId,
  };

  const overlay = readOverlay();
  const companySlugs = { ...overlay.companySlugs };
  if (!company.machineSlugs.includes(prefix)) {
    companySlugs[input.companyId] = [...(companySlugs[input.companyId] ?? []), prefix];
  }

  writeOverlay({
    ...overlay,
    added: [...overlay.added.filter((m) => m.slug !== slug), machine],
    removed: overlay.removed.filter((s) => s !== slug),
    patches: (() => {
      const patches = { ...overlay.patches };
      delete patches[slug];
      return patches;
    })(),
    companySlugs,
  });
  return machine;
}

export function updateMachine(
  slug: string,
  patch: Partial<Pick<CatalogMachine, "name" | "online" | "enabled" | "owner" | "location" | "companyId">>,
) {
  const current = findMachine(slug);
  if (!current) throw new Error("That machine was not found.");

  const overlay = readOverlay();
  const inAdded = overlay.added.some((m) => m.slug === slug);
  const inSeed = seed.some((m) => m.slug === slug);

  if (inAdded) {
    writeOverlay({
      ...overlay,
      added: overlay.added.map((m) => (m.slug === slug ? { ...m, ...patch, slug } : m)),
    });
    return findMachine(slug)!;
  }
  if (inSeed) {
    writeOverlay({
      ...overlay,
      patches: {
        ...overlay.patches,
        [slug]: { ...overlay.patches[slug], ...patch },
      },
    });
    return findMachine(slug)!;
  }
  throw new Error("That machine was not found.");
}

export function removeMachine(slug: string) {
  const current = findMachine(slug);
  if (!current) throw new Error("That machine was not found.");

  const overlay = readOverlay();
  const added = overlay.added.filter((m) => m.slug !== slug);
  const patches = { ...overlay.patches };
  delete patches[slug];
  const removed = overlay.removed.includes(slug) ? overlay.removed : [...overlay.removed, slug];
  writeOverlay({ ...overlay, added, removed, patches });
}

/** Enable or disable every machine in a company inventory group. */
export function setMachinesEnabledForCompany(companyId: CompanyId, enabled: boolean) {
  const targets = listMachines().filter((m) => companyIdForMachine(m) === companyId);
  if (!targets.length) return;
  const overlay = readOverlay();
  let added = [...overlay.added];
  const patches = { ...overlay.patches };
  for (const machine of targets) {
    const inAdded = added.some((m) => m.slug === machine.slug);
    if (inAdded) {
      added = added.map((m) => (m.slug === machine.slug ? { ...m, enabled } : m));
    } else {
      patches[machine.slug] = { ...patches[machine.slug], enabled };
    }
  }
  writeOverlay({ ...overlay, added, patches });
}

/** Map a jobs machine id back to a catalog slug when it was derived from the fleet. */
export function jobsIdToSlug(id: string): string | null {
  if (!id.startsWith("machine-")) return null;
  const rest = id.slice("machine-".length);
  if (findMachine(rest)) return rest;
  return null;
}
