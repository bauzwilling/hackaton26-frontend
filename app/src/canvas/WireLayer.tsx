import type { WorkspaceEdge, WorkspaceNode } from "../context/workspace";

function pathFor(from: WorkspaceNode, to: WorkspaceNode) {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      x1 = from.x + from.w;
      y1 = fromCy;
      x2 = to.x;
      y2 = toCy;
    } else {
      x1 = from.x;
      y1 = fromCy;
      x2 = to.x + to.w;
      y2 = toCy;
    }
  } else if (dy >= 0) {
    x1 = fromCx;
    y1 = from.y + from.h;
    x2 = toCx;
    y2 = to.y;
  } else {
    x1 = fromCx;
    y1 = from.y;
    x2 = toCx;
    y2 = to.y + to.h;
  }
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
  const visible = edges.flatMap((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to || from.hidden || to.hidden) return [];
    return [{ from, to, hot: !!e.hot }];
  });

  if (!visible.length) return null;

  const minX = Math.min(0, ...nodes.map((n) => n.x));
  const minY = Math.min(0, ...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w), 2000);
  const maxY = Math.max(...nodes.map((n) => n.y + n.h), 2000);

  return (
    <svg
      className="wire-layer"
      width={maxX - minX + 80}
      height={maxY - minY + 80}
      style={{ left: minX, top: minY }}
      aria-hidden
    >
      <g transform={`translate(${-minX}, ${-minY})`}>
        {visible.map((p) => (
          <path
            key={`${p.from.id}-${p.to.id}`}
            d={pathFor(p.from, p.to)}
            className={`wire${p.hot ? " is-hot" : ""}`}
            fill="none"
          />
        ))}
      </g>
    </svg>
  );
}
