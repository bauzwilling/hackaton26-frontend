/**
 * Live handle from the native Plyworks Configurator to Concierge.
 * Multiple Plyworks windows can be open; ops target the active (focused) one.
 */
import {
  applyPlyworksOps,
  compactPlyworksBoards,
  type PlyworksBoardSnapshot,
  type PlyworksOp,
  type PlyworksOpStore,
} from "./plyworksOps";

const stores = new Map<string, PlyworksOpStore>();
let activeId: string | null = null;
let pending: PlyworksOp[] | null = null;

function currentStore(): PlyworksOpStore | undefined {
  if (activeId) {
    const active = stores.get(activeId);
    if (active) return active;
  }
  return [...stores.values()].at(-1);
}

export function setActivePlyworksSession(id: string | null) {
  if (id) activeId = id;
}

export function bindPlyworksStore(id: string, store: PlyworksOpStore | null) {
  if (!store) {
    stores.delete(id);
    if (activeId === id) {
      const rest = [...stores.keys()];
      activeId = rest[rest.length - 1] ?? null;
    }
    return;
  }
  stores.set(id, store);
  if (!activeId) activeId = id;
}

export function snapshotPlyworksBoards(): PlyworksBoardSnapshot[] {
  const store = currentStore();
  return store ? compactPlyworksBoards(store.boards) : [];
}

export function applyPlyworksSessionOps(ops: PlyworksOp[]) {
  if (!ops.length) return;
  const store = currentStore();
  if (store) {
    applyPlyworksOps(store, ops);
    pending = null;
    return;
  }
  pending = pending ? [...pending, ...ops] : ops;
}

/** Call after the configurator mounts so same-turn open + ops can flush. */
export function flushPlyworksOps() {
  if (!pending?.length) return;
  const store = currentStore();
  if (!store) return;
  const ops = pending;
  pending = null;
  applyPlyworksOps(store, ops);
}
