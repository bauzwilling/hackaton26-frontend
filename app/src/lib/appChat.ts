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
  draining: boolean;
};

const slots = new Map<string, Slot>();
let relaySink: ((nodeId: string, content: string, echoTo: string) => void) | null = null;

function slotOf(nodeId: string): Slot {
  let slot = slots.get(nodeId);
  if (!slot) {
    slot = { handlers: null, queue: [], echoTo: null, draining: false };
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
  void drain(nodeId);
  return () => {
    const current = slots.get(nodeId);
    if (current?.handlers === handlers) current.handlers = null;
  };
}

/**
 * Temporary: forward a Concierge turn into the already-open app chat UI.
 * Not a BFF action accept — replace with SuggestedAction when the BFF exists.
 *
 * Safe to call before the window has mounted: the payload queues until
 * registerAppChat runs, then drains in order.
 */
export function deliverAppChat(
  nodeId: string,
  payload: AppChatPayload,
  opts?: { echoTo?: string },
) {
  const slot = slotOf(nodeId);
  slot.queue.push({ payload, echoTo: opts?.echoTo });
  void drain(nodeId);
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

async function drain(nodeId: string) {
  const slot = slotOf(nodeId);
  if (slot.draining) return;
  slot.draining = true;
  try {
    while (slot.handlers && slot.queue.length) {
      const pending = slot.queue.shift()!;
      const handlers = slot.handlers;
      if (!handlers) {
        slot.queue.unshift(pending);
        break;
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
  } finally {
    slot.draining = false;
    // A deliver may have queued while we were finishing.
    if (slot.handlers && slot.queue.length) void drain(nodeId);
  }
}
