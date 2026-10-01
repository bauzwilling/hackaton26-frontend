import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ROLES,
  companyIdFromEmail,
  getCompany,
  isPlatformAdmin,
  listCompanies,
  type CompanyId,
  type RoleId,
} from "../lib/auth";
import {
  addCompany,
  getCompaniesSnapshot,
  setCompanySuspended,
  subscribeCompanies,
  type CompanyRecord,
} from "../lib/companyStore";
import {
  addUser,
  getDirectorySnapshot,
  removeUser,
  subscribeDirectory,
  updateUser,
  type DirectoryUser,
} from "../lib/directoryStore";
import { useSession } from "../context/session";

const ROLE_OPTIONS: RoleId[] = ["user", "operator", "manager", "admin"];

export function ProfileManagerPage() {
  const { session } = useSession();
  const users = useSyncExternalStore(subscribeDirectory, getDirectorySnapshot, getDirectorySnapshot);
  const allCompanies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, listCompanies);
  const platformAdmin = isPlatformAdmin(session);
  const homeCompanyId = session?.company ?? "D";

  const visibleCompanies = useMemo(
    () => (platformAdmin ? allCompanies : allCompanies.filter((c) => c.id === homeCompanyId)),
    [allCompanies, homeCompanyId, platformAdmin],
  );

  const [error, setError] = useState("");
  const [addingProfile, setAddingProfile] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [name, setName] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [companyId, setCompanyId] = useState<CompanyId>(homeCompanyId);
  const [role, setRole] = useState<RoleId>("user");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");

  useEffect(() => {
    if (!platformAdmin) setCompanyId(homeCompanyId);
  }, [homeCompanyId, platformAdmin]);

  const groups = useMemo(() => {
    return visibleCompanies.map((company) => ({
      company,
      people: users
        .filter((u) => companyIdFromEmail(u.email) === company.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [visibleCompanies, users]);

  if (!session || session.role !== "admin") {
    return <div className="jobs-empty">Profile Manager is available to admins.</div>;
  }

  function run(action: () => void) {
    try {
      setError("");
      action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
      return false;
    }
  }

  function submitProfile() {
    const targetCompanyId = platformAdmin ? companyId : homeCompanyId;
    const company = getCompany(targetCompanyId);
    if (!company) {
      setError("Choose a company.");
      return;
    }
    const email = `${localPart.trim().toLowerCase()}@${company.domain}`;
    if (run(() => addUser({ email, name, role, by: session.email }))) {
      setAddingProfile(false);
      setName("");
      setLocalPart("");
      setRole("user");
    }
  }

  function submitCompany() {
    if (!platformAdmin) {
      setError("Only DataB admins can add companies.");
      return;
    }
    if (run(() => addCompany({ name: companyName, domain: companyDomain }))) {
      setAddingCompany(false);
      setCompanyName("");
      setCompanyDomain("");
    }
  }

  const homeName = getCompany(homeCompanyId)?.name ?? "your company";

  return (
    <section className="jobs-page admin-page">
      <header className="jobs-head">
        <div>
          <p className="jobs-kicker">Administration</p>
          <h1>Profile Manager</h1>
        </div>
        <div className="admin-head-actions">
          {platformAdmin && (
            <button
              type="button"
              className="admin-primary"
              onClick={() => {
                setAddingCompany((v) => !v);
                setAddingProfile(false);
                setError("");
              }}
            >
              {addingCompany ? "Cancel" : "+ COMPANY"}
            </button>
          )}
          <button
            type="button"
            className="admin-primary"
            onClick={() => {
              setAddingProfile((v) => !v);
              setAddingCompany(false);
              setError("");
            }}
          >
            {addingProfile ? "Cancel" : "+ PROFILE"}
          </button>
        </div>
      </header>
      {error && <p className="jobs-error" role="alert">{error}</p>}

      {addingCompany && platformAdmin && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitCompany();
          }}
        >
          <label>
            <span>Company name</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Timber" required />
          </label>
          <label>
            <span>Email domain</span>
            <input value={companyDomain} onChange={(e) => setCompanyDomain(e.target.value)} placeholder="acme.example" required />
          </label>
          <button type="submit" className="admin-primary">Create company</button>
        </form>
      )}

      {addingProfile && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitProfile();
          }}
        >
          <label>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            <span>Email local part</span>
            <div className="admin-email-row">
              <input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value.replace(/@.*$/, ""))}
                placeholder="jordan"
                required
              />
              <span className="admin-email-domain">@</span>
            </div>
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
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as RoleId)}>
              {ROLE_OPTIONS.map((id) => (
                <option key={id} value={id}>{ROLES[id].label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-primary">Create profile</button>
        </form>
      )}

      <p className="admin-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        {platformAdmin
          ? "New companies and profiles start suspended. Activate a company to unlock all of its profiles for login samples this session."
          : `You manage profiles for ${homeName} only. New profiles start suspended until activated.`}
      </p>

      <div className="admin-company-list">
        {groups.map(({ company, people }) => (
          <CompanyGroup
            key={company.id}
            company={company}
            people={people}
            actorEmail={session.email}
            platformAdmin={platformAdmin}
            onRun={run}
          />
        ))}
      </div>
      <p className="admin-hint">Changes apply for this browser tab session only. A new tab starts from the default fixtures.</p>
    </section>
  );
}

