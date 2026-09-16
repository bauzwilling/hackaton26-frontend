/*
 * WAITING BFF: temporary Studio-local stand-in for SuggestedAction accept.
 *
 * Today: Concierge opens an app window (already allowed as a stand-in) and also
 * forwards the user text/file into that window's existing chat UI so the hackathon
 * demo can show a reply. The browser does NOT own the real workflow loop.
 *
 * Target (msd-concierge-ui / boundary-plan):
 *   AI proposes → BFF stores SuggestedAction → UI shows a button →
 *   POST /api/actions/{actionId}/accept → BFF starts execution → UI polls.
 * When that lands, delete this module. Callers keep deliverAppChat() /
 * registerAppChat() / reportAppChatReply() until then — swap the body only.
 *
 * WAITING MODEL: Door Box Out / Simple Parts still answer via their own chat
 * stand-ins. Our structuring model (through the BFF) takes over later.
 *
 * See docs/model-integration.md.
 */

export type AppChatPayload =
  | { kind: "text"; text: string }
  | { kind: "file"; file: File };

export type AppChatHandlers = {
  onText?: (text: string) => void | Promise<void>;
  onFile?: (file: File) => void | Promise<void>;
};

type Pending = {
  payload: AppChatPayload;
  echoTo?: string;
};

type Slot = {
  handlers: AppChatHandlers | null;
  queue: Pending[];
  echoTo: string | null;
};

const slots = new Map<string, Slot>();
let relaySink: ((nodeId: string, content: string, echoTo: string) => void) | null = null;

function slotOf(nodeId: string): Slot {
  let slot = slots.get(nodeId);
  if (!slot) {
    slot = { handlers: null, queue: [], echoTo: null };
    slots.set(nodeId, slot);
  }
  return slot;
}

/** Workspace registers once to append relayed assistant turns into Concierge. */
export function setAppChatRelaySink(
  sink: ((nodeId: string, content: string, echoTo: string) => void) | null,
) {
  relaySink = sink;
}

export function registerAppChat(nodeId: string, handlers: AppChatHandlers) {
  const slot = slotOf(nodeId);
  slot.handlers = handlers;
  const queued = slot.queue.splice(0);
  for (const item of queued) {
    void flush(nodeId, item);
  }
  return () => {
    const current = slots.get(nodeId);
    if (current?.handlers === handlers) current.handlers = null;
  };
}

/**
 * Temporary: forward a Concierge turn into the already-open app chat UI.
 * Not a BFF action accept — replace with SuggestedAction when the BFF exists.
 */
export function deliverAppChat(
  nodeId: string,
  payload: AppChatPayload,
  opts?: { echoTo?: string },
) {
  const pending: Pending = { payload, echoTo: opts?.echoTo };
  const slot = slotOf(nodeId);
  if (!slot.handlers) {
    slot.queue.push(pending);
    return;
  }
  void flush(nodeId, pending);
}

/** Apps call this when they push an assistant message during a forwarded turn. */
export function reportAppChatReply(nodeId: string, content: string) {
  const text = content.trim();
  if (!text) return;
  const slot = slots.get(nodeId);
  const echoTo = slot?.echoTo;
  if (!echoTo || !relaySink) return;
  relaySink(nodeId, text, echoTo);
}

async function flush(nodeId: string, pending: Pending) {
  const slot = slotOf(nodeId);
  const handlers = slot.handlers;
  if (!handlers) {
    slot.queue.push(pending);
    return;
  }
  const prev = slot.echoTo;
  if (pending.echoTo) slot.echoTo = pending.echoTo;
  try {
    if (pending.payload.kind === "text") {
      await handlers.onText?.(pending.payload.text);
    } else {
      await handlers.onFile?.(pending.payload.file);
    }
  } finally {
    slot.echoTo = prev;
  }
}
