/* WAITING DATABASE: companies, users, roles, and the signed-in session.
 * Sign-in does not look up a server. Company is inferred from the email
 * domain; role is taken from this directory. Swap DIRECTORY / COMPANIES
 * and SESSION_KEY for API results later without changing the session shape. */
import {
  bindDirectorySeed,
  findLiveUser,
  listUsers,
  type DirectoryUser,
} from "./directoryStore";
import {
  bindCompanySeed,
  companyIdFromDomain,
  getCompany,
  listCompanies,
  type CompanyRecord,
} from "./companyStore";

export const SESSION_KEY = "f2f.session"; // WAITING DATABASE: signed-in session cookie/token
export const OVERRIDE_KEY = "f2f.roleOverrides"; // WAITING DATABASE: role grants — unused in the app until admin console writes them

export type RoleId = "user" | "operator" | "manager" | "admin" | "superuser";
/** Fixture ids A–D plus session-added companies. */
export type CompanyId = string;
export type AppId = "boxouts" | "simpleparts" | "plyworks" | "nesting";

export type Session = {
  email: string;
  name: string;
  company: CompanyId;
  role: RoleId;
  by: string;
  since: number;
};

/** WAITING DATABASE: immutable root superuser fixture for DataB. */
export const PROTECTED_SUPERUSER_EMAIL = "david.dabic@datab.example";

/**
 * WAITING DATABASE: company onboarding decides who is live.
 * DataB starts active; other fixture companies start suspended until an admin
 * activates them (which also activates their profiles for this tab session).
 */
export const ACTIVE_COMPANY_IDS: CompanyId[] = ["D"];

export const DIRECTORY = [
  // WAITING DATABASE: DataB root superuser — cannot be deleted/suspended/demoted in the fixture overlay.
  { email: PROTECTED_SUPERUSER_EMAIL, name: "David Dabic", role: "superuser" as const, by: "DataB" },
  { email: "alex.morgan@datab.example", name: "Alex Morgan", role: "admin" as const, by: "DataB" },
  { email: "morgan.lee@datab.example", name: "Morgan Lee", role: "manager" as const, by: "DataB" },
  { email: "taylor.kim@datab.example", name: "Taylor Kim", role: "operator" as const, by: "morgan.lee@datab.example" },
  { email: "jordan.patel@datab.example", name: "Jordan Patel", role: "user" as const, by: "morgan.lee@datab.example" },
  { email: "lena@frischeis.example", name: "Lena Frischeis", role: "admin" as const, by: "DataB", suspended: true },
  { email: "tobias@frischeis.example", name: "Tobias Reiter", role: "operator" as const, by: "lena@frischeis.example", suspended: true },
  { email: "marie@frischeis.example", name: "Marie Gruber", role: "operator" as const, by: "lena@frischeis.example", suspended: true },
  { email: "jonas@frischeis.example", name: "Jonas Weber", role: "user" as const, by: "lena@frischeis.example", suspended: true },
  { email: "klaus@strabag.example", name: "Klaus Berger", role: "admin" as const, by: "DataB", suspended: true },
  { email: "sandra@strabag.example", name: "Sandra Hofer", role: "operator" as const, by: "klaus@strabag.example", suspended: true },
  { email: "peter@strabag.example", name: "Peter Mayr", role: "user" as const, by: "klaus@strabag.example", suspended: true },
  { email: "iris@peri.example", name: "Iris de Vries", role: "admin" as const, by: "DataB", suspended: true },
  { email: "ruben@peri.example", name: "Ruben Bakker", role: "user" as const, by: "iris@peri.example", suspended: true },
];

bindDirectorySeed(DIRECTORY);

const USER_GRANTS = ["overview", "worklists.read", "orders.create"];
const OPERATOR_GRANTS = ["overview", "jobs.read", "jobs.update", "worklists.read", "worklists.write", "validation", "machines.read", "machines.control", "orbit"];
const MANAGER_GRANTS = ["overview", "jobs.read", "jobs.assign", "jobs.fulfill", "worklists.read", "machines.read", "orbit"];
const ADMIN_GRANTS = ["overview", "users", "apps.manage", "billing"];

export const ROLES: Record<RoleId, { label: string; blurb: string; grants: string[] }> = {
  user: {
    label: "User",
    blurb: "Reads company data, places orders. No machine access.",
    grants: USER_GRANTS,
  },
  operator: {
    label: "Operator",
    blurb: "Runs assigned production jobs.",
    grants: OPERATOR_GRANTS,
  },
  manager: {
    label: "Manager",
    blurb: "Assigns work and manages fulfillment.",
    grants: MANAGER_GRANTS,
  },
  admin: {
    label: "Admin",
    blurb: "Administration access.",
    grants: ADMIN_GRANTS,
  },
  superuser: {
    label: "Superuser",
    blurb: "DataB root access — all role powers; can promote other DataB superusers.",
    grants: [...new Set([...USER_GRANTS, ...OPERATOR_GRANTS, ...MANAGER_GRANTS, ...ADMIN_GRANTS])],
  },
};

export type Company = CompanyRecord;