function CompanyGroup({
  company,
  people,
  actorEmail,
  platformAdmin,
  onRun,
}: {
  company: CompanyRecord;
  people: DirectoryUser[];
  actorEmail: string;
  platformAdmin: boolean;
  onRun: (action: () => void) => boolean;
}) {
  const suspended = Boolean(company.suspended);
  const isDatab = company.id === "D";
  // Company-level activate/suspend: DataB admins for any company; company admins for their own (not DataB).
  const canToggleCompany = platformAdmin ? !(isDatab && !suspended) : !isDatab;

  return (
    <section className={`admin-company${suspended ? " is-suspended" : ""}`}>
      <header className="admin-company-head">
        <div>
          <h2>{company.name}</h2>
          <p className="admin-company-meta">@{company.domain} · {people.length} {people.length === 1 ? "profile" : "profiles"}</p>
        </div>
        <div className="admin-company-actions">
          <span className={`admin-status ${suspended ? "is-suspended" : "is-active"}`}>
            {suspended ? "Suspended" : "Active"}
          </span>
          <button
            type="button"
            className={suspended ? "admin-action-activate" : undefined}
            disabled={!canToggleCompany}
            title={isDatab ? "DataB cannot be suspended" : undefined}
            onClick={() => onRun(() => setCompanySuspended(company.id, !suspended, { cascade: true }))}
          >
            {suspended ? "Activate" : "Suspend"}
          </button>
        </div>
      </header>
      <div className="jobs-table-wrap">
        <table className="jobs-table admin-table admin-table--profiles">
          <colgroup>
            <col className="admin-col-name" />
            <col className="admin-col-email" />
            <col className="admin-col-role" />
            <col className="admin-col-status" />
            <col className="admin-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty-row">No profiles yet.</td>
              </tr>
            ) : people.map((user) => (
              <ProfileRow
                key={user.email}
                user={user}
                actorEmail={actorEmail}
                onRun={onRun}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProfileRow({
  user,
  actorEmail,
  onRun,
}: {
  user: DirectoryUser;
  actorEmail: string;
  onRun: (action: () => void) => boolean;
}) {
  const self = user.email === actorEmail;
  const suspended = Boolean(user.suspended);
  const companyId = companyIdFromEmail(user.email);

  return (
    <tr className={suspended ? "is-suspended" : undefined}>
      <td><strong>{user.name}</strong></td>
      <td><small>{user.email}</small></td>
      <td>
        <select
          value={user.role}
          disabled={self}
          aria-label={`Role for ${user.name}`}
          onChange={(e) => onRun(() => updateUser(user.email, { role: e.target.value as RoleId }, actorEmail))}
        >
          {ROLE_OPTIONS.map((id) => (
            <option key={id} value={id}>{ROLES[id].label}</option>
          ))}
        </select>
      </td>
      <td>
        <span className={`admin-status ${suspended ? "is-suspended" : "is-active"}`}>
          {suspended ? "Suspended" : "Active"}
        </span>
      </td>
      <td>
        <div className="job-actions">
          <button
            type="button"
            className={suspended ? "admin-action-activate" : undefined}
            disabled={self}
            onClick={() => onRun(() => {
              updateUser(user.email, { suspended: !suspended }, actorEmail);
              if (suspended && companyId) setCompanySuspended(companyId, false, { cascade: false });
            })}
          >
            {suspended ? "Activate" : "Suspend"}
          </button>
          <button
            type="button"
            className="admin-action-remove"
            disabled={self || !suspended}
            title={self ? undefined : suspended ? undefined : "Suspend to remove"}
            onClick={() => onRun(() => removeUser(user.email, actorEmail))}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
