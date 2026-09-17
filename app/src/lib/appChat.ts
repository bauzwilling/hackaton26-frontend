/*
 * WAITING BFF: temporary Studio-local stand-in for SuggestedAction accept.
 *
 * Intake descriptors + Concierge reply relay. Delivery itself is owned by
 * WorkspaceProvider (registerAppIntake / deliverAppIntake) so handlers and
 * callers share one React ref — not a cross-bundle module Map.
 *
 * Interactive app prompts (material/sheet/Nest) echo into Concierge the same
 * way; answers call back through registerAppChatActions.
 *
 * See docs/model-integration.md.
 */

export type AppChatIntake =
  | { id: string; kind: "text"; text: string; echoTo?: string }
  | { id: string; kind: "file"; name: string; echoTo?: string };

export type AppIntakeHandler = (intake: AppChatIntake, file?: File | null) => void | Promise<void>;

export type AppChatPoint2 = { x: number; y: number };

export type AppChatMaterialOption = {
  id: string;
  label: string;
  allowedThicknessesMm: number[];
  allowedSizesMm: AppChatPoint2[];
};

/** Interactive bits Concierge renders for an app-relayed turn. */
export type AppChatPrompt = {
  messageId: string;
  kind:
    | "text"
    | "warning"
    | "error"
    | "result"
    | "nesting-result"
    | "material-select"
    | "sheet-size-select"
    | "confirm"
    | "nest-cta";
  content: string;
  choices?: string[];
  materials?: AppChatMaterialOption[];
  allowedSizesMm?: AppChatPoint2[];
  allowedThicknessesMm?: number[];
  sheetX?: number | null;
  sheetY?: number | null;
  sheetThickness?: number | null;
  leftoverComplete?: boolean;
  nestingNeedsRerun?: boolean;
  /** Set by Concierge after the user acts on this prompt. */
  resolved?: boolean;
};

export type AppChatAction =
  | { type: "material"; messageId: string; material: AppChatMaterialOption }
  | {
      type: "sheet-size";
      messageId: string;
      sheetX: number;
      sheetY: number;
      sheetThickness: number;
    }
  | { type: "confirm"; messageId: string; choice: string }
  | { type: "nest" }
  | { type: "show-nesting-result"; messageId: string };

export type AppChatActionHandler = (action: AppChatAction) => void | Promise<void>;

type RelaySink = (
  nodeId: string,
  content: string,
  echoTo: string,
  prompt?: AppChatPrompt,
) => void;

const echoByNode = new Map<string, string>();
let relaySink: RelaySink | null = null;

function intakeId() {
  return `intake-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function setAppChatRelaySink(sink: RelaySink | null) {
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

/**
 * Apps call this when they push an assistant message (or Nest CTA).
 * Always relays while a sink is registered — questionnaire continues after
 * the short intake echo window.
 */
export function reportAppChatReply(
  nodeId: string,
  content: string,
  prompt?: AppChatPrompt,
) {
  const text = (content || prompt?.content || "").trim();
  if (!text && !prompt) return;
  if (!relaySink) return;
  const echoTo = echoByNode.get(nodeId) ?? "";
  relaySink(nodeId, text || "(app)", echoTo, prompt);
}
