/* WAITING DATABASE: user directory CRUD — session overlay until the profile API owns users/roles. */
import type { RoleId } from "./auth";

export const DIRECTORY_KEY = "f2f.adminDirectory.v1";

export type DirectoryUser = {
  email: string;
  name: string;
  role: RoleId;
  by: string;
  suspended?: boolean;
};

export type DirectoryOverlay = {
  added: DirectoryUser[];
  removed: string[];
  patches: Record<string, Partial<Pick<DirectoryUser, "name" | "role" | "suspended" | "by">>>;
};

const EMPTY: DirectoryOverlay = { added: [], removed: [], patches: {} };

const listeners = new Set<() => void>();

let seed: DirectoryUser[] = [];
let cachedSnapshot: DirectoryUser[] | null = null;

/** Bind immutable fixture users once auth finishes loading. */
export function bindDirectorySeed(users: DirectoryUser[]) {
  seed = users.map((u) => ({ ...u }));
  cachedSnapshot = null;
}

export function readDirectoryOverlay(): DirectoryOverlay {
  try {
    const raw = sessionStorage.getItem(DIRECTORY_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<DirectoryOverlay>;
    return {
      added: Array.isArray(parsed.added) ? parsed.added.filter(isUser) : [],
      removed: Array.isArray(parsed.removed)
        ? parsed.removed.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase())
        : [],
      patches: parsed.patches && typeof parsed.patches === "object" ? parsed.patches : {},
    };
  } catch {
    return EMPTY;
  }
}

function isUser(value: unknown): value is DirectoryUser {
  if (!value || typeof value !== "object") return false;
  const u = value as Partial<DirectoryUser>;
  return typeof u.email === "string"
    && typeof u.name === "string"
    && typeof u.role === "string"
    && typeof u.by === "string";
}

function writeOverlay(next: DirectoryOverlay) {
  try {
    sessionStorage.setItem(DIRECTORY_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

/** Live directory for this browser tab session (fixtures ⊕ overlay). */
export function listUsers(): DirectoryUser[] {
  return getDirectorySnapshot();
}

export function getDirectorySnapshot(): DirectoryUser[] {
  if (cachedSnapshot) return cachedSnapshot;
  const overlay = readDirectoryOverlay();
  const removed = new Set(overlay.removed);
  const byEmail = new Map<string, DirectoryUser>();

  for (const user of seed) {
    if (removed.has(user.email)) continue;
    const patch = overlay.patches[user.email];
    byEmail.set(user.email, patch ? { ...user, ...patch, email: user.email } : { ...user });
  }
  for (const user of overlay.added) {
    if (removed.has(user.email)) continue;
    const patch = overlay.patches[user.email];
    byEmail.set(user.email, patch ? { ...user, ...patch, email: user.email } : { ...user });
  }
  cachedSnapshot = [...byEmail.values()]
    .map((u) => ({ ...u, suspended: Boolean(u.suspended) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedSnapshot;
}

export function subscribeDirectory(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function findLiveUser(email: string): DirectoryUser | null {
  const key = String(email || "").trim().toLowerCase();
  return listUsers().find((u) => u.email === key) ?? null;
}

function adminCount(users: DirectoryUser[] = listUsers()) {
  return users.filter((u) => u.role === "admin" && !u.suspended).length;
}

export function addUser(input: {
  email: string;
  name: string;
  role: RoleId;
  by: string;
}): DirectoryUser {
  const email = String(input.email || "").trim().toLowerCase();
  const name = String(input.name || "").trim();
  if (!email.includes("@")) throw new Error("Enter a valid work email address.");
  if (!name) throw new Error("Enter a display name.");
  if (findLiveUser(email)) throw new Error("A profile with that email already exists.");

  const user: DirectoryUser = {
    email,
    name,
    role: input.role,
    by: input.by,
    suspended: true,
  };
  const overlay = readDirectoryOverlay();
  const removed = overlay.removed.filter((e) => e !== email);
  const added = [...overlay.added.filter((u) => u.email !== email), user];
  const patches = { ...overlay.patches };
  delete patches[email];
  writeOverlay({ added, removed, patches });
  return user;
}

export function updateUser(
  email: string,
  patch: Partial<Pick<DirectoryUser, "name" | "role" | "suspended">>,
  actorEmail?: string,
) {
  const key = String(email || "").trim().toLowerCase();
  const current = findLiveUser(key);
  if (!current) throw new Error("That profile was not found.");

  if (actorEmail && key === actorEmail.toLowerCase()) {
    if (patch.suspended === true) throw new Error("You cannot suspend your own profile.");
    if (patch.role && patch.role !== "admin") throw new Error("You cannot remove your own admin role.");
  }

  const nextRole = patch.role ?? current.role;
  const nextSuspended = patch.suspended ?? current.suspended ?? false;
  if (current.role === "admin" && !current.suspended && (nextRole !== "admin" || nextSuspended)) {
    if (adminCount() <= 1) throw new Error("Keep at least one active admin.");
  }

  const overlay = readDirectoryOverlay();
  const inSeed = seed.some((u) => u.email === key);
  const inAdded = overlay.added.some((u) => u.email === key);

  if (inAdded) {
    writeOverlay({
      ...overlay,
      added: overlay.added.map((u) => (u.email === key ? { ...u, ...patch, email: key } : u)),
    });
    return findLiveUser(key)!;
  }

  if (inSeed) {
    writeOverlay({
      ...overlay,
      patches: {
        ...overlay.patches,
        [key]: { ...overlay.patches[key], ...patch },
      },
    });
    return findLiveUser(key)!;
  }

  throw new Error("That profile was not found.");
}

export function removeUser(email: string, actorEmail?: string) {
  const key = String(email || "").trim().toLowerCase();
  const current = findLiveUser(key);
  if (!current) throw new Error("That profile was not found.");
  if (actorEmail && key === actorEmail.toLowerCase()) {
    throw new Error("You cannot remove your own profile.");
  }
  if (current.role === "admin" && !current.suspended && adminCount() <= 1) {
    throw new Error("Keep at least one active admin.");
  }

  const overlay = readDirectoryOverlay();
  const added = overlay.added.filter((u) => u.email !== key);
  const patches = { ...overlay.patches };
  delete patches[key];
  const removed = overlay.removed.includes(key) ? overlay.removed : [...overlay.removed, key];
  writeOverlay({ added, removed, patches });
}

/** Bulk suspend/activate every profile whose email is on this domain. */
export function setUsersSuspendedForDomain(domain: string, suspended: boolean) {
  const key = String(domain || "").trim().toLowerCase();
  if (!key) return;
  const overlay = readDirectoryOverlay();
  let added = overlay.added.map((u) => (
    u.email.endsWith(`@${key}`) ? { ...u, suspended } : u
  ));
  const patches = { ...overlay.patches };
  for (const user of seed) {
    if (!user.email.endsWith(`@${key}`)) continue;
    if (added.some((u) => u.email === user.email)) continue;
    patches[user.email] = { ...patches[user.email], suspended };
  }
  writeOverlay({ ...overlay, added, patches });
}
