import { memo, useEffect, useRef } from "react";
import {
  Handle,
  Position,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Window, type WindowResizeBox } from "../../components/kit";
import { canDeleteNode, useWorkspace, type NodeKind, type WorkspaceApp, type WorkspaceNode } from "../../context/workspace";
import type { AppChatIntake } from "../../lib/appChat";
import type { PlyworksDesign } from "../../lib/concierge";
import { useBoardHost } from "../boardHost";
import { NodeBody } from "../NodeBody";
import { sameStudioData } from "../flow/map";
import { resizingIds } from "../windowResize";
import { flyHideWindow } from "../windowFly";

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
  chatIntake?: AppChatIntake;
  snapshotOriginalId?: string;
  locked?: boolean;
  railed?: boolean;
  autoSize?: boolean;
  flash?: boolean;
  flashKey?: number;
  enter?: boolean;
  preview?: boolean;
};

export type StudioFlowNode = Node<StudioNodeData, "studioWindow">;

const HANDLES: { id: string; position: Position }[] = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

const FIT_COMMIT_MS = 140;
const RESIZE_COMMIT_MS = 140;

/** Chat-related board windows stay fixed — Concierge + request log. */
function isChatKind(kind: NodeKind) {
  return kind === "text" || kind === "log";
}

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
    chatIntake: data.chatIntake,
    snapshotOriginalId: data.snapshotOriginalId,
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
  const { close, hide, focus, fit, resize, maximize, maximizedIds, setLocked } = useWorkspace();
  const { updateNode, getNode } = useReactFlow<StudioFlowNode>();
  const updateInternals = useUpdateNodeInternals();
  const zoom = useStore((s) => s.transform[2]);
  const host = useBoardHost();
  const fitTimer = useRef<number | null>(null);
  const resizeTimer = useRef<number | null>(null);
  const lastFit = useRef({ w: 0, h: 0 });
  const resizeOrigin = useRef({ x: 0, y: 0 });
  const lastResize = useRef({ w: 0, h: 0, x: 0, y: 0 });
  const node = toWorkspaceNode(id, data, width, height);
  const canClose = canDeleteNode(node);
  const maximized = maximizedIds.includes(id);
  const resizable = !isChatKind(data.kind) && !data.locked && !maximized;

  useEffect(() => () => {
    if (fitTimer.current) window.clearTimeout(fitTimer.current);
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    resizingIds.delete(id);
  }, [id]);

  const commitResize = (box: { w: number; h: number; x: number; y: number }) => {
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    resizeTimer.current = window.setTimeout(() => {
      resizeTimer.current = null;
      resize(id, box);
    }, RESIZE_COMMIT_MS);
  };

  const applyResize = (box: WindowResizeBox) => {
    const nextX = resizeOrigin.current.x + box.xDelta;
    const nextY = resizeOrigin.current.y;
    lastResize.current = { w: box.w, h: box.h, x: nextX, y: nextY };
    updateNode(id, (current) => ({
      width: box.w,
      height: box.h,
      position: { x: nextX, y: nextY },
      style: { ...current.style, width: box.w, height: box.h },
      data: current.data.autoSize === false ? current.data : { ...current.data, autoSize: false },
    }));
    updateInternals(id);
    commitResize(lastResize.current);
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
        selected={selected || !!data.preview}
        viewport={false}
        resizable={resizable}
        zoom={zoom}
        onFocus={() => focus(id)}
        onMaximize={data.kind === "app" ? () => maximize(id) : undefined}
        maximized={maximized}
        onClose={canClose ? () => close(id) : undefined}
        onHide={() => { void flyHideWindow(id, data.title, () => hide(id)); }}
        onLock={() => setLocked([id], !data.locked)}
        onDrag={() => { /* React Flow dragHandle owns this */ }}
        onResizeStart={() => {
          resizingIds.add(id);
          const n = getNode(id);
          resizeOrigin.current = {
            x: n?.position.x ?? 0,
            y: n?.position.y ?? 0,
          };
          lastResize.current = {
            w: width ?? n?.width ?? 0,
            h: height ?? n?.height ?? 0,
            x: resizeOrigin.current.x,
            y: resizeOrigin.current.y,
          };
        }}
        onResize={applyResize}
        onResizeEnd={() => {
          if (resizeTimer.current) {
            window.clearTimeout(resizeTimer.current);
            resizeTimer.current = null;
          }
          resize(id, lastResize.current);
          resizingIds.delete(id);
        }}
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
