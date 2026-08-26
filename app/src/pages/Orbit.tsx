import { useMemo, useState } from "react";
import { Fact, Segment, Surface } from "../components/kit";
import { useSession } from "../context/session";
import { APP_LABELS, COMPANIES, can, machinesFor } from "../lib/auth";
import { MACHINES } from "../lib/catalog";

const TABS = [
  { id: "overview", label: "Overview", perm: "overview" },
  { id: "worklists", label: "Worklists", perm: "worklists.read" },
  { id: "validation", label: "Validation", perm: "validation" },
  { id: "machines", label: "Machines", perm: "machines.read" },
];

export function OrbitPage() {
  const { session } = useSession();
  const allowed = TABS.filter((t) => can(session, t.perm));
  const [tab, setTab] = useState(allowed[0]?.id ?? "overview");
  const machines = useMemo(() => machinesFor(session, MACHINES), [session]);
  const online = machines.filter((m) => m.online).length;
  const company = session ? COMPANIES[session.company] : null;

  return (
    <div className="page">
      <div className="hero">
        <h1>CNC Operations Center</h1>
        <p>
          {company
            ? `${company.name} · ${company.plan}. Apps and machines are scoped to this company.`
            : "Monitor and manage your manufacturing fleet in real time."}
        </p>
      </div>
      {company && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 22 }}>
          <Fact label="Company" value={company.short} />
          <Fact label="Plan" value={company.plan} />
          <Fact label="Apps" value={company.apps.map((a) => APP_LABELS[a]).join(", ")} />
        </div>
      )}
      <Segment value={tab} options={allowed.map((t) => ({ id: t.id, label: t.label }))} onChange={setTab} />
      <div style={{ height: 22 }} />

      {tab === "overview" && (
        <div className="stack">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <Fact label="Machines" value={String(machines.length)} />
            <Fact label="Online" value={String(online)} />
            <Fact label="Worklists" value="3" />
            <Fact label="Validation" value="Ready" />
          </div>
          <Surface className="pad">
            <h2 className="panel-title">System status</h2>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {["Orbit API", "File intake", "Machine bridge"].map((name) => (
                <Surface key={name} relief="inset" className="pad">
                  <strong>{name}</strong>
                  <div className="muted" style={{ marginTop: 8 }}>Online</div>
                </Surface>
              ))}
            </div>
          </Surface>
        </div>
      )}

      {tab === "worklists" && (
        <Surface className="pad">
          <h2 className="panel-title">Select machine</h2>
          <div className="choices">
            {machines.map((m) => (
              <Surface key={m.slug} className="choice">
                <strong>{m.name}</strong>
                <span className="muted">{m.slug}</span>
                <span className="muted">{m.location}</span>
                <span>{m.online ? "Online" : "No data"}</span>
              </Surface>
            ))}
          </div>
        </Surface>
      )}

      {tab === "validation" && (
        <Surface className="pad">
          <h2 className="panel-title">Upload and validate</h2>
          <p className="muted">ZIP files with DXF drawings only. This local build checks the drop, not the geometry.</p>
          <Surface relief="inset" className="pad" style={{ textAlign: "center", marginTop: 12 }}>
            Drop a ZIP to estimate milling time
          </Surface>
        </Surface>
      )}

      {tab === "machines" && (
        <div className="choices">
          {machines.map((m) => (
            <Surface key={m.slug} className="pad">
              <strong style={{ fontSize: 20 }}>{m.name}</strong>
              <div className="muted">{m.owner}</div>
              <div className="muted">{m.location}</div>
              <Fact label="Status" value={m.online ? "Connected" : "No data"} />
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
