import { memo } from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Window } from "../../components/kit";
import { canDeleteNode, useWorkspace, type NodeKind, type WorkspaceApp, type WorkspaceNode } from "../../context/workspace";
import type { PlyworksDesign } from "../../lib/concierge";
import { NodeBody } from "../NodeBody";

export type StudioNodeData = {
  kind: NodeKind;
  title: string;
  code: string;
  appId?: WorkspaceApp;
  query?: string;
  body?: string;
  parentId?: string;
  routeLabel?: string;
  routeWhy?: string;
  confirmApps?: WorkspaceApp[];
  design?: PlyworksDesign;
  locked?: boolean;
  railed?: boolean;
  autoSize?: boolean;
  flash?: boolean;
  flashKey?: number;
  enter?: boolean;
};

export type StudioFlowNode = Node<StudioNodeData, "studioWindow">;

const HANDLES: { id: string; position: Position }[] = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

export const StudioWindowNode = memo(function StudioWindowNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<StudioFlowNode>) {
  const { close, hide, focus, fit } = useWorkspace();
  const updateInternals = useUpdateNodeInternals();
  const node: WorkspaceNode = {
    id,
    kind: data.kind,
    title: data.title,
    code: data.code,
    appId: data.appId,
    query: data.query,
    body: data.body,
    parentId: data.parentId,
    routeLabel: data.routeLabel,
    routeWhy: data.routeWhy,
    confirmApps: data.confirmApps,
    design: data.design,
    x: 0,
    y: 0,
    z: 0,
    w: width ?? 0,
    h: height ?? 0,
    hidden: false,
    autoSize: data.autoSize,
    locked: data.locked,
    railed: data.railed,
  };

  return (
    <div className="studio-window-node">
      {HANDLES.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={h.position}
          isConnectable={!data.locked}
          className="studio-handle"
        />
      ))}
      <Window
        flow
        nodeId={id}
        title={data.title}
        code={data.code}
        z={0}
        x={0}
        y={0}
        width={width}
        height={height}
        kind={data.kind}
        query={data.query ?? data.design}
        autoSize={data.autoSize !== false}
        locked={data.locked}
        enter={data.enter}
        flash={data.flash}
        flashKey={data.flashKey}
        selected={selected}
        viewport={false}
        onFocus={() => focus(id)}
        onClose={canDeleteNode(node) ? () => close(id) : undefined}
        onHide={() => hide(id)}
        onDrag={() => { /* React Flow dragHandle owns this */ }}
        onFit={(w, h) => {
          fit(id, w, h);
          updateInternals(id);
        }}
      >
        <NodeBody node={node} viewport={{ width: 0, height: 0 }} />
      </Window>
    </div>
  );
});
