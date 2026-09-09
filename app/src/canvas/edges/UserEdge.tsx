import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function UserEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <BaseEdge
      id={id}
      path={path}
      className={`wire wire-user${selected ? " is-hot" : ""}`}
    />
  );
}
