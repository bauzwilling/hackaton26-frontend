/**
 * Plyworks edit intents returned by Concierge.
 *
 * Layer 1: the chat contract. Layer 2 (on native Studio) calls applyPlyworksOps
 * against the configurator store. Until then this helper is unused.
 */

export const PLYWORKS_OP_ACTIONS = ["add", "rotate", "delete", "load_design"] as const;
export type PlyworksOpAction = (typeof PLYWORKS_OP_ACTIONS)[number];

export const PLYWORKS_OP_KINDS = ["h", "v"] as const;
export type PlyworksOpKind = (typeof PLYWORKS_OP_KINDS)[number];

export const PLYWORKS_OP_AXES = ["x", "y", "z"] as const;
export type PlyworksOpAxis = (typeof PLYWORKS_OP_AXES)[number];

export const PLYWORKS_DESIGNS = ["shelf", "table", "stool", "bench"] as const;
export type PlyworksDesignId = (typeof PLYWORKS_DESIGNS)[number];

export type PlyworksOpTarget = { id?: number; name?: string };

export type PlyworksOp =
  | { action: "add"; kind: PlyworksOpKind }
  | { action: "rotate"; axis: PlyworksOpAxis; target?: PlyworksOpTarget }
  | { action: "delete"; target?: PlyworksOpTarget }
  | { action: "load_design"; design: PlyworksDesignId };

export type PlyworksBoardSnapshot = {
  id: number;
  name?: string;
  w?: number;
  h?: number;
  d?: number;
  x?: number;
  y?: number;
  z?: number;
  material?: string;
};

/** Configurator methods Layer 2 will pass in. loadDesign is optional on older stores. */
export type PlyworksOpStore = {
  boards: Array<{ id: number; name: string }>;
  select: (id: number | null) => void;
  addBoard: (kind: PlyworksOpKind) => void;
  rotate: (axis: PlyworksOpAxis) => void;
  deleteSelected: () => void;
  loadDesign?: (design: PlyworksDesignId) => void;
};

function asDesign(raw: unknown): PlyworksDesignId | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return (PLYWORKS_DESIGNS as readonly string[]).includes(id) ? (id as PlyworksDesignId) : null;
}

function asKind(raw: unknown): PlyworksOpKind | null {
  if (typeof raw !== "string") return null;
  const kind = raw.trim().toLowerCase();
  return (PLYWORKS_OP_KINDS as readonly string[]).includes(kind) ? (kind as PlyworksOpKind) : null;
}

function asAxis(raw: unknown): PlyworksOpAxis | null {
  if (typeof raw !== "string") return null;
  const axis = raw.trim().toLowerCase();
  return (PLYWORKS_OP_AXES as readonly string[]).includes(axis) ? (axis as PlyworksOpAxis) : null;
}

function asTarget(raw: unknown): PlyworksOpTarget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const out: PlyworksOpTarget = {};
  if (typeof rec.id === "number" && Number.isFinite(rec.id)) out.id = Math.round(rec.id);
  if (typeof rec.name === "string" && rec.name.trim()) out.name = rec.name.trim();
  return out.id != null || out.name ? out : undefined;
}

function asOp(raw: unknown): PlyworksOp | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const action = typeof rec.action === "string" ? rec.action.trim().toLowerCase() : "";
  if (action === "add") {
    const kind = asKind(rec.kind);
    return kind ? { action: "add", kind } : null;
  }
  if (action === "rotate") {
    const axis = asAxis(rec.axis);
    if (!axis) return null;
    const target = asTarget(rec.target);
    return target ? { action: "rotate", axis, target } : { action: "rotate", axis };
  }
  if (action === "delete") {
    const target = asTarget(rec.target);
    return target ? { action: "delete", target } : { action: "delete" };
  }
  if (action === "load_design") {
    const design = asDesign(rec.design);
    return design ? { action: "load_design", design } : null;
  }
  return null;
}

export function asPlyworksOps(raw: unknown): PlyworksOp[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: PlyworksOp[] = [];
  for (const item of raw) {
    const op = asOp(item);
    if (op) out.push(op);
  }
  return out.length ? out : null;
}

function resolveTarget(
  boards: Array<{ id: number; name: string }>,
  target?: PlyworksOpTarget,
): number | null {
  if (!target) return null;
  if (target.id != null) {
    const byId = boards.find((b) => b.id === target.id);
    if (byId) return byId.id;
  }
  if (target.name) {
    const want = target.name.trim().toLowerCase();
    const byName = boards.find((b) => b.name.trim().toLowerCase() === want);
    if (byName) return byName.id;
  }
  return null;
}

/** Run normalized ops against a configurator store. Unused until Layer 2. */
export function applyPlyworksOps(store: PlyworksOpStore, ops: PlyworksOp[]): void {
  for (const op of ops) {
    if (op.action === "add") {
      store.addBoard(op.kind);
      continue;
    }
    if (op.action === "load_design") {
      store.loadDesign?.(op.design);
      continue;
    }
    const id = resolveTarget(store.boards, op.target);
    if (id != null) store.select(id);
    if (op.action === "rotate") store.rotate(op.axis);
    if (op.action === "delete") store.deleteSelected();
  }
}
