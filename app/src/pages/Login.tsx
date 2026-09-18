import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Brand,
  LAND_FADE,
  LAYOUT_CHROME,
  LAYOUT_DOT,
  LAYOUT_MOVE,
  NetworkDot,
  Surface,
} from "../components/kit";
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
import { ACTIVE_COMPANY_IDS, COMPANIES, DIRECTORY, ROLES, companyOf, signIn } from "../lib/auth";

const COMPANY_ORDER = ACTIVE_COMPANY_IDS;
const SAMPLE_PASSWORD = "demo";
const SAMPLE_NONE = "__none__";
const AUTH_WAIT_MS = 1000;

export function LoginPage() {
  const { session, setSession } = useSession();
  const nav = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const fromLogout = Boolean((location.state as { fromLogout?: boolean } | null)?.fromLogout);
  const arrive = fromLogout && !reduce ? LAND_FADE : { duration: 0 };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const waitTimer = useRef<number | null>(null);
  const handingOff = useRef(false);
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
  const layout = reduce ? { duration: 0 } : LAYOUT_MOVE;

  useEffect(() => () => {
    if (waitTimer.current != null) window.clearTimeout(waitTimer.current);
  }, []);

  if (session && !handingOff.current) return <Navigate to="/" replace />;

  function go(next: NonNullable<ReturnType<typeof signIn>["session"]>) {
    handingOff.current = true;
    setSession(next);
    nav("/");
  }

  function finish(res: ReturnType<typeof signIn>) {
    setBusy(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    if (res.session) go(res.session);
  }

  function submit() {
    if (busy) return;
    if (!email.trim() || !password) {
      const res = signIn(email, password);
      finish(res);
      return;
    }
    setBusy(true);
    setError("");
    // WAITING DATABASE: sign-in latency — replace with the account API
    waitTimer.current = window.setTimeout(() => finish(signIn(email, password)), AUTH_WAIT_MS);
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
          <Brand
            afterTitle={
              <motion.span
                layout
                layoutId={LAYOUT_DOT}
                className="login-network-dot"
                title="Network online"
                aria-label="Network online"
                transition={{ layout }}
              >
                <NetworkDot />
              </motion.span>
            }
          />
        </div>
        <Surface
          as={motion.div}
          layout
          layoutId={LAYOUT_CHROME}
          className="login-card"
          transition={{ layout }}
        >
          <motion.div initial={fromLogout && !reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={arrive}>
          <h1 className="login-title">Sign in</h1>
          <form
            className="login-form"
            aria-busy={busy}
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
                disabled={busy}
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
                disabled={busy}
              />
            </div>
            {/* WAITING DATABASE: password reset — fake modal until the account API exists */}
            <Button type="button" variant="link" className="login-help border-0 bg-transparent shadow-none" onClick={() => setHelpOpen(true)} disabled={busy}>
              Help logging in
            </Button>
            <div className="login-error-slot" role="alert" aria-live="polite">
              {error ? (
                <Surface relief="inset" className="login-error">
                  {error}
                </Surface>
              ) : null}
            </div>
            <Button type="submit" className="login-submit" disabled={busy} aria-busy={busy}>
              {busy && <span className="login-submit-spin" aria-hidden />}
              Sign in
            </Button>
          </form>
          </motion.div>
        </Surface>

        <motion.div
          className={busy ? "login-samples-wrap is-busy" : "login-samples-wrap"}
          initial={fromLogout && !reduce ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={arrive}
        >
          <Surface relief="inset" className="login-samples">
            <div className="login-samples-label">Sample roles</div>
            <div className="login-samples-row">
              <Select value={sampleEmail} onValueChange={pickSample} disabled={busy}>
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
        </motion.div>
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
