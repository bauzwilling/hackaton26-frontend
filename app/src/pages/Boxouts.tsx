import { EmbeddedApp } from "../components/EmbeddedApp";

const BOXOUT_URL = import.meta.env.VITE_BOXOUT_URL || "http://localhost:5174";

export function BoxoutsPage() {
  return <EmbeddedApp src={BOXOUT_URL} title="Door Box Out" />;
}
