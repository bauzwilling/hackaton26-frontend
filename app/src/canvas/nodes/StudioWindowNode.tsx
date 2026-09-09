import { memo, useEffect, useRef, type NodeProps } from "react";
import {
  Handle,
  Position,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
} from "@xyflow/react";
import { Window } from "../../components/kit";
import { canDeleteNode, useWorkspace, type NodeKind, type WorkspaceApp, type WorkspaceNode } from "../../context/workspace";
import type { PlyworksDesign } from "../../lib/concierge";
import { useBoardHost } from "../boardHost";
import { NodeBody } from "../NodeBody";
import { sameStudioData } from "../flow/map";

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

const FIT_COMMIT_MS = 140;

function toWorkspaceNode(
  id: string,
  data: StudioNodeData,
  width: number | undefined,
  height: number | undefined,
): WorkspaceNode {
  return {
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
}

function StudioWindowNodeImpl({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<StudioFlowNode>) {
  const { close, hide, focus, fit } = useWorkspace();
  const { updateNode } = useReactFlow<StudioFlowNode>();
  const updateInternals = useUpdateNodeInternals();
  const host = useBoardHost();
  const fitTimer = useRef<number | null>(null);
  const lastFit = useRef({ w: 0, h: 0 });
  const node = toWorkspaceNode(id, data, width, height);
  const canClose = canDeleteNode(node);

  useEffect(() => () => {
    if (fitTimer.current) window.clearTimeout(fitTimer.current);
  }, []);

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
        onClose={canClose ? () => close(id) : undefined}
        onHide={() => hide(id)}
        onDrag={() => { /* React Flow dragHandle owns this */ }}
        onFit={(w, h) => {
          if (data.autoSize === false) return;
          const minW = data.kind === "note" ? 140 : 240;
          const nw = Math.max(minW, Math.round(w));
          const nh = Math.max(80, Math.round(h));
          if (Math.abs(lastFit.current.w - nw) < 2 && Math.abs(lastFit.current.h - nh) < 2) return;
          lastFit.current = { w: nw, h: nh };
          // RF owns live size; workspace gets a debounced persist snapshot.
          updateNode(id, (current) => {
            if (Math.abs((current.width ?? 0) - nw) < 2 && Math.abs((current.height ?? 0) - nh) < 2) {
              return {};
            }
            return {
              width: nw,
              height: nh,
              style: { ...current.style, width: nw, height: undefined },
            };
          });
          updateInternals(id);
          if (fitTimer.current) window.clearTimeout(fitTimer.current);
          fitTimer.current = window.setTimeout(() => {
            fitTimer.current = null;
            fit(id, nw, nh);
          }, FIT_COMMIT_MS);
        }}
      >
        <NodeBody node={node} viewport={host} />
      </Window>
    </div>
  );
}

export const StudioWindowNode = memo(StudioWindowNodeImpl, (prev, next) => (
  prev.id === next.id
  && prev.selected === next.selected
  && prev.width === next.width
  && prev.height === next.height
  && sameStudioData(prev.data, next.data)
));
