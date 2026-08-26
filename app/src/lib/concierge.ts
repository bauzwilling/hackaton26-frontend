export type ConciergeTurn = { role: "user" | "assistant"; content: string };

export type ConciergeResult = { reply: string; app: string | null };

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
  const data = (await res.json()) as { reply?: unknown; app?: unknown };
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) throw new Error("Concierge returned an empty reply");
  const app = typeof data.app === "string" && data.app.trim() ? data.app.trim() : null;
  return { reply, app };
}
