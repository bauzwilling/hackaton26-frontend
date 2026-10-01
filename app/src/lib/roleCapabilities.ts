import {
  APP_LABELS,
  COMPANIES,
  ROLES,
  hasApp,
  type AppId,
  type Session,
} from "./auth";

/**
 * Plain-English dashboard powers for Concierge help.
 * WAITING MODEL: the structuring model will own role-scoped help answers;
 * this list is the stand-in context injected into the bridge prompt today.
 * WAITING DATABASE: admin company/machine management UI is not built yet —
 * bullets below describe intended admin powers.
 */
export function capabilitiesFor(session: Session | null): string[] {
  if (!session) return [];

  if (session.role === "admin") {
    return [
      "Add, modify, remove, or suspend companies",
      "Add, modify, remove, or suspend profiles under companies",
      "Add, modify, remove, enable, or disable machines",
    ];
  }

  const bullets: string[] = [];
  const grants = new Set(ROLES[session.role].grants);

  bullets.push("Ask the Concierge in words or drop a design file to start work");

  if (grants.has("orders.create")) {
    bullets.push("Place manufacturing orders from a configured design");
  }
  if (grants.has("jobs.read") || grants.has("jobs.update") || grants.has("jobs.assign") || grants.has("jobs.fulfill")) {
    bullets.push("Open Jobs to see production work for your company");
  }
  if (grants.has("jobs.assign")) {
    bullets.push("Assign jobs to operators");
  }
  if (grants.has("jobs.update")) {
    bullets.push("Update progress on jobs assigned to you");
  }
  if (grants.has("jobs.fulfill")) {
    bullets.push("Manage fulfillment for completed jobs");
  }
  if (grants.has("orbit")) {
    bullets.push("Open Orbit for the shop-floor machine and worklist dashboard");
  }
  if (grants.has("machines.read") || grants.has("machines.control")) {
    bullets.push("View company machines" + (grants.has("machines.control") ? " and control assigned equipment" : ""));
  }
  if (grants.has("worklists.read") || grants.has("worklists.write")) {
    bullets.push("Read worklists" + (grants.has("worklists.write") ? " and update them" : ""));
  }
  if (grants.has("validation")) {
    bullets.push("Run production validation checks");
  }

  const apps = (COMPANIES[session.company]?.apps ?? []) as AppId[];
  for (const app of apps) {
    if (!hasApp(session, app)) continue;
    if (app === "nesting") continue;
    const label = APP_LABELS[app];
    if (app === "boxouts") bullets.push(`Use ${label} for dimensioned door box-outs`);
    else if (app === "simpleparts") bullets.push(`Use ${label} for DXF laser/milled parts`);
    else if (app === "plyworks") bullets.push(`Use ${label} to configure plywood furniture`);
  }

  bullets.push("Change theme, accent, and canvas options in Settings");
  return bullets;
}

export function capabilitiesReply(session: Session | null): string {
  const role = session ? ROLES[session.role].label : "visitor";
  const lines = capabilitiesFor(session);
  if (!lines.length) {
    return `Signed in as ${role}. Ask Concierge to open an app or drop a file to get started.`;
  }
  return `As a ${role} on this dashboard, you can:\n• ${lines.join("\n• ")}`;
}

export function isCapabilitiesAsk(query: string) {
  const lower = query.trim().toLowerCase();
  return /^(what can i do( here)?|what am i able to do|my (capabilities|permissions)|what can this (role|account) do)[!?.]?$/i.test(lower)
    || lower === "what can i do here?";
}
