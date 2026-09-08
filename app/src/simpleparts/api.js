const API_BASE = (import.meta.env?.VITE_SIMPLEPARTS_API_BASE || '/api/parts').replace(/\/$/, '')

// WAITING BFF: every call below must become a Platform BFF call (runs, actions, artifacts); boundary-plan §3 forbids the UI reaching Simple Parts at all.
// TODO: delete this prefix with the Flask stand-in — the destination is the BFF, never a deployed Simple Parts URL.
export function partsApi(path) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
