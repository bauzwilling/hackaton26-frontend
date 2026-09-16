/*
 * WAITING BFF: temporary Studio-local stand-in for SuggestedAction accept.
 *
 * Intake descriptors + Concierge reply relay. Delivery itself is owned by
 * WorkspaceProvider (registerAppIntake / deliverAppIntake) so handlers and
 * callers share one React ref — not a cross-bundle module Map.
 *
 * See docs/model-integration.md.
 */

export type AppChatIntake =
  | { id: string; kind: "text"; text: string; echoTo?: string }
  | { id: string; kind: "file"; name: string; echoTo?: string };

export type AppIntakeHandler = (intake: AppChatIntake, file?: File | null) => void | Promise<void>;

const echoByNode = new Map<string, string>();
let relaySink: ((nodeId: string, content: string, echoTo: string) => void) | null = null;

function intakeId() {
  return `intake-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function setAppChatRelaySink(
  sink: ((nodeId: string, content: string, echoTo: string) => void) | null,
) {
  relaySink = sink;
}

export function makeTextIntake(text: string, echoTo?: string): AppChatIntake {
  return { id: intakeId(), kind: "text", text, echoTo };
}

export function makeFileIntake(file: File, echoTo?: string): AppChatIntake {
  return { id: intakeId(), kind: "file", name: file.name, echoTo };
}

export function beginIntakeEcho(nodeId: string, echoTo?: string) {
  if (echoTo) echoByNode.set(nodeId, echoTo);
}

export function endIntakeEcho(nodeId: string, echoTo?: string) {
  window.setTimeout(() => {
    if (!echoTo || echoByNode.get(nodeId) === echoTo) echoByNode.delete(nodeId);
  }, 2500);
}

/** Apps call this when they push an assistant message during a forwarded turn. */
export function reportAppChatReply(nodeId: string, content: string) {
  const text = content.trim();
  if (!text) return;
  const echoTo = echoByNode.get(nodeId);
  if (!echoTo || !relaySink) return;
  relaySink(nodeId, text, echoTo);
}
