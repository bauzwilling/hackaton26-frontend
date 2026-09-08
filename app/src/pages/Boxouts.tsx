import { EmbeddedApp } from "../components/EmbeddedApp";

// Native Vue source is in src/boxouts/; this page still iframes the standalone app.
const BOXOUT_URL = import.meta.env.VITE_BOXOUT_URL || "http://localhost:5174";

export function BoxoutsPage() {
  return <EmbeddedApp src={BOXOUT_URL} title="Door Box Out" />;
}
