import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Brand, Surface } from "../components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "../context/session";
// WAITING DATABASE: dummy directory for sign-in; look is not applied on this page
import { COMPANIES, DIRECTORY, ROLES, companyOf, signIn, type CompanyId } from "../lib/auth";

const COMPANY_ORDER = Object.keys(COMPANIES) as CompanyId[];
const SAMPLE_PASSWORD = "demo";
const SAMPLE_NONE = "__none__";

export function LoginPage() {
  const { session, setSession } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const groups = useMemo(
    () =>
      COMPANY_ORDER.map((id) => ({
        id,
        name: COMPANIES[id].name,
        people: DIRECTORY.filter((u) => companyOf(u.email) === id),
      })).filter((g) => g.people.length > 0),
    [],
  );
  const [sampleEmail, setSampleEmail] = useState(SAMPLE_NONE);

  if (session) return <Navigate to="/" replace />;

  function submit() {
    const res = signIn(email, password);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    if (res.session) {
      setSession(res.session);
      nav("/");
    }
  }

  function pickSample(id: string) {
    setSampleEmail(id);
    setError("");
    if (id === SAMPLE_NONE) {
      setEmail("");
      setPassword("");
      return;
    }
    setEmail(id);
    setPassword(SAMPLE_PASSWORD);
  }

  return (
    <div className="login-wrap">
      <div className="login-col">
        <div className="login-brand">
          <Brand />
        </div>
        <Surface className="login-card">
          <h1 className="login-title">Sign in</h1>
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="login-field">
              <Label htmlFor="login-email">Work email</Label>
              <Input
                id="login-email"
                name="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.example"
              />
            </div>
            <div className="login-field">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {/* WAITING DATABASE: password reset — fake modal until the account API exists */}
            <Button type="button" variant="link" className="login-help border-0 bg-transparent shadow-none" onClick={() => setHelpOpen(true)}>
              Help logging in
            </Button>
            {error && (
              <Surface relief="inset" className="login-error">
                {error}
              </Surface>
            )}
            <Button type="submit" className="login-submit">
              Sign in
            </Button>
          </form>
        </Surface>

        <Surface relief="inset" className="login-samples">
          <div className="login-samples-label">Sample roles</div>
          <div className="login-samples-row">
            <Select value={sampleEmail} onValueChange={pickSample}>
              <SelectTrigger className="login-sample-select w-full bg-transparent shadow-none" aria-label="Sample roles">
                <SelectValue placeholder="Select a sample role" />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="login-sample-menu border-0 shadow-none">
                <SelectItem value={SAMPLE_NONE} className="login-sample-none">
                  Select a sample role
                </SelectItem>
                {groups.map((g) => (
                  <SelectGroup key={g.id}>
                    <SelectLabel>{g.name}</SelectLabel>
                    {g.people.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} · {ROLES[u.role].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="login-samples-hint">Preview a company role, then sign in.</p>
        </Surface>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent showCloseButton={false} className="login-dialog sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="sr-only">Help logging in</DialogTitle>
            <DialogDescription id="login-help-copy" className="login-dialog-copy">
              Reset your password through the website and come back to login with your new password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" className="login-dialog-ok" onClick={() => setHelpOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
