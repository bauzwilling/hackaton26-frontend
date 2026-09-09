import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function SystemEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const hot = !!(data && typeof data === "object" && "hot" in data && data.hot);
  return (
    <BaseEdge
      id={id}
      path={path}
      className={`wire wire-system${hot ? " is-hot" : ""}`}
      interactionWidth={0}
    />
  );
}
