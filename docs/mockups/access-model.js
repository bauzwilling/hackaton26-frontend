/* Access model for the File → Factory mockup.
 * Single source of truth for companies, roles and permissions.
 * Consumed by the dashboard login gate; safe to extend as rules firm up.
 * Session is persisted in localStorage under SESSION_KEY.
 */

export const SESSION_KEY = 'f2f.session';
export const OVERRIDE_KEY = 'f2f.roleOverrides';

/* Neither company nor role is chosen at sign-in.
 * Company comes from the email domain; role comes from provisioning:
 * DataB grants admin, and a company admin grants member / operator. */
export const DOMAINS = {
  'frischeis.example': 'A',
  'strabag.example': 'B',
  'peri.example': 'C'
};

export const DIRECTORY = [
  { email: 'lena@frischeis.example',   name: 'Lena Frischeis', role: 'admin',    by: 'DataB' },
  { email: 'tobias@frischeis.example', name: 'Tobias Reiter',  role: 'operator', by: 'lena@frischeis.example' },
  { email: 'marie@frischeis.example',  name: 'Marie Gruber',   role: 'operator', by: 'lena@frischeis.example' },
  { email: 'jonas@frischeis.example',  name: 'Jonas Weber',    role: 'member',   by: 'lena@frischeis.example' },
  { email: 'klaus@strabag.example',    name: 'Klaus Berger',   role: 'admin',    by: 'DataB' },
  { email: 'sandra@strabag.example',   name: 'Sandra Hofer',   role: 'operator', by: 'klaus@strabag.example' },
  { email: 'peter@strabag.example',    name: 'Peter Mayr',     role: 'member',   by: 'klaus@strabag.example' },
  { email: 'iris@peri.example',        name: 'Iris de Vries',  role: 'admin',    by: 'DataB' },
  { email: 'ruben@peri.example',       name: 'Ruben Bakker',   role: 'member',   by: 'iris@peri.example' }
];

/* Only DataB may grant admin; admins may grant these. */
export const ADMIN_ASSIGNABLE = ['member', 'operator'];

export function companyOf(email){
  const domain = String(email || '').trim().toLowerCase().split('@')[1];
  return domain ? (DOMAINS[domain] || null) : null;
}

export function findUser(email){
  const key = String(email || '').trim().toLowerCase();
  return DIRECTORY.find(u => u.email === key) || null;
}

export function loadOverrides(){
  try { const o = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch (e) { return {}; }
}

/* Admin grants are never overridable — DataB owns them. */
export function effectiveRole(user, overrides){
  if (!user) return null;
  const o = overrides || loadOverrides();
  return (user.role !== 'admin' && o[user.email]) ? o[user.email] : user.role;
}

export function assignRole(email, role, overrides){
  const user = findUser(email);
  if (!user || user.role === 'admin') return overrides || loadOverrides();
  if (ADMIN_ASSIGNABLE.indexOf(role) === -1) return overrides || loadOverrides();
  const next = Object.assign({}, overrides || loadOverrides(), { [email]: role });
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

/* Roles, weakest first. `grants` are permission keys. */
export const ROLES = {
  member: {
    label: 'Member',
    blurb: 'Reads company data, places orders. No machine access.',
    grants: ['overview', 'worklists.read', 'orders.create']
  },
  operator: {
    label: 'Operator',
    blurb: 'Runs the floor: validates files, drives machines.',
    grants: ['overview', 'worklists.read', 'worklists.write', 'orders.create', 'validation', 'machines.read', 'machines.control']
  },
  admin: {
    label: 'Admin',
    blurb: 'Everything an operator can do, plus users, apps and billing.',
    grants: ['overview', 'worklists.read', 'worklists.write', 'orders.create', 'validation', 'machines.read', 'machines.control', 'users', 'apps.manage', 'billing']
  }
};

/* Companies. `apps` gates which product tiles/links are reachable.
 * `machineSlugs` matches the slug prefix of machines the company owns. */
export const COMPANIES = {
  A: {
    id: 'A',
    name: 'Frischeis Holzwerk',
    short: 'Company A',
    domain: 'frischeis.example',
    plan: 'Full suite',
    apps: ['boxouts', 'simpleparts', 'plyworks', 'nesting'],
    machineSlugs: ['at-frischeis', 'at-datab'],
    seats: 42
  },
  B: {
    id: 'B',
    name: 'Strabag Formwork',
    short: 'Company B',
    domain: 'strabag.example',
    plan: 'Boxouts only',
    apps: ['boxouts', 'nesting'],
    machineSlugs: ['de-strabag'],
    seats: 18
  },
  C: {
    id: 'C',
    name: 'Peri Systems',
    short: 'Company C',
    domain: 'peri.example',
    plan: 'Parts & panels',
    apps: ['simpleparts', 'plyworks'],
    machineSlugs: ['nl-peri', 'ch-peri'],
    seats: 7
  }
};

export const APP_LABELS = {
  boxouts: 'Boxouts',
  simpleparts: 'Simple Parts',
  plyworks: 'Plyworks',
  nesting: 'Nesting'
};

export function can(session, permission){
  if (!session) return false;
  const role = ROLES[session.role];
  return !!role && role.grants.indexOf(permission) !== -1;
}

export function hasApp(session, app){
  if (!session) return false;
  const co = COMPANIES[session.company];
  return !!co && co.apps.indexOf(app) !== -1;
}

export function machinesFor(session, all){
  const co = session && COMPANIES[session.company];
  if (!co) return [];
  return all.filter(m => co.machineSlugs.some(p => (m.slug || '').indexOf(p) === 0));
}

export function loadSession(){
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && ROLES[s.role] && COMPANIES[s.company] && findUser(s.email)) ? s : null;
  } catch (e) { return null; }
}

/* Sign-in resolves company and role rather than accepting them. */
export function signIn(email, password){
  const addr = String(email || '').trim().toLowerCase();
  if (!addr) return { error: 'Enter your work email address.' };
  if (addr.indexOf('@') === -1) return { error: 'That does not look like an email address.' };
  if (!password) return { error: 'Enter your password.' };
  const company = companyOf(addr);
  if (!company) return { error: 'That domain is not registered with DataB. Ask your administrator to onboard it.' };
  const user = findUser(addr);
  if (!user) return { error: 'No account for this address at ' + COMPANIES[company].name + '. Ask your company admin for an invite.' };
  const session = { email: user.email, name: user.name, company, role: effectiveRole(user), by: user.by, since: Date.now() };
  saveSession(session);
  return { session };
}

export function saveSession(session){
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
}

export function clearSession(){
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}
