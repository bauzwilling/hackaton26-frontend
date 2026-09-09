import type { Edge } from "@xyflow/react";
import type { WorkspaceNode } from "../../context/workspace";
import { pickHandles, type SystemEdge, type UserEdge } from "../../workspace/topology";
import type { StudioFlowNode, StudioNodeData } from "../nodes/StudioWindowNode";

function sameConfirmApps(a?: WorkspaceAppLike, b?: WorkspaceAppLike) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

type WorkspaceAppLike = StudioNodeData["confirmApps"];

export function sameStudioData(a: StudioNodeData, b: StudioNodeData) {
  return (
    a.kind === b.kind
    && a.title === b.title
    && a.code === b.code
    && a.appId === b.appId
    && a.query === b.query
    && a.body === b.body
    && a.parentId === b.parentId
    && a.routeLabel === b.routeLabel
    && a.routeWhy === b.routeWhy
    && a.design === b.design
    && a.locked === b.locked
    && a.railed === b.railed
    && a.autoSize === b.autoSize
    && a.flash === b.flash
    && a.flashKey === b.flashKey
    && a.enter === b.enter
    && sameConfirmApps(a.confirmApps, b.confirmApps)
  );
}

/** Keep the previous RF node reference when product fields and layout match. */
export function reuseFlowNode(prev: StudioFlowNode | undefined, next: StudioFlowNode): StudioFlowNode {
  if (!prev) return next;
  if (
    prev.position.x === next.position.x
    && prev.position.y === next.position.y
    && prev.width === next.width
    && prev.height === next.height
    && prev.hidden === next.hidden
    && prev.draggable === next.draggable
    && prev.connectable === next.connectable
    && prev.zIndex === next.zIndex
    && prev.selected === next.selected
    && sameStudioData(prev.data, next.data)
  ) {
    return prev;
  }
  if (sameStudioData(prev.data, next.data)) {
    return { ...next, data: prev.data, measured: prev.measured };
  }
  return { ...next, measured: prev.measured };
}

export function toFlowNode(
  n: WorkspaceNode,
  extras: Partial<Pick<StudioNodeData, "enter" | "flash" | "flashKey">> & { selected?: boolean } = {},
): StudioFlowNode {
  const data: StudioNodeData = {
    kind: n.kind,
    title: n.title,
    code: n.code,
    appId: n.appId,
    query: n.query,
    body: n.body,
    parentId: n.parentId,
    routeLabel: n.routeLabel,
    routeWhy: n.routeWhy,
    confirmApps: n.confirmApps,
    design: n.design,
    locked: n.locked,
    railed: n.railed,
    autoSize: n.autoSize,
    flash: extras.flash,
    flashKey: extras.flashKey,
    enter: extras.enter,
  };
  return {
    id: n.id,
    type: "studioWindow",
    position: { x: n.x, y: n.y },
    hidden: n.hidden,
    draggable: !n.locked,
    connectable: !n.locked,
    zIndex: n.z,
    width: n.w,
    height: n.h,
    style: { width: n.w, height: n.autoSize === false ? n.h : undefined },
    dragHandle: ".win-bar",
    selected: extras.selected,
    data,
  };
}

function boxOf(n: StudioFlowNode) {
  return {
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? n.width ?? (n.data.kind === "note" ? 240 : 340),
    h: n.measured?.height ?? n.height ?? 160,
  };
}

export function toSystemFlowEdge(edge: SystemEdge, nodes: StudioFlowNode[]): Edge {
  const from = nodes.find((n) => n.id === edge.from);
  const to = nodes.find((n) => n.id === edge.to);
  const handles = from && to ? pickHandles(boxOf(from), boxOf(to)) : { sourceHandle: "r", targetHandle: "l" };
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: "system",
    selectable: false,
    deletable: false,
    focusable: false,
    animated: !!edge.hot,
    data: { hot: !!edge.hot },
  };
}

export function toUserFlowEdge(edge: UserEdge): Edge {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: "user",
    selectable: true,
    deletable: true,
    data: { kind: "user" },
  };
}
