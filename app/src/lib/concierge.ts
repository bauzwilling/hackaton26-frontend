/*
 * WAITING BFF: the whole concierge transport is temporary.
 *
 * Today: UI -> POST /api/chat -> local FastAPI bridge (server.py) -> Claude.
 * That bridge is a stand-in so the Studio works before the Platform BFF exists.
 *
 * WAITING MODEL: Claude answers user text today. Our own structuring model takes over,
 * reached only through the BFF — the UI never talks to an AI provider. Two swaps, one
 * file: the transport below and the brain behind it. See docs/model-integration.md.
 *
 * To rewire (msd-concierge-ui), swap this one module:
 *   POST /api/chats/{chatId}/messages/stream   consume SSE for the AI reply only
 *   GET  /api/chats/{chatId}/messages
 *   POST /api/chats/{chatId}/attachments
 *   POST /api/actions/{actionId}/accept | dismiss
 *
 * The `{ reply, app, design, choices }` shape below is NOT the product contract. The BFF owns
 * SuggestedAction (`actionId`, `type` such as `mill.start`, `label`), and a
 * proposal starts nothing until the user accepts it. Nothing outside this file
 * should learn the transport, so keep callers on askConcierge().
 */

export type ConciergeTurn = { role: "user" | "assistant"; content: string };

export const PLYWORKS_DESIGNS = ["shelf", "table", "stool", "bench"] as const;
export type PlyworksDesign = (typeof PLYWORKS_DESIGNS)[number];

/** WAITING BFF: replaced by a streamed message plus BFF-owned SuggestedAction[]. */
export type ConciergeResult = {
  reply: string;
  app: string | null;
  design: PlyworksDesign | null;
  choices: PlyworksDesign[] | null;
};

function asDesign(raw: unknown): PlyworksDesign | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return (PLYWORKS_DESIGNS as readonly string[]).includes(id) ? (id as PlyworksDesign) : null;
}

function asChoices(raw: unknown): PlyworksDesign[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PlyworksDesign[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = asDesign(item);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.length ? out : null;
}

export function plyworksDesignLabel(id: string) {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

export async function askConcierge(
  message: string,
  history: ConciergeTurn[],
  apps: string[],
  restricted: string[] = [],
): Promise<ConciergeResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, apps, restricted }),
  });
  if (!res.ok) {
    throw new Error(`Concierge request failed (${res.status})`);
  }
  const data = (await res.json()) as { reply?: unknown; app?: unknown; design?: unknown; choices?: unknown };
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) throw new Error("Concierge returned an empty reply");
  const app = typeof data.app === "string" && data.app.trim() ? data.app.trim() : null;
  let design = asDesign(data.design);
  let choices = asChoices(data.choices);
  if (app === "plyworks") {
    design = design ?? "shelf";
    choices = null;
  } else {
    design = null;
    if (app) choices = null;
  }
  return { reply, app, design, choices };
}
