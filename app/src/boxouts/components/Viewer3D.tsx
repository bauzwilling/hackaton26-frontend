import { useEffect, useRef, useState } from "react";
import type { InputLists, SolveState } from "../types";
import {
  cloneInputListsForSolve,
  collectInvalidRowErrors,
  getVariationRowCount,
} from "../lib/csv.js";
import { processSolveSnapshot, runSolve } from "../lib/compute.js";
import { buildVariationStatuses, createSolveState, ROW_STATUS, SOLVE_STAGE } from "../lib/solveState.js";
import { createViewerScene } from "../lib/viewerScene.js";

type Props = {
  inputLists: InputLists | null;
  names: string[];
  quantities: number[];
  selectedIndex: number;
  solveRequestId: number;
  onSolveState: (state: SolveState) => void;
};

export function Viewer3D(props: Props) {
  const { inputLists, names, quantities, selectedIndex, solveRequestId, onSolveState } = props;
  const containerRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<ReturnType<typeof createViewerScene> | null>(null);
  const runRef = useRef(0);
  const cacheRef = useRef(new Map<number, unknown>());
  const warningsRef = useRef<string[]>([]);
  const geometryCountRef = useRef(0);
  const [renderTick, setRenderTick] = useState(0);
  const [state, setState] = useState<SolveState>(() => createSolveState());

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = createViewerScene(containerRef.current);
    sceneRef.current = scene;
    return () => {
      // Invalidates an in-flight poll before disposing the imperative scene.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++;
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    onSolveState(state);
  }, [state, onSolveState]);

  useEffect(() => {
    const doc = cacheRef.current.get(selectedIndex);
    if (doc) void sceneRef.current?.showDoc(doc);
    else sceneRef.current?.clearSceneMeshes();
  }, [selectedIndex, renderTick]);

  useEffect(() => {
    if (!inputLists || !solveRequestId) {
      cacheRef.current = new Map();
      warningsRef.current = [];
      geometryCountRef.current = 0;
      sceneRef.current?.clearSceneMeshes();
      // The solve lifecycle is owned by this effect; clearing its mirrored UI state is intentional.
      // oxlint-disable-next-line react/set-state-in-effect
      setState(createSolveState());
      return;
    }

    const runId = ++runRef.current;
    const lists = cloneInputListsForSolve(inputLists);
    const rowErrors = collectInvalidRowErrors(inputLists, names);
    cacheRef.current = new Map();
    warningsRef.current = [];
    geometryCountRef.current = 0;
    const total = getVariationRowCount(inputLists, names, quantities);
    setState({
      ...createSolveState(),
      isSolving: true,
      solveStage: SOLVE_STAGE.running,
      rowErrors,
      sentParamNames: ["BoxDepth", "BoxHeight", "BoxWidth"],
      computeProgress: { total, currentIndex: null, completedCount: 0, failedCount: rowErrors.size },
      variationStatuses: buildVariationStatuses({
        total, cache: cacheRef.current, rowErrors, currentIndex: null, isSolving: true,
      }),
    });

    void runSolve(lists, {
      quantities,
      shouldAbort: () => runId !== runRef.current,
      onSnapshot: (snapshot: Record<string, unknown>) => {
        if (runId !== runRef.current) return;
        const result = processSolveSnapshot(snapshot, {
          cache: cacheRef.current,
          warnings: warningsRef.current,
          rowErrors,
          geometryCount: geometryCountRef.current,
        });
        cacheRef.current = result.cache;
        warningsRef.current = result.warnings;
        geometryCountRef.current = result.geometryCount;
        for (const [index, message] of rowErrors) result.rowErrors.set(index, message);
        const byVariation = (snapshot as {
          perBoxNesting?: { byVariation?: Record<string, { kSheetNr?: number; fSheetNr?: number }> };
        }).perBoxNesting?.byVariation ?? {};
        let kSheetNr = 0;
        let fSheetNr = 0;
        let hasPerBox = false;
        for (const [key, entry] of Object.entries(byVariation)) {
          const quantity = quantities[Number(key)] ?? 1;
          kSheetNr += (entry.kSheetNr ?? 0) * quantity;
          fSheetNr += (entry.fSheetNr ?? 0) * quantity;
          hasPerBox = true;
        }
        const statuses = buildVariationStatuses({
          total,
          cache: result.cache,
          rowErrors: result.rowErrors,
          currentIndex: result.computeProgress.currentIndex,
          isSolving: true,
        });
        setState((current) => ({
          ...current,
          solveOk: result.cache.size > 0,
          geometryCount: result.geometryCount,
          warnings: result.warnings,
          rowErrors: result.rowErrors,
          computeProgress: result.computeProgress,
          variationStatuses: statuses,
          perBoxNesting: hasPerBox ? { kSheetNr, fSheetNr } : result.perBoxNesting,
          fullSetNesting: {
            ...current.fullSetNesting,
            ...result.fullSetNesting,
            geometryPayload: result.fullSetNesting.geometryPayload ?? current.fullSetNesting.geometryPayload,
          },
        }));
        setRenderTick((tick) => tick + 1);
      },
    }).then((snapshot: { status?: string }) => {
      if (runId !== runRef.current || snapshot.status === "aborted") return;
      setState((current) => ({
        ...current,
        isSolving: false,
        solveStage: SOLVE_STAGE.completed,
        computeProgress: { ...current.computeProgress, currentIndex: null },
        variationStatuses: buildVariationStatuses({
          total, cache: cacheRef.current, rowErrors: current.rowErrors, currentIndex: null, isSolving: false,
        }),
      }));
    }).catch((error: unknown) => {
      if (runId !== runRef.current) return;
      setState((current) => ({
        ...current,
        isSolving: false,
        solveStage: SOLVE_STAGE.failed,
        solveError: error instanceof Error ? error.message : "Solver failed",
      }));
    });
  }, [inputLists, names, quantities, solveRequestId]);

  const activeStatus = state.variationStatuses[selectedIndex] ?? ROW_STATUS.pending;
  const loading = state.isSolving && (activeStatus === ROW_STATUS.computing || activeStatus === ROW_STATUS.pending);
  const error = activeStatus === ROW_STATUS.failed ? state.rowErrors.get(selectedIndex) : null;

  return (
    <main ref={containerRef} className="boxouts-view">
      {loading && <div className="boxouts-view-overlay"><span className="boxouts-spinner" /><p>Computing geometry…</p></div>}
      {error && <div className="boxouts-view-overlay boxouts-view-error"><p>{error}</p></div>}
    </main>
  );
}
