import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Brand, Surface } from "../components/kit";
import { useSession } from "../context/session";
// WAITING DATABASE: dummy directory for sign-in; look is not applied on this page
import { APP_LABELS, COMPANIES, DIRECTORY, companyOf, signIn, type CompanyId } from "../lib/auth";

const COMPANY_ORDER = Object.keys(COMPANIES) as CompanyId[];

export function LoginPage() {
  const { session, setSession } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (session) return <Navigate to="/" replace />;

  function submit(nextEmail = email, nextPassword = password) {
    const res = signIn(nextEmail, nextPassword);
    if ("error" in res && res.error) { setError(res.error); return; }
    if (res.session) { setSession(res.session); nav("/"); }
  }

  return (
    <div className="login-wrap">
      <div style={{ width: "min(480px, 100%)" }}>
        <div style={{ marginBottom: 22 }}><Brand /></div>
        <Surface className="login-card pad">
          <h1 style={{ margin: 0, fontSize: 29, color: "var(--acc-deep)" }}>Sign in</h1>
          <p className="muted" style={{ margin: "11px 0 22px" }}>
            Dummy accounts only — there is no user database yet. Pick a person to preview that company’s apps, machines and dashboard. Company comes from the email domain; role is assigned in the fixture, not chosen here.
          </p>
          <div className="field">
            <label>Work email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="name@company.example" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="any password" />
          </div>
          {error && <Surface relief="inset" className="pad" style={{ marginBottom: 14, color: "var(--acc-deep)" }}>{error}</Surface>}
          <Surface as="button" type="button" relief="accent" style={{ width: "100%", padding: 14, fontWeight: 700 }} onClick={() => submit()}>
            Sign in
          </Surface>

          <div style={{ marginTop: 26 }}>
            <div className="muted" style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Dummy companies</div>
            <div className="stack" style={{ gap: 18 }}>
              {COMPANY_ORDER.map((id) => {
                const co = COMPANIES[id];
                const people = DIRECTORY.filter((u) => companyOf(u.email) === id);
                return (
                  <Surface key={id} relief="inset" className="pad" style={{ padding: 16 }}>
                    <strong>{co.name}</strong>
                    <div className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>
                      {co.plan} · {co.apps.map((a) => APP_LABELS[a]).join(", ")}
                    </div>
                    <div className="stack" style={{ gap: 8 }}>
                      {people.map((u) => (
                        <Surface
                          key={u.email}
                          as="button"
                          type="button"
                          className="fact"
                          onClick={() => { setEmail(u.email); setPassword("demo"); submit(u.email, "demo"); }}
                        >
                          <span style={{ textAlign: "left" }}>
                            <strong style={{ display: "block" }}>{u.name}</strong>
                            <span className="muted" style={{ fontSize: 12 }}>{u.email}</span>
                          </span>
                          <strong style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>{u.role}</strong>
                        </Surface>
                      ))}
                    </div>
                  </Surface>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Any password is accepted. These records live in auth.ts until a database replaces them.</p>
          </div>
        </Surface>
      </div>
    </div>
  );
}
