import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
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
import { CHAT_MOVE, LAYOUT_MINIMAP } from "../components/kit";
import { lookTokens, useSession } from "../context/session";
import {
  canDeleteNode,
  canDuplicateNode,
  CONCIERGE_ID,
  dockedChatWidth,
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

const MAP_CORNERS = [
  { id: "tl", closed: "tl", open: "br", d: "M12 2H2v10" },
  { id: "tr", closed: "tr", open: "bl", d: "M4 2h10v10" },
  { id: "bl", closed: "bl", open: "tr", d: "M12 14H2V4" },
  { id: "br", closed: "br", open: "tl", d: "M4 14h10V4" },
] as const;

function CornerMark({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function MapTip({ verb }: { verb: "Open" | "Close" }) {
  return (
    <span className="studio-tool-tip studio-map-tip" aria-hidden>
      <span>{verb}</span>
      <span>Minimap</span>
    </span>
  );
}

function MinimapDock({
  interactive,
  previewFill,
}: {
  interactive: boolean;
  previewFill: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(true);
  const [openTip, setOpenTip] = useState(true);
  const dock = useRef<HTMLDivElement>(null);
  const dimTimer = useRef<number | null>(null);
  const holdHot = useRef(false);

  useEffect(() => {
    if (!interactive) {
      setOpen(false);
      setOpenTip(true);
    }
  }, [interactive]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      if (dock.current?.contains(e.target as Node)) return;
      if (dimTimer.current) window.clearTimeout(dimTimer.current);
      dimTimer.current = window.setTimeout(() => setHot(false), 2000);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  useEffect(() => () => {
    if (dimTimer.current) window.clearTimeout(dimTimer.current);
  }, []);

  function heat() {
    if (dimTimer.current) window.clearTimeout(dimTimer.current);
    dimTimer.current = null;
    setHot(true);
  }

  function chill() {
    if (holdHot.current) return;
    if (dimTimer.current) window.clearTimeout(dimTimer.current);
    dimTimer.current = window.setTimeout(() => setHot(false), 2000);
  }

  if (!interactive) return null;

  const layout = reduce ? { duration: 0 } : CHAT_MOVE;

  function openMap() {
    holdHot.current = true;
    setOpenTip(false);
    setOpen(true);
    setHot(true);
    window.setTimeout(() => { holdHot.current = false; }, 600);
  }

  function closeMap() {
    if (dimTimer.current) window.clearTimeout(dimTimer.current);
    setOpenTip(false);
    setOpen(false);
  }

  return (
    <Panel position="bottom-right" className="studio-minimap-dock">
      <motion.div
        ref={dock}
        layout
        layoutId={LAYOUT_MINIMAP}
        className={`studio-minimap-shell nowheel nopan${open ? " is-open" : " chrome-icon"}`}
        transition={{ layout }}
        role={open ? undefined : "button"}
        tabIndex={open ? -1 : 0}
        aria-label={open ? undefined : "Open minimap"}
        aria-expanded={open}
        onPointerEnter={heat}
        onPointerLeave={chill}
        onClick={open ? undefined : openMap}
        onKeyDown={open ? undefined : (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openMap();
          }
        }}
        onLayoutAnimationComplete={() => {
          if (!open) setOpenTip(true);
        }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              className="studio-minimap-fade"
              initial={reduce ? false : { opacity: 0, scale: 0.2 }}
              animate={{ opacity: hot ? 0.9 : 0.2, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.2 }}
              transition={layout}
              style={{ transformOrigin: "100% 100%" }}
            >
              <MiniMap
                className="studio-minimap"
                pannable
                zoomable
                nodeStrokeWidth={2}
                nodeColor={(n) => {
                  const data = n.data as StudioFlowNode["data"];
                  if (n.selected || data.preview) return previewFill;
                  const kind = data.kind;
                  if (kind === "note") return "#e07a22";
                  if (kind === "log" || kind === "text") return "#9aa0a6";
                  return "#c5c0b6";
                }}
                nodeStrokeColor={(n) => {
                  const data = n.data as StudioFlowNode["data"];
                  if (n.selected || data.preview) return previewFill;
                  return "transparent";
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {MAP_CORNERS.map((c) => (
          <motion.button
            key={c.id}
            layout
            layoutId={`f2f-map-${c.id}`}
            type="button"
            className={`studio-minimap-corner at-${open ? c.open : c.closed}`}
            transition={{ layout }}
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            aria-label={open ? "Close minimap" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (open) closeMap();
            }}
          >
            <CornerMark d={c.d} />
            {open && <MapTip verb="Close" />}
          </motion.button>
        ))}
        {!open && openTip && <MapTip verb="Open" />}
      </motion.div>
    </Panel>
  );
}

function StudioBoardInner() {
  const {
    nodes: workspaceNodes,
    entries,
    edges: systemEdges,
    userEdges,
    viewport,
    flashIds,
    flashKey,
    previewId,
    fitRequest,
    close,
    duplicateNodes,
    setLocked,
    commitPositions,
    commitViewport,
    addUserEdge,
    removeUserEdges,
    unrail,
    enteringNodeIds,
    resuming,
    historyCollapsed,
  } = useWorkspace();
  const { showWires, showGrid, accent, theme } = useSession();
  const previewFill = lookTokens(theme, accent).acc;
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

  const interactive = workspaceNodes.some((n) => n.id !== CONCIERGE_ID && n.kind !== "log");
  const docked = interactive || entries.length > 0 || resuming;

  useFineWheelZoom(layer, {
    minZoom: flowInteraction.minZoom,
    maxZoom: flowInteraction.maxZoom,
    enabled: interactive,
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
      return workspaceNodes.filter((n) => !n.hidden).map((n) => {
        const old = prev.get(n.id);
        const mapped = toFlowNode(n, {
          selected: old?.selected,
          enter: (conciergeEnter && n.id === CONCIERGE_ID) || enteringNodeIds.includes(n.id),
          flash: flashIds.includes(n.id),
          flashKey,
          preview: previewId === n.id,
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
  }, [workspaceNodes, flashIds, flashKey, conciergeEnter, enteringNodeIds, previewId, setNodes]);

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
    const ids = fitRequest.ids.filter((id) => nodes.some((n) => n.id === id));
    if (!ids.length) return;
    const maxZoom = fitRequest.maxZoom;
    const chatW = dockedChatWidth(historyCollapsed);
    const chatGutter = docked ? Math.min(chatW, Math.max(0, host.width - 32)) + 32 : 16;
    const t = window.requestAnimationFrame(() => {
      void fitView({
        nodes: ids.map((id) => ({ id })),
        maxZoom,
        padding: {
          top: "48px",
          right: "16px",
          bottom: "56px",
          left: `${chatGutter}px`,
        },
        duration: 220,
      });
    });
    return () => window.cancelAnimationFrame(t);
  }, [fitRequest, fitView, nodes, docked, host.width, historyCollapsed]);

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
          onNodeDragStop={onNodeDragStop}
          onMoveStart={onMoveStart}
          onMove={onMove}
          onMoveEnd={onMoveEnd}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={() => { setAskMenu(null); setSelMenu(null); }}
          minZoom={flowInteraction.minZoom}
          maxZoom={flowInteraction.maxZoom}
          panOnDrag={interactive ? flowInteraction.panOnDrag : false}
          panOnScroll={flowInteraction.panOnScroll}
          zoomOnScroll={flowInteraction.zoomOnScroll}
          zoomOnPinch={interactive && flowInteraction.zoomOnPinch}
          zoomOnDoubleClick={flowInteraction.zoomOnDoubleClick}
          selectionOnDrag={interactive && flowInteraction.selectionOnDrag}
          selectionMode={flowInteraction.selectionMode}
          multiSelectionKeyCode={flowInteraction.multiSelectionKeyCode}
          deleteKeyCode={flowInteraction.deleteKeyCode}
          connectionMode={flowInteraction.connectionMode}
          snapToGrid={showGrid}
          snapGrid={flowInteraction.snapGrid}
          elevateNodesOnSelect={flowInteraction.elevateNodesOnSelect}
          onlyRenderVisibleElements={flowInteraction.onlyRenderVisibleElements}
          nodesDraggable={interactive}
          elementsSelectable={interactive}
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
          <MinimapDock interactive={interactive} previewFill={previewFill} />
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
