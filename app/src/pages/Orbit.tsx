import { useMemo, useState, useSyncExternalStore } from "react";
import { Segment } from "../components/kit";
import { useSession } from "../context/session";
import { APP_LABELS, can, getCompany, machinesFor } from "../lib/auth";
import { getMachinesSnapshot, subscribeMachines } from "../lib/machineStore";

const TABS = [
  { id: "overview", label: "Overview", perm: "overview" },
  { id: "worklists", label: "Worklists", perm: "worklists.read" },
  { id: "validation", label: "Validation", perm: "validation" },
  { id: "machines", label: "Machines", perm: "machines.read" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function OrbitPage() {
  const { session } = useSession();
  const allowed = TABS.filter((t) => can(session, t.perm));
  const [tab, setTab] = useState<TabId>(allowed[0]?.id ?? "overview");
  // WAITING DATABASE: fleet catalog — session machine overlay until the machine registry API owns it.
  const allMachines = useSyncExternalStore(subscribeMachines, getMachinesSnapshot, getMachinesSnapshot);
  const machines = useMemo(
    () => machinesFor(session, allMachines.filter((m) => m.enabled !== false)),
    [session, allMachines],
  );
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const online = machines.filter((m) => m.online).length;
  const offline = machines.length - online;
  const company = session ? getCompany(session.company) : null;
  const selected = machines.find((m) => m.slug === selectedSlug) ?? null;

  return (
    <section className="orbit-page jobs-page" data-help="orbit-page">
      <header className="jobs-head">
        <div>
          <p className="jobs-kicker">Operations</p>
          <h1>CNC Orbit</h1>
          <p className="orbit-lead">
            {company
              ? `${company.name} · ${company.plan}. Fleet scoped to this company session.`
              : "Monitor and manage your manufacturing fleet."}
          </p>
        </div>
        <div className="orbit-head-meta">
          {session && <span className="orbit-pill">{session.name}</span>}
          {company && <span className="orbit-pill is-muted">{company.short}</span>}
        </div>
      </header>

      {allowed.length > 1 && (
        <div className="orbit-tabs">
          <Segment
            value={tab}
            options={allowed.map((t) => ({ id: t.id, label: t.label }))}
            onChange={(id) => setTab(id as TabId)}
          />
        </div>
      )}

      {tab === "overview" && (
        <div className="orbit-stack">
          <div className="orbit-stats">
            <article className="orbit-stat">
              <span className="orbit-stat-label">Machines</span>
              <strong className="orbit-stat-value">{machines.length}</strong>
              <span className="orbit-stat-note">Enabled in this company</span>
            </article>
            <article className="orbit-stat">
              <span className="orbit-stat-label">Online</span>
              <strong className="orbit-stat-value">{online}</strong>
              <span className="orbit-stat-note">Reporting telemetry</span>
            </article>
            <article className="orbit-stat">
              <span className="orbit-stat-label">Offline</span>
              <strong className="orbit-stat-value">{offline}</strong>
              <span className="orbit-stat-note">No live bridge data</span>
            </article>
            <article className="orbit-stat">
              <span className="orbit-stat-label">Plan apps</span>
              <strong className="orbit-stat-value">{company?.apps.length ?? 0}</strong>
              <span className="orbit-stat-note">
                {company ? company.apps.map((a) => APP_LABELS[a]).join(", ") : "—"}
              </span>
            </article>
          </div>

          {company && (
            <div className="orbit-panel">
              <div className="orbit-panel-head">
                <h2>Company scope</h2>
              </div>
              <div className="orbit-scope">
                <div>
                  <span className="orbit-stat-label">Plan</span>
                  <strong>{company.plan}</strong>
                </div>
                <div>
                  <span className="orbit-stat-label">Apps</span>
                  <strong>{company.apps.map((a) => APP_LABELS[a]).join(", ") || "—"}</strong>
                </div>
                <div>
                  <span className="orbit-stat-label">Machine prefixes</span>
                  <strong>{company.machineSlugs.join(", ") || "—"}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="orbit-panel">
            <div className="orbit-panel-head">
              <h2>Fleet pulse</h2>
              <span className="orbit-stat-note">{online}/{machines.length} connected</span>
            </div>
            {!machines.length ? (
              <p className="orbit-empty">No machines are enabled for this company.</p>
            ) : (
              <ul className="orbit-fleet">
                {machines.map((m) => (
                  <li key={m.slug} className={`orbit-fleet-row${m.online ? " is-online" : ""}`}>
                    <span className="orbit-dot" aria-hidden />
                    <div className="orbit-fleet-main">
                      <strong>{m.name}</strong>
                      <small>{m.location}</small>
                    </div>
                    <div className="orbit-fleet-side">
                      <span className={`orbit-badge${m.online ? " is-ok" : ""}`}>
                        {m.online ? "Online" : "Offline"}
                      </span>
                      <small>{m.owner}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "worklists" && (
        <div className="orbit-stack">
          <div className="orbit-panel">
            <div className="orbit-panel-head">
              <h2>Select machine</h2>
              <span className="orbit-stat-note">
                {/* WAITING BFF: production worklists come from GET /api/production/jobs once wired. */}
                Worklist queue arrives with the production BFF
              </span>
            </div>
            {!machines.length ? (
              <p className="orbit-empty">No machines in this company fleet.</p>
            ) : (
              <div className="orbit-machine-grid">
                {machines.map((m) => (
                  <button
                    key={m.slug}
                    type="button"
                    className={`orbit-machine-card${m.online ? " is-online" : ""}${selectedSlug === m.slug ? " is-selected" : ""}`}
                    onClick={() => setSelectedSlug(m.slug)}
                  >
                    <span className="orbit-dot" aria-hidden />
                    <strong>{m.name}</strong>
                    <small>{m.slug}</small>
                    <small>{m.location}</small>
                    <span className={`orbit-badge${m.online ? " is-ok" : ""}`}>
                      {m.online ? "Online" : "No data"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="orbit-panel" style={{ marginTop: 14 }}>
                <div className="orbit-panel-head">
                  <h2>{selected.name}</h2>
                  <span className={`orbit-badge${selected.online ? " is-ok" : ""}`}>
                    {selected.online ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="orbit-empty">
                  No worklist steps yet for {selected.slug}. Production queues will show here when the BFF is connected.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "validation" && (
        <div className="orbit-stack">
          <div className="orbit-panel">
            <div className="orbit-panel-head">
              <h2>Shop validation</h2>
            </div>
            <p className="orbit-lead">
              ZIP files with DXF drawings only. This local build checks the drop surface, not the geometry.
            </p>
            {/* WAITING BFF: ZIP / DXF validation uploads go through the Platform file inspector, not the UI. */}
            <div className="orbit-drop" aria-disabled="true">
              <strong>Drop a ZIP to estimate milling time</strong>
              <span>Local demo — file intake is not connected for Orbit yet.</span>
            </div>
          </div>
        </div>
      )}

      {tab === "machines" && (
        <div className="orbit-machine-grid">
          {!machines.length ? (
            <p className="orbit-empty">No machines are enabled for this company.</p>
          ) : machines.map((m) => (
            <article key={m.slug} className={`orbit-machine-card is-static${m.online ? " is-online" : ""}`}>
              <div className="orbit-machine-card-top">
                <span className="orbit-dot" aria-hidden />
                <span className={`orbit-badge${m.online ? " is-ok" : ""}`}>
                  {m.online ? "Connected" : "No data"}
                </span>
              </div>
              <strong>{m.name}</strong>
              <small>{m.owner}</small>
              <small>{m.location}</small>
              <small className="orbit-mono">{m.slug}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
