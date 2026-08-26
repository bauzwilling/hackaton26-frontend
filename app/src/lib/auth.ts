/* Dummy companies and users — stand-ins until a real database exists.
 * Sign-in does not look up a server. Company is inferred from the email
 * domain; role is taken from this directory. Swap DIRECTORY / COMPANIES
 * for API results later without changing the session shape. */
export const SESSION_KEY = "f2f.session";
export const OVERRIDE_KEY = "f2f.roleOverrides";

export type RoleId = "member" | "operator" | "admin";
export type CompanyId = "A" | "B" | "C";
export type AppId = "boxouts" | "simpleparts" | "plyworks" | "nesting";

export type Session = {
  email: string;
  name: string;
  company: CompanyId;
  role: RoleId;
  by: string;
  since: number;
};

export const DOMAINS: Record<string, CompanyId> = {
  "frischeis.example": "A",
  "strabag.example": "B",
  "peri.example": "C",
};

export const DIRECTORY = [
  { email: "lena@frischeis.example", name: "Lena Frischeis", role: "admin" as const, by: "DataB" },
  { email: "tobias@frischeis.example", name: "Tobias Reiter", role: "operator" as const, by: "lena@frischeis.example" },
  { email: "marie@frischeis.example", name: "Marie Gruber", role: "operator" as const, by: "lena@frischeis.example" },
  { email: "jonas@frischeis.example", name: "Jonas Weber", role: "member" as const, by: "lena@frischeis.example" },
  { email: "klaus@strabag.example", name: "Klaus Berger", role: "admin" as const, by: "DataB" },
  { email: "sandra@strabag.example", name: "Sandra Hofer", role: "operator" as const, by: "klaus@strabag.example" },
  { email: "peter@strabag.example", name: "Peter Mayr", role: "member" as const, by: "klaus@strabag.example" },
  { email: "iris@peri.example", name: "Iris de Vries", role: "admin" as const, by: "DataB" },
  { email: "ruben@peri.example", name: "Ruben Bakker", role: "member" as const, by: "iris@peri.example" },
];

export const ROLES: Record<RoleId, { label: string; blurb: string; grants: string[] }> = {
  member: {
    label: "Member",
    blurb: "Reads company data, places orders. No machine access.",
    grants: ["overview", "worklists.read", "orders.create"],
  },
  operator: {
    label: "Operator",
    blurb: "Runs the floor: validates files, drives machines.",
    grants: ["overview", "worklists.read", "worklists.write", "orders.create", "validation", "machines.read", "machines.control"],
  },
  admin: {
    label: "Admin",
    blurb: "Everything an operator can do, plus users, apps and billing.",
    grants: ["overview", "worklists.read", "worklists.write", "orders.create", "validation", "machines.read", "machines.control", "users", "apps.manage", "billing"],
  },
};

export const COMPANIES: Record<CompanyId, {
  id: CompanyId; name: string; short: string; domain: string; plan: string;
  apps: AppId[]; machineSlugs: string[]; seats: number;
}> = {
  A: { id: "A", name: "Frischeis Holzwerk", short: "Company A", domain: "frischeis.example", plan: "Full suite", apps: ["boxouts", "simpleparts", "plyworks", "nesting"], machineSlugs: ["at-frischeis", "at-datab"], seats: 42 },
  B: { id: "B", name: "Strabag Formwork", short: "Company B", domain: "strabag.example", plan: "Boxouts only", apps: ["boxouts", "nesting"], machineSlugs: ["de-strabag"], seats: 18 },
  C: { id: "C", name: "Peri Systems", short: "Company C", domain: "peri.example", plan: "Parts & panels", apps: ["simpleparts", "plyworks"], machineSlugs: ["nl-peri", "ch-peri"], seats: 7 },
};

export const APP_LABELS: Record<AppId, string> = {
  boxouts: "Boxouts",
  simpleparts: "Simple Parts",
  plyworks: "Plyworks",
  nesting: "Nesting",
};

export function companyOf(email: string) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1];
  return domain ? DOMAINS[domain] ?? null : null;
}

export function findUser(email: string) {
  const key = String(email || "").trim().toLowerCase();
  return DIRECTORY.find((u) => u.email === key) ?? null;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return ROLES[s.role] && COMPANIES[s.company] && findUser(s.email) ? s : null;
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
  if (!company) return { error: "That domain is not registered with DataB. Ask your administrator to onboard it." };
  const user = findUser(addr);
  if (!user) return { error: `No account for this address at ${COMPANIES[company].name}. Ask your company admin for an invite.` };
  const session: Session = { email: user.email, name: user.name, company, role: user.role, by: user.by, since: Date.now() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  return { session };
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function can(session: Session | null, permission: string) {
  return !!session && ROLES[session.role].grants.includes(permission);
}

export function hasApp(session: Session | null, app: AppId) {
  return !!session && COMPANIES[session.company].apps.includes(app);
}

export function machinesFor<T extends { slug: string }>(session: Session | null, all: T[]) {
  const co = session && COMPANIES[session.company];
  if (!co) return [];
  return all.filter((m) => co.machineSlugs.some((p) => m.slug.startsWith(p)));
}
