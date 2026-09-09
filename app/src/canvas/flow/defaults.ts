import { ConnectionMode, SelectionMode, type DefaultEdgeOptions, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import { GRID_GAP, ZOOM_MAX, ZOOM_MIN } from "./constants";
import { StudioWindowNode } from "../nodes/StudioWindowNode";
import { SystemEdge } from "../edges/SystemEdge";
import { UserEdgeView } from "../edges/UserEdge";

export { GRID_GAP, ZOOM_MAX, ZOOM_MIN };

export const nodeTypes = {
  studioWindow: StudioWindowNode,
} satisfies NodeTypes;

export const edgeTypes = {
  system: SystemEdge,
  user: UserEdgeView,
} satisfies EdgeTypes;

export const defaultEdgeOptions: DefaultEdgeOptions = {
  interactionWidth: 24,
};

export const flowInteraction = {
  minZoom: ZOOM_MIN,
  maxZoom: ZOOM_MAX,
  panOnDrag: [1, 2] as number[],
  panOnScroll: false,
  /** Wheel zoom is handled by useSmoothWheelZoom for a lerped feel. */
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  selectionOnDrag: true,
  selectionMode: SelectionMode.Partial,
  multiSelectionKeyCode: "Shift" as const,
  deleteKeyCode: ["Delete", "Backspace"] as string[],
  connectionMode: ConnectionMode.Loose,
  snapGrid: [GRID_GAP, GRID_GAP] as [number, number],
  nodesFocusable: true,
  edgesFocusable: true,
  elevateNodesOnSelect: true,
  onlyRenderVisibleElements: true,
};