export const COMPANIES: Record<string, CompanyRecord> = {
  D: { id: "D", name: "DataB", short: "DataB", domain: "datab.example", plan: "All tools", apps: ["boxouts", "simpleparts", "plyworks", "nesting"], machineSlugs: ["at-datab", "at-frischeis", "de-strabag", "nl-peri", "ch-peri"], seats: 99, suspended: false },
  A: { id: "A", name: "Frischeis Holzwerk", short: "Frischeis", domain: "frischeis.example", plan: "Full suite", apps: ["boxouts", "simpleparts", "plyworks", "nesting"], machineSlugs: ["at-frischeis", "at-datab"], seats: 42, suspended: true },
  B: { id: "B", name: "Strabag Formwork", short: "Strabag", domain: "strabag.example", plan: "Boxouts only", apps: ["boxouts", "nesting"], machineSlugs: ["de-strabag"], seats: 18, suspended: true },
  C: { id: "C", name: "Peri Systems", short: "Peri", domain: "peri.example", plan: "Parts & panels", apps: ["simpleparts", "plyworks"], machineSlugs: ["nl-peri", "ch-peri"], seats: 7, suspended: true },
};

bindCompanySeed(Object.values(COMPANIES));

/** @deprecated Prefer getCompany(id)?.domain — kept for call sites that still index by id. */
export const COMPANY_LOGIN_DOMAIN: Record<string, string> = {
  D: "datab.example",
  A: "frischeis.example",
  B: "strabag.example",
  C: "peri.example",
};

export const APP_LABELS: Record<AppId, string> = {
  boxouts: "Boxouts",
  simpleparts: "Simple Parts",
  plyworks: "Plyworks",
  nesting: "Nesting",
};

export { getCompany, listCompanies };

/** Domain → company without the suspended gate. */
export function companyIdFromEmail(email: string): CompanyId | null {
  const domain = String(email || "").trim().toLowerCase().split("@")[1];
  return domain ? companyIdFromDomain(domain) : null;
}

/** Companies that are not suspended (DataB first via listCompanies order). */
export function activeCompanyIds(): CompanyId[] {
  return listCompanies().filter((c) => !c.suspended).map((c) => c.id);
}

export function companyIsActive(id: CompanyId | null | undefined): id is CompanyId {
  const company = getCompany(id);
  return Boolean(company && !company.suspended);
}

export function companyOf(email: string) {
  const id = companyIdFromEmail(email);
  return companyIsActive(id) ? id : null;
}

export function findUser(email: string): DirectoryUser | null {
  return findLiveUser(email);
}

export { listUsers };

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    const user = findUser(s.email);
    const company = companyOf(s.email);
    if (!user || !company || user.suspended) return null;
    const session: Session = {
      email: user.email,
      name: user.name,
      company,
      role: user.role,
      by: user.by,
      since: typeof s.since === "number" ? s.since : Date.now(),
    };
    if (session.role !== s.role || session.name !== s.name || session.company !== s.company) {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
    }
    return session;
  } catch {
    return null;
  }
}

export function signIn(email: string, password: string) {
  const addr = String(email || "").trim().toLowerCase();
  if (!addr) return { error: "Enter your work email address." };
  if (!addr.includes("@")) return { error: "That does not look like an email address." };
  if (!password) return { error: "Enter your password." };
  const company = companyOf(addr);
  if (!company) {
    const id = companyIdFromEmail(addr);
    if (id && getCompany(id)?.suspended) {
      return { error: "That company is suspended. Ask your administrator to activate it." };
    }
    return { error: "That domain is not registered with DataB. Ask your administrator to onboard it." };
  }
  const user = findUser(addr);
  const companyName = getCompany(company)?.name ?? "your company";
  if (!user) return { error: `No account for this address at ${companyName}. Ask your company operator for an invite.` };
  if (user.suspended) return { error: "This profile is suspended. Ask your administrator to activate it." };
  const session: Session = { email: user.email, name: user.name, company, role: user.role, by: user.by, since: Date.now() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  return { session };
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** WAITING DATABASE: role claim — replace with authz from the profile API. */
export function isSuperuser(session: Session | null) {
  return Boolean(session && session.role === "superuser");
}

/** WAITING DATABASE: immutable root superuser email — protect in the profiles API. */
export function isProtectedSuperuser(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase() === PROTECTED_SUPERUSER_EMAIL;
}

/** WAITING DATABASE: admin-console gate — company admin or DataB superuser. */
export function isAdminLike(session: Session | null) {
  return Boolean(session && (session.role === "admin" || session.role === "superuser"));
}

/** WAITING DATABASE: design-chat gate — user or superuser until the profile API owns grants. */
export function isDesignChatRole(session: Session | null) {
  return Boolean(session && (session.role === "user" || session.role === "superuser"));
}

export function can(session: Session | null, permission: string) {
  if (!session) return false;
  // WAITING DATABASE: superuser grant-all — replace with server-side authz.
  if (session.role === "superuser") return true;
  return ROLES[session.role].grants.includes(permission);
}

/** WAITING DATABASE: platform scope — DataB admins and superusers. */
export function isPlatformAdmin(session: Session | null) {
  return Boolean(
    session
    && session.company === "D"
    && (session.role === "admin" || session.role === "superuser"),
  );
}

export function hasApp(session: Session | null, app: AppId) {
  return !!session && (getCompany(session.company)?.apps.includes(app) ?? false);
}

export function machinesFor<T extends { slug: string }>(session: Session | null, all: T[]) {
  const co = session && getCompany(session.company);
  if (!co) return [];
  return all.filter((m) => co.machineSlugs.some((p) => m.slug.startsWith(p)));
}
