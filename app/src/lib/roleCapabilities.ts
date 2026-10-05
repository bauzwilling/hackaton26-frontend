import {
  APP_LABELS,
  ROLES,
  getCompany,
  hasApp,
  type AppId,
  type Session,
} from "./auth";

/**
 * Plain-English dashboard powers for Concierge help.
 * WAITING MODEL: the structuring model will own role-scoped help answers;
 * this list is the stand-in context injected into the bridge prompt today.
 * WAITING DATABASE: company onboarding UI is not built yet — profiles and
 * machines are session-scoped admin overlays until the real APIs own them.
 */
export function capabilitiesFor(session: Session | null): string[] {
  if (!session) return [];

  if (session.role === "superuser") {
    return [
      "Ask Concierge in words or drop a design file — chat can open any available window",
      "Open design apps, Jobs, Orbit, Profile Manager, and Machine Inventory",
      "In Profile Manager: promote other DataB profiles to superuser; David Dabic's root profile cannot be deleted, suspended, or demoted",
      "In Jobs: company-wide assign/fulfill and operator progress when a machine is selected",
      "Concierge cannot apply most mutations in chat yet; use the open window to view or edit",
      "Session changes appear on the login screen and in Orbit/Jobs until this browser tab ends",
      "Change theme, accent, and canvas options in Settings",
    ];
  }

  if (session.role === "admin") {
    if (session.company === "D") {
      return [
        "Ask Concierge to open Profile Manager or Machine Inventory — it opens and focuses those windows",
        "Concierge cannot read live profile or fleet data in chat yet, and cannot apply admin changes; use the open window to view or edit",
        "In Profile Manager: add, modify, remove, or suspend profiles across companies; assign roles",
        "In Machine Inventory: manage fleet machines across companies",
        "Session changes appear on the login screen and in Orbit/Jobs until this browser tab ends",
      ];
    }
    const company = getCompany(session.company)?.name ?? "your company";
    return [
      "Ask Concierge to open Profile Manager or Machine Inventory — it opens and focuses those windows",
      "Concierge cannot read live profile or fleet data in chat yet, and cannot apply admin changes; use the open window to view or edit",
      `In Profile Manager: add, modify, remove, or suspend profiles at ${company}`,
      `In Machine Inventory: add, remove, enable, or disable machines for ${company}`,
      "Session changes appear on the login screen and in Orbit/Jobs until this browser tab ends",
    ];
  }

  const bullets: string[] = [];
  const grants = new Set(ROLES[session.role].grants);

  if (session.role === "user") {
    bullets.push("Ask the Concierge in words or drop a design file to start work");
    if (grants.has("orders.create")) {
      bullets.push("Place manufacturing orders from a configured design");
    }
    const apps = (getCompany(session.company)?.apps ?? []) as AppId[];
    for (const app of apps) {
      if (!hasApp(session, app)) continue;
      if (app === "nesting") continue;
      const label = APP_LABELS[app];
      if (app === "boxouts") bullets.push(`Use ${label} for dimensioned door box-outs`);
      else if (app === "simpleparts") bullets.push(`Use ${label} for DXF laser/milled parts`);
      else if (app === "plyworks") bullets.push(`Use ${label} to configure plywood furniture`);
    }
    bullets.push("Open Projects for order history and past quotes");
  } else {
    // operator / manager — Jobs + Orbit only
    bullets.push("Ask Concierge about jobs or the shop floor — it opens and focuses Jobs or Orbit");
    bullets.push("Concierge cannot read live job or machine values in chat yet, and cannot assign or update jobs; use the open window");
    if (grants.has("jobs.read") || grants.has("jobs.update") || grants.has("jobs.assign") || grants.has("jobs.fulfill")) {
      bullets.push("In Jobs: see production work for your company");
    }
    if (grants.has("jobs.assign")) {
      bullets.push("In Jobs: assign work to operators");
    }
    if (grants.has("jobs.update")) {
      bullets.push("In Jobs: update progress on jobs assigned to you");
    }
    if (grants.has("jobs.fulfill")) {
      bullets.push("In Jobs: manage fulfillment for completed jobs");
    }
    if (grants.has("orbit")) {
      bullets.push("In Orbit: shop-floor machine and worklist dashboard");
    }
  }

  bullets.push("Change theme, accent, and canvas options in Settings");
  return bullets;
}

export function capabilitiesReply(session: Session | null): string {
  const role = session ? ROLES[session.role].label : "visitor";
  const lines = capabilitiesFor(session);
  if (!lines.length) {
    return session?.role === "user"
      ? `Signed in as ${role}. Ask Concierge to open an app or drop a file to get started.`
      : `Signed in as ${role}. Ask Concierge to open an app to get started.`;
  }
  return `As a ${role} on this dashboard, you can:\n• ${lines.join("\n• ")}`;
}

export function isCapabilitiesAsk(query: string) {
  const lower = query.trim().toLowerCase();
  return /^(what can i do( here)?|what am i able to do|my (capabilities|permissions)|what can this (role|account) do)[!?.]?$/i.test(lower)
    || lower === "what can i do here?";
}
