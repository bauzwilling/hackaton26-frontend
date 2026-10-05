import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getCompany, isAdminLike, isPlatformAdmin, type CompanyId } from "../lib/auth";
import {
  getCompaniesSnapshot,
  listCompanies,
  subscribeCompanies,
  type CompanyRecord,
} from "../lib/companyStore";
import {
  addMachine,
  companyIdForMachine,
  getMachinesSnapshot,
  removeMachine,
  subscribeMachines,
  updateMachine,
  type CatalogMachine,
} from "../lib/machineStore";
import { useSession } from "../context/session";

export function MachineManagerPage() {
  const { session } = useSession();
  const machines = useSyncExternalStore(subscribeMachines, getMachinesSnapshot, getMachinesSnapshot);
  const allCompanies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, listCompanies);
  const platformAdmin = isPlatformAdmin(session);
  const homeCompanyId = session?.company ?? "D";

  const visibleCompanies = useMemo(
    () => (platformAdmin ? allCompanies : allCompanies.filter((c) => c.id === homeCompanyId)),
    [allCompanies, homeCompanyId, platformAdmin],
  );

  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [companyId, setCompanyId] = useState<CompanyId>(homeCompanyId);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!platformAdmin) setCompanyId(homeCompanyId);
  }, [homeCompanyId, platformAdmin]);

  const groups = useMemo(() => {
    const byCompany = visibleCompanies.map((company) => ({
      company,
      machines: machines
        .filter((m) => companyIdForMachine(m) === company.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    const assigned = new Set(byCompany.flatMap((g) => g.machines.map((m) => m.slug)));
    const orphan = platformAdmin
      ? machines.filter((m) => !assigned.has(m.slug))
      : [];
    return { byCompany, orphan };
  }, [visibleCompanies, machines, platformAdmin]);

  if (!session || !isAdminLike(session)) {
    return <div className="jobs-empty">Machine Inventory is available to admins and superusers.</div>;
  }

  function run(action: () => void) {
    try {
      setError("");
      action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The machine could not be updated.");
      return false;
    }
  }

  function submitAdd() {
    const targetCompanyId = platformAdmin ? companyId : homeCompanyId;
    if (run(() => addMachine({ name, companyId: targetCompanyId, location, online }))) {
      setAdding(false);
      setName("");
      setLocation("");
      setOnline(true);
    }
  }

  const homeName = getCompany(homeCompanyId)?.name ?? "your company";

  return (
    <section className="jobs-page admin-page">
      <header className="jobs-head" data-help="machines-admin-head">
        <div>
          <p className="jobs-kicker">Administration</p>
          <h1>Machine Inventory</h1>
        </div>
        <button type="button" className="admin-primary" onClick={() => { setAdding((v) => !v); setError(""); }}>
          {adding ? "Cancel" : "+ MACHINE"}
        </button>
      </header>
      {error && <p className="jobs-error" role="alert">{error}</p>}
      {adding && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
        >
          <label>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="04G0" required />
          </label>
          {platformAdmin ? (
            <label>
              <span>Company</span>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {visibleCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>Company</span>
              <input value={homeName} disabled readOnly />
            </label>
          )}
          <label>
            <span>Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Biedermannsdorf, Austria" required />
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
            <span>Online</span>
          </label>
          <button type="submit" className="admin-primary">Create machine</button>
        </form>
      )}

      <p className="admin-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        {platformAdmin
          ? "Enabled online machines appear in Orbit and Jobs for managers and operators this session."
          : `You manage machines for ${homeName} only.`}
      </p>

      <div className="admin-company-list">
        {groups.byCompany.map(({ company, machines: fleet }) => (
          <MachineCompanyGroup
            key={company.id}
            company={company}
            machines={fleet}
            onRun={run}
          />
        ))}
        {groups.orphan.length > 0 && (
          <MachineCompanyGroup
            company={null}
            machines={groups.orphan}
            onRun={run}
          />
        )}
      </div>
    </section>
  );
}

function MachineCompanyGroup({
  company,
  machines,
  onRun,
}: {
  company: CompanyRecord | null;
  machines: CatalogMachine[];
  onRun: (action: () => void) => boolean;
}) {
  const onlineCount = machines.filter((m) => m.enabled !== false && m.online).length;
  const title = company?.name ?? "Unassigned";
  const meta = company
    ? `${company.domain} · ${machines.length} ${machines.length === 1 ? "machine" : "machines"} · ${onlineCount} online`
    : `${machines.length} ${machines.length === 1 ? "machine" : "machines"}`;

  return (
    <section className="admin-company">
      <header className="admin-company-head">
        <div>
          <h2>{title}</h2>
          <p className="admin-company-meta">{meta}</p>
        </div>
      </header>
      <div className="jobs-table-wrap">
        <table className="jobs-table admin-table admin-table--machines">
          <colgroup>
            <col className="admin-col-name" />
            <col className="admin-col-slug" />
            <col className="admin-col-location" />
            <col className="admin-col-status" />
            <col className="admin-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Location</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {machines.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty-row">No machines yet.</td>
              </tr>
            ) : machines.map((machine) => (
              <MachineRow key={machine.slug} machine={machine} onRun={onRun} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MachineRow({
  machine,
  onRun,
}: {
  machine: CatalogMachine;
  onRun: (action: () => void) => boolean;
}) {
  const enabled = machine.enabled !== false;
  const liveOnline = enabled && machine.online;
  const canDisable = enabled && !machine.online;
  const canSetOnline = enabled && !machine.online;
  const canRemove = !enabled || !machine.online;

  return (
    <tr className={!liveOnline ? "is-suspended" : undefined}>
      <td><strong>{machine.name}</strong></td>
      <td><small>{machine.slug}</small></td>
      <td>{machine.location}</td>
      <td>
        <span className={`admin-status ${liveOnline ? "is-active" : "is-suspended"}`}>
          {!enabled ? "Disabled" : machine.online ? "Online" : "Offline"}
        </span>
      </td>
      <td>
        <div className="job-actions">
          {enabled ? (
            <button
              type="button"
              disabled={!canDisable}
              title={canDisable ? undefined : "Set offline to disable"}
              onClick={() => onRun(() => updateMachine(machine.slug, { enabled: false, online: false }))}
            >
              Disable
            </button>
          ) : (
            <button
              type="button"
              className="admin-action-activate"
              onClick={() => onRun(() => updateMachine(machine.slug, { enabled: true }))}
            >
              Enable
            </button>
          )}
          <button
            type="button"
            className={canSetOnline ? "admin-action-activate" : undefined}
            disabled={!machine.online && !enabled}
            title={!machine.online && !enabled ? "Enable to set online" : undefined}
            onClick={() => onRun(() => updateMachine(machine.slug, { online: !machine.online }))}
          >
            {machine.online ? "Set offline" : "Set online"}
          </button>
          <button
            type="button"
            className="admin-action-remove"
            disabled={!canRemove}
            title={canRemove ? undefined : "Set offline to remove"}
            onClick={() => onRun(() => removeMachine(machine.slug))}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
