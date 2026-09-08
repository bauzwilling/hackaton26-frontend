/**
 * Frontend settings from VITE_* variables (see app/.env.example).
 */

/** API base path or URL for Flask routes (e.g. /api/app) */
// TODO: point chat/CSV/solve at the deployed BoxOut API, not local Flask on :5000
// WAITING BFF: this base is the Door Box-Out Flask stand-in; the UI should call the Platform BFF
export function getApiBase() {
  const base = import.meta.env.VITE_API_BASE
  return typeof base === 'string' && base.length > 0 ? base : '/api/app'
}

/** Poll interval while a solve ticket is running (ms) */
export function getPollIntervalMs() {
  const raw = import.meta.env.VITE_POLL_INTERVAL_MS
  const ms = Number(raw)
  return Number.isFinite(ms) && ms > 0 ? ms : 1200
}
