import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type OnBeforeDelete,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSession } from "../context/session";
import {
  canDeleteNode,
  canDuplicateNode,
  CONCIERGE_ID,
  LOG_ID,
  useWorkspace,
  type WorkspaceNode,
} from "../context/workspace";
import { AskMenu } from "./AskMenu";
import { BoardHostProvider } from "./boardHost";
import { SelectionMenu } from "./SelectionMenu";
import { defaultEdgeOptions, edgeTypes, flowInteraction, nodeTypes } from "./flow/defaults";
import { GRID_GAP } from "./flow/constants";
import { reuseFlowNode, toFlowNode, toSystemFlowEdge, toUserFlowEdge } from "./flow/map";
import { useFineWheelZoom } from "./flow/wheelZoom";
import type { StudioFlowNode } from "./nodes/StudioWindowNode";

function StudioBoardInner() {
  const {
    nodes: workspaceNodes,
    edges: systemEdges,
    userEdges,
    viewport,
    flashIds,
    flashKey,
    fitRequest,
    close,
    duplicateNodes,
    setLocked,
    commitPositions,
    commitViewport,
    addUserEdge,
    removeUserEdges,
    unrail,
  } = useWorkspace();
  const { showWires, showGrid } = useSession();
  const { fitView, screenToFlowPosition, getNodes, setViewport } = useReactFlow();
  const { zoom } = useViewport();
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const dragging = useRef(new Set<string>());
  const panMoved = useRef(false);
  const hadConcierge = useRef<boolean | null>(null);
  const [conciergeEnter, setConciergeEnter] = useState(false);
  const [askMenu, setAskMenu] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const [selMenu, setSelMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [host, setHost] = useState({ width: 1200, height: 700 });
  const layer = useRef<HTMLDivElement>(null);

  useFineWheelZoom(layer, {
    minZoom: flowInteraction.minZoom,
    maxZoom: flowInteraction.maxZoom,
  });

  useEffect(() => {
    const has = workspaceNodes.some((n) => n.id === CONCIERGE_ID);
    if (hadConcierge.current === null) {
      hadConcierge.current = has;
      return;
    }
    if (has && !hadConcierge.current) {
      setConciergeEnter(true);
      const t = window.setTimeout(() => setConciergeEnter(false), 520);
      hadConcierge.current = has;
      return () => window.clearTimeout(t);
    }
    hadConcierge.current = has;
  }, [workspaceNodes]);

  useEffect(() => {
    setNodes((current) => {
      const prev = new Map(current.map((n) => [n.id, n]));
      const draggingNow = dragging.current.size > 0;
      return workspaceNodes.map((n) => {
        const old = prev.get(n.id);
        const mapped = toFlowNode(n, {
          selected: old?.selected,
          enter: conciergeEnter && n.id === CONCIERGE_ID,
          flash: flashIds.includes(n.id),
          flashKey,
        });
        if (old && draggingNow) {
          mapped.position = old.position;
          mapped.selected = old.selected;
        }
        // RF owns live auto-size; keep measured box while workspace persist lags.
        if (old && n.autoSize !== false) {
          const rfW = old.width ?? old.measured?.width;
          const rfH = old.height ?? old.measured?.height;
          if (
            rfW
            && rfH
            && (Math.abs(rfW - (mapped.width ?? 0)) > 2 || Math.abs(rfH - (mapped.height ?? 0)) > 2)
            && (draggingNow || (old.position.x === mapped.position.x && old.position.y === mapped.position.y))
          ) {
            mapped.width = rfW;
            mapped.height = rfH;
            mapped.style = old.style;
            mapped.measured = old.measured;
          }
        } else if (old?.measured) {
          mapped.measured = old.measured;
        }
        return reuseFlowNode(old, mapped);
      });
    });
  }, [workspaceNodes, flashIds, flashKey, conciergeEnter, setNodes]);

  const derivedEdges = useMemo(() => {
    if (!showWires) return [] as Edge[];
    const sys = systemEdges.map((e) => toSystemFlowEdge(e, workspaceNodes));
    const user = userEdges.map(toUserFlowEdge);
    return [...sys, ...user];
  }, [showWires, systemEdges, userEdges, workspaceNodes]);

  useEffect(() => {
    setEdges((prev) => {
      const selected = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      const next = derivedEdges.map((e) => ({ ...e, selected: selected.has(e.id) }));
      if (
        prev.length === next.length
        && prev.every((e, i) => (
          e.id === next[i].id
          && e.source === next[i].source
          && e.target === next[i].target
          && e.sourceHandle === next[i].sourceHandle
          && e.targetHandle === next[i].targetHandle
          && e.type === next[i].type
          && e.animated === next[i].animated
          && e.selected === next[i].selected
        ))
      ) {
        return prev;
      }
      return next;
    });
  }, [derivedEdges, setEdges]);

  const viewportKey = `${viewport.x},${viewport.y},${viewport.zoom}`;
  const appliedViewport = useRef(viewportKey);
  useEffect(() => {
    if (appliedViewport.current === viewportKey) return;
    appliedViewport.current = viewportKey;
    void setViewport(viewport, { duration: 0 });
  }, [viewport, viewportKey, setViewport]);

  const far = Math.max(0, Math.min(1, (0.55 - zoom) / (0.55 - 0.18)));

  useEffect(() => {
    if (!fitRequest) return;
    const ids = fitRequest.ids;
    const maxZoom = fitRequest.maxZoom;
    const t = window.requestAnimationFrame(() => {
      void fitView({ nodes: ids.map((id) => ({ id })), maxZoom, padding: 0.2, duration: 220 });
    });
    return () => window.cancelAnimationFrame(t);
  }, [fitRequest, fitView]);

  const measureHost = useCallback(() => {
    const el = layer.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setHost({ width: box.width, height: box.height });
  }, []);

  useEffect(() => {
    measureHost();
    const el = layer.current;
    if (!el) return;
    const ro = new ResizeObserver(measureHost);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureHost]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const menuIds = selMenu?.ids ?? selectedNodes.map((n) => n.id);
  const selectedWorkspace = menuIds
    .map((id) => workspaceNodes.find((w) => w.id === id))
    .filter((n): n is WorkspaceNode => !!n);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    addUserEdge({
      id: `user:${c.source}->${c.target}:${c.sourceHandle ?? ""}-${c.targetHandle ?? ""}`,
      from: c.source,
      to: c.target,
      sourceHandle: c.sourceHandle ?? undefined,
      targetHandle: c.targetHandle ?? undefined,
    });
  }, [addUserEdge]);

  const onBeforeDelete: OnBeforeDelete<StudioFlowNode, Edge> = useCallback(async ({ nodes: gone, edges: goneEdges }) => {
    return {
      nodes: gone.filter((n) => canDeleteNode({ kind: (n.data as StudioFlowNode["data"]).kind, id: n.id })),
      edges: goneEdges.filter((e) => e.type === "user"),
    };
  }, []);

  const onNodesDelete = useCallback((gone: StudioFlowNode[]) => {
    for (const n of gone) close(n.id);
  }, [close]);

  const onEdgesDelete = useCallback((gone: Edge[]) => {
    removeUserEdges(gone.filter((e) => e.type === "user").map((e) => e.id));
  }, [removeUserEdges]);

  const onNodeDragStart: OnNodeDrag<StudioFlowNode> = useCallback((_, node) => {
    dragging.current.add(node.id);
    if (node.id === CONCIERGE_ID) unrail(CONCIERGE_ID);
  }, [unrail]);

  const onNodeDrag: OnNodeDrag<StudioFlowNode> = useCallback((_, node) => {
    if (node.id !== LOG_ID) return;
    setNodes((list) => {
      const log = list.find((n) => n.id === LOG_ID);
      const concierge = list.find((n) => n.id === CONCIERGE_ID);
      if (!log || !concierge || !concierge.data.railed) return list;
      const h = log.measured?.height ?? log.height ?? 280;
      const y = log.position.y + h + 24;
      if (concierge.position.x === log.position.x && concierge.position.y === y) return list;
      return list.map((n) => (n.id === CONCIERGE_ID ? { ...n, position: { x: log.position.x, y } } : n));
    });
  }, [setNodes]);

  const onNodeDragStop = useCallback(() => {
    dragging.current.clear();
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of getNodes()) positions[n.id] = { x: n.position.x, y: n.position.y };
    commitPositions(positions);
  }, [getNodes, commitPositions]);

  const onMoveStart = useCallback(() => {
    // Right/middle pan must not open AskMenu on pointer-up contextmenu.
    panMoved.current = false;
  }, []);

  const onMove = useCallback(() => {
    panMoved.current = true;
  }, []);

  const onMoveEnd = useCallback((_: unknown, next: { x: number; y: number; zoom: number }) => {
    appliedViewport.current = `${next.x},${next.y},${next.zoom}`;
    commitViewport(next);
  }, [commitViewport]);

  const onPaneContextMenu = useCallback((e: MouseEvent | ReactMouseEvent) => {
    e.preventDefault();
    if (panMoved.current) {
      panMoved.current = false;
      return;
    }
    measureHost();
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setSelMenu(null);
    setAskMenu({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      world: { x: flow.x, y: flow.y },
    });
  }, [measureHost, screenToFlowPosition]);

  const onNodeContextMenu = useCallback((e: ReactMouseEvent, node: StudioFlowNode) => {
    e.preventDefault();
    e.stopPropagation();
    setAskMenu(null);
    const ids = node.selected
      ? nodes.filter((n) => n.selected).map((n) => n.id)
      : [node.id];
    if (!node.selected) {
      setNodes((list) => list.map((n) => ({ ...n, selected: n.id === node.id })));
    }
    measureHost();
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    setSelMenu({ x: e.clientX - box.left, y: e.clientY - box.top, ids });
  }, [measureHost, nodes, setNodes]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const selected = nodes.filter((n) => n.selected).map((n) => n.id);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (!selected.length) return;
        e.preventDefault();
        duplicateNodes(selected);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodes, duplicateNodes]);

  const menuCanDelete = selectedWorkspace.some(canDeleteNode);
  const menuCanDuplicate = selectedWorkspace.some(canDuplicateNode);
  const menuLocked = selectedWorkspace.length > 0 && selectedWorkspace.every((n) => n.locked);

  return (
    <BoardHostProvider value={host}>
      <div
        className="studio-layer"
        data-help="studio-canvas"
        ref={layer}
        style={{ ["--studio-zoom" as string]: String(zoom), ["--win-far" as string]: String(far) }}
      >
        <ReactFlow<StudioFlowNode, Edge>
          className="studio-flow"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          defaultViewport={viewport}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={(c) => c.source !== c.target}
          onBeforeDelete={onBeforeDelete}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onMoveStart={onMoveStart}
          onMove={onMove}
          onMoveEnd={onMoveEnd}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={() => { setAskMenu(null); setSelMenu(null); }}
          minZoom={flowInteraction.minZoom}
          maxZoom={flowInteraction.maxZoom}
          panOnDrag={flowInteraction.panOnDrag}
          panOnScroll={flowInteraction.panOnScroll}
          zoomOnScroll={flowInteraction.zoomOnScroll}
          zoomOnPinch={flowInteraction.zoomOnPinch}
          zoomOnDoubleClick={flowInteraction.zoomOnDoubleClick}
          selectionOnDrag={flowInteraction.selectionOnDrag}
          selectionMode={flowInteraction.selectionMode}
          multiSelectionKeyCode={flowInteraction.multiSelectionKeyCode}
          deleteKeyCode={flowInteraction.deleteKeyCode}
          connectionMode={flowInteraction.connectionMode}
          snapToGrid={showGrid}
          snapGrid={flowInteraction.snapGrid}
          elevateNodesOnSelect={flowInteraction.elevateNodesOnSelect}
          onlyRenderVisibleElements={flowInteraction.onlyRenderVisibleElements}
          nodesDraggable
          elementsSelectable
          selectNodesOnDrag={false}
          connectionRadius={28}
          fitView={false}
        >
          {showGrid && (
            <Background
              id="studio-grid"
              variant={BackgroundVariant.Lines}
              gap={GRID_GAP}
              color="currentColor"
              className="studio-flow-grid"
            />
          )}
          <MiniMap
            className="studio-minimap"
            pannable
            zoomable
            nodeStrokeWidth={0}
            nodeColor={(n) => {
              const kind = (n.data as StudioFlowNode["data"]).kind;
              if (kind === "note") return "#e07a22";
              if (kind === "log" || kind === "text") return "#9aa0a6";
              return "#c5c0b6";
            }}
          />
        </ReactFlow>
        {askMenu && (
          <AskMenu
            at={askMenu}
            host={host}
            world={askMenu.world}
            onClose={() => setAskMenu(null)}
          />
        )}
        {selMenu && (
          <SelectionMenu
            at={selMenu}
            host={host}
            canDelete={menuCanDelete}
            canDuplicate={menuCanDuplicate}
            locked={menuLocked}
            onDelete={() => {
              for (const n of selectedWorkspace) {
                if (canDeleteNode(n)) close(n.id);
              }
            }}
            onDuplicate={() => { duplicateNodes(selectedWorkspace.map((n) => n.id)); }}
            onToggleLock={() => setLocked(selectedWorkspace.map((n) => n.id), !menuLocked)}
            onClose={() => setSelMenu(null)}
          />
        )}
      </div>
    </BoardHostProvider>
  );
}

export function StudioBoard() {
  return (
    <ReactFlowProvider>
      <StudioBoardInner />
    </ReactFlowProvider>
  );
}
