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
 * The `{ reply, app }` shape below is NOT the product contract. The BFF owns
 * SuggestedAction (`actionId`, `type` such as `mill.start`, `label`), and a
 * proposal starts nothing until the user accepts it. Nothing outside this file
 * should learn the transport, so keep callers on askConcierge().
 */

export type ConciergeTurn = { role: "user" | "assistant"; content: string };

/** WAITING BFF: replaced by a streamed message plus BFF-owned SuggestedAction[]. */
export type ConciergeResult = { reply: string; app: string | null };

export async function askConcierge(
  message: string,
  history: ConciergeTurn[],
  apps: string[],
  restricted: string[] = [],
): Promise<ConciergeResult> {
  // #region agent log
  fetch('http://127.0.0.1:7448/ingest/c73e0b22-e355-4118-9fbd-33d77a7f4f9c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'765102'},body:JSON.stringify({sessionId:'765102',runId:'verify',hypothesisId:'A',location:'concierge.ts:askConcierge',message:'chat fetch start',data:{msgLen:message.length,historyLen:history.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, apps, restricted }),
    });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7448/ingest/c73e0b22-e355-4118-9fbd-33d77a7f4f9c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'765102'},body:JSON.stringify({sessionId:'765102',runId:'verify',hypothesisId:'A',location:'concierge.ts:askConcierge',message:'chat fetch threw',data:{err:String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw err;
  }
  // #region agent log
  fetch('http://127.0.0.1:7448/ingest/c73e0b22-e355-4118-9fbd-33d77a7f4f9c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'765102'},body:JSON.stringify({sessionId:'765102',runId:'verify',hypothesisId:'A',location:'concierge.ts:askConcierge',message:'chat fetch response',data:{ok:res.ok,status:res.status},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!res.ok) {
    throw new Error(`Concierge request failed (${res.status})`);
  }
  const data = (await res.json()) as { reply?: unknown; app?: unknown };
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) throw new Error("Concierge returned an empty reply");
  const app = typeof data.app === "string" && data.app.trim() ? data.app.trim() : null;
  return { reply, app };
}
