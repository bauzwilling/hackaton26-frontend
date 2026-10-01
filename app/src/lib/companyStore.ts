/* WAITING DATABASE: company registry CRUD — session overlay until the company API owns onboarding. */
import type { AppId, CompanyId } from "./auth";
import { setUsersSuspendedForDomain } from "./directoryStore";

export const COMPANIES_KEY = "f2f.adminCompanies.v1";

export type CompanyRecord = {
  id: CompanyId;
  name: string;
  short: string;
  domain: string;
  plan: string;
  apps: AppId[];
  machineSlugs: string[];
  seats: number;
  suspended?: boolean;
};

type CompaniesOverlay = {
  added: CompanyRecord[];
  removed: string[];
  patches: Record<string, Partial<Pick<CompanyRecord, "name" | "short" | "domain" | "plan" | "suspended" | "seats">>>;
};

const EMPTY: CompaniesOverlay = { added: [], removed: [], patches: {} };
const listeners = new Set<() => void>();

let seed: CompanyRecord[] = [];
let cachedSnapshot: CompanyRecord[] | null = null;

export function bindCompanySeed(companies: CompanyRecord[]) {
  seed = companies.map((c) => ({ ...c, suspended: Boolean(c.suspended) }));
  cachedSnapshot = null;
}

function readOverlay(): CompaniesOverlay {
  try {
    const raw = sessionStorage.getItem(COMPANIES_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<CompaniesOverlay>;
    return {
      added: Array.isArray(parsed.added) ? parsed.added.filter(isCompany) : [],
      removed: Array.isArray(parsed.removed)
        ? parsed.removed.filter((id): id is string => typeof id === "string")
        : [],
      patches: parsed.patches && typeof parsed.patches === "object" ? parsed.patches : {},
    };
  } catch {
    return EMPTY;
  }
}

function isCompany(value: unknown): value is CompanyRecord {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<CompanyRecord>;
  return typeof c.id === "string"
    && typeof c.name === "string"
    && typeof c.domain === "string"
    && typeof c.short === "string";
}

function writeOverlay(next: CompaniesOverlay) {
  try {
    sessionStorage.setItem(COMPANIES_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

function applyCompany(base: CompanyRecord, patch?: Partial<CompanyRecord>): CompanyRecord {
  const merged = patch ? { ...base, ...patch, id: base.id } : { ...base };
  return { ...merged, suspended: Boolean(merged.suspended) };
}

/** Live companies for this tab. DataB (D) is always first. */
export function listCompanies(): CompanyRecord[] {
  return getCompaniesSnapshot();
}

export function getCompaniesSnapshot(): CompanyRecord[] {
  if (cachedSnapshot) return cachedSnapshot;
  const overlay = readOverlay();
  const removed = new Set(overlay.removed);
  const byId = new Map<string, CompanyRecord>();

  for (const company of seed) {
    if (removed.has(company.id)) continue;
    byId.set(company.id, applyCompany(company, overlay.patches[company.id]));
  }
  for (const company of overlay.added) {
    if (removed.has(company.id)) continue;
    byId.set(company.id, applyCompany(company, overlay.patches[company.id]));
  }

  const all = [...byId.values()];
  const datab = all.filter((c) => c.id === "D");
  const rest = all
    .filter((c) => c.id !== "D")
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedSnapshot = [...datab, ...rest];
  return cachedSnapshot;
}

export function subscribeCompanies(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCompany(id: CompanyId | null | undefined): CompanyRecord | null {
  if (!id) return null;
  return listCompanies().find((c) => c.id === id) ?? null;
}

export function companyIdFromDomain(domain: string): CompanyId | null {
  const key = String(domain || "").trim().toLowerCase();
  if (!key) return null;
  return listCompanies().find((c) => c.domain === key)?.id ?? null;
}

function nextCompanyId(): CompanyId {
  const used = new Set(listCompanies().map((c) => c.id));
  for (let i = 0; i < 26; i += 1) {
    const id = String.fromCharCode(65 + i); // A–Z
    if (!used.has(id)) return id;
  }
  return `co-${Date.now().toString(36)}`;
}

export function addCompany(input: { name: string; domain: string }): CompanyRecord {
  const name = String(input.name || "").trim();
  let domain = String(input.domain || "").trim().toLowerCase();
  if (!name) throw new Error("Enter a company name.");
  if (!domain) throw new Error("Enter a company email domain.");
  if (domain.includes("@")) domain = domain.split("@").pop() || domain;
  if (!domain.includes(".")) throw new Error("Use a domain like acme.example.");
  if (companyIdFromDomain(domain)) throw new Error("That domain is already registered.");

  const company: CompanyRecord = {
    id: nextCompanyId(),
    name,
    short: name,
    domain,
    plan: "Custom",
    apps: ["boxouts", "simpleparts", "plyworks", "nesting"],
    machineSlugs: [],
    seats: 10,
    suspended: true,
  };

  const overlay = readOverlay();
  writeOverlay({
    ...overlay,
    added: [...overlay.added.filter((c) => c.id !== company.id), company],
    removed: overlay.removed.filter((id) => id !== company.id),
    patches: (() => {
      const patches = { ...overlay.patches };
      delete patches[company.id];
      return patches;
    })(),
  });
  return company;
}

export function setCompanySuspended(id: CompanyId, suspended: boolean, opts?: { cascade?: boolean }) {
  if (id === "D" && suspended) throw new Error("DataB cannot be suspended.");
  const current = getCompany(id);
  if (!current) throw new Error("That company was not found.");
  const cascade = opts?.cascade !== false;

  const overlay = readOverlay();
  const inAdded = overlay.added.some((c) => c.id === id);
  const inSeed = seed.some((c) => c.id === id);

  if (inAdded) {
    writeOverlay({
      ...overlay,
      added: overlay.added.map((c) => (c.id === id ? { ...c, suspended } : c)),
    });
  } else if (inSeed) {
    writeOverlay({
      ...overlay,
      patches: {
        ...overlay.patches,
        [id]: { ...overlay.patches[id], suspended },
      },
    });
  } else {
    throw new Error("That company was not found.");
  }

  if (cascade) setUsersSuspendedForDomain(current.domain, suspended);
}
