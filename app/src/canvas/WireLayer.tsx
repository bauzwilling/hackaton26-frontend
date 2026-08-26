import type { WorkspaceEdge, WorkspaceNode } from "../context/workspace";

function pathFor(from: WorkspaceNode, to: WorkspaceNode) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + 20;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function WireLayer({
  nodes,
  edges,
}: {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = edges
    .map((e) => ({ from: byId.get(e.from), to: byId.get(e.to) }))
    .filter((p): p is { from: WorkspaceNode; to: WorkspaceNode } => !!p.from && !!p.to && !p.from.hidden && !p.to.hidden);

  if (!visible.length) return null;

  const maxX = Math.max(...nodes.map((n) => n.x + n.w), 2000);
  const maxY = Math.max(...nodes.map((n) => n.y + n.h), 2000);

  return (
    <svg className="wire-layer" width={maxX + 80} height={maxY + 80} aria-hidden>
      {visible.map((p) => (
        <path key={`${p.from.id}-${p.to.id}`} d={pathFor(p.from, p.to)} className="wire" fill="none" />
      ))}
    </svg>
  );
}
