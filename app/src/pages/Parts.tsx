import { EmbeddedApp } from "../components/EmbeddedApp";

// Native Vue source is in src/simpleparts/; this page still iframes the standalone app.
const SIMPLEPARTS_URL = import.meta.env.VITE_SIMPLEPARTS_URL || "http://localhost:5175";

export function PartsPage() {
  return <EmbeddedApp src={SIMPLEPARTS_URL} title="Simple Parts" />;
}
