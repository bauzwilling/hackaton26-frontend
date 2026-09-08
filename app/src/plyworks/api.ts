const API_BASE = (import.meta.env.VITE_PLYWORKS_API_BASE || "/api/plyworks").replace(/\/$/, "");

// WAITING BFF: this namespaced Flask route is a temporary stand-in; Plyworks workflow state belongs to the Platform BFF.
export function plyworksApi(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
