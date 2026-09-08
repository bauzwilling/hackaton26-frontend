import { useCallback, useReducer } from "react";
import type { Board, ConfiguratorState, LogEntry, PlateMaterial, RenderMode } from "../types";
import { DEFAULT_LOOK, FILM_THICKNESS, KIEFER_THICKNESS, STOCK_THICKNESSES, plateThickness } from "../types";
import {
  applyStockThickness,
  bbox,
  createBoard,
  rotateBoard,
  thinField,
  withPlateMaterial,
} from "../lib/geometry";
import { boardsFor, designFromSearch, type DesignId } from "../lib/designs";
import { boardName, designLabel, t } from "../lib/i18n";

// ── Log helper ──

function timestamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── Actions ──

type Action =
  | { type: "SET_BOARDS"; boards: Board[] }
  | { type: "SELECT"; id: number | null; additive?: boolean }
  | { type: "ADD_BOARD"; kind: "h" | "v" }
  | { type: "DELETE_SELECTED" }
  | { type: "ROTATE"; axis: "x" | "y" | "z" }
  | { type: "SET_DIM"; field: "w" | "h" | "d"; value: number }
  | { type: "MOVE_BOARD"; id: number; axis: "x" | "y" | "z"; value: number }
  | { type: "RESIZE_BOARD"; id: number; field: "w" | "h" | "d"; value: number }
  | { type: "SET_MODE"; mode: RenderMode }
  | { type: "SET_BOARD_LOOK"; look: string }
  | { type: "SET_BOARD_MATERIAL"; material: PlateMaterial }
  | { type: "SET_STOCK_THICKNESS"; material: PlateMaterial; thickness: number }
  | { type: "SET_LANG"; lang: "en" | "de" | "es" }
  | { type: "TOGGLE_DIMS" }
  | { type: "LOG"; msg: string }
  | { type: "LOAD_DESIGN"; design: DesignId };

interface FullState extends ConfiguratorState {
  logs: LogEntry[];
}

function createInitialState(): FullState {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return {
    boards: boardsFor(designFromSearch(search)),
    selIds: [],
    mode: "comic",
    dims: false,
    lang: "en",
    kieferThickness: KIEFER_THICKNESS,
    filmThickness: FILM_THICKNESS,
    logs: [],
  };
}

function addLog(state: FullState, msg: string): LogEntry[] {
  return [
    { id: Date.now() + Math.random(), time: timestamp(), msg },
    ...state.logs,
  ].slice(0, 120);
}

function selectedSet(state: FullState): Set<number> {
  return new Set(state.selIds);
}

function boardsOf(state: FullState, ids: Set<number>): Board[] {
  return state.boards.filter((b) => ids.has(b.id));
}

function selectionLabel(state: FullState, boards: Board[]): string {
  if (boards.length === 1) return boardName(state.lang, boards[0].name);
  return `${boards.length} ${String(t(state.lang, "parts"))}`;
}

function reducer(state: FullState, action: Action): FullState {
  switch (action.type) {
    case "SET_BOARDS":
      return { ...state, boards: action.boards, selIds: [] };

    case "SELECT": {
      if (action.id == null) {
        if (action.additive || !state.selIds.length) return state;
        return { ...state, selIds: [] };
      }
      if (!state.boards.some((b) => b.id === action.id)) return state;
      if (action.additive) {
        const has = state.selIds.includes(action.id);
        return {
          ...state,
          selIds: has
            ? state.selIds.filter((id) => id !== action.id)
            : [...state.selIds, action.id],
        };
      }
      if (state.selIds.length === 1 && state.selIds[0] === action.id) return state;
      return { ...state, selIds: [action.id] };
    }

    case "ADD_BOARD": {
      const b = createBoard(state.boards, action.kind, state.kieferThickness);
      return {
        ...state,
        boards: [...state.boards, b],
        selIds: [b.id],
        logs: addLog(state, `+ ${boardName(state.lang, b.name)} · ${b.w}×${b.h}×${b.d}`),
      };
    }

    case "DELETE_SELECTED": {
      const ids = selectedSet(state);
      if (!ids.size) return state;
      const removed = boardsOf(state, ids);
      return {
        ...state,
        boards: state.boards.filter((x) => !ids.has(x.id)),
        selIds: [],
        logs: addLog(state, `− ${selectionLabel(state, removed)}`),
      };
    }

    case "ROTATE": {
      const ids = selectedSet(state);
      const targets = boardsOf(state, ids);
      if (!targets.length) return state;
      return {
        ...state,
        boards: state.boards.map((x) =>
          ids.has(x.id) ? { ...x, ...rotateBoard(x, action.axis) } : x
        ),
        logs: addLog(
          state,
          `⟳ ${selectionLabel(state, targets)} · ${action.axis.toUpperCase()} 90°`
        ),
      };
    }

    case "SET_DIM": {
      const ids = selectedSet(state);
      if (!ids.size) return state;
      const thicknesses = { kiefer: state.kieferThickness, film: state.filmThickness };
      let changed = false;
      const boards = state.boards.map((x) => {
        if (!ids.has(x.id) || action.field === thinField(x)) return x;
        const min = plateThickness(x.material ?? "kiefer", thicknesses);
        const v = Math.max(min, Math.round(action.value || 0));
        if (x[action.field] === v) return x;
        changed = true;
        return { ...x, [action.field]: v };
      });
      return changed ? { ...state, boards } : state;
    }

    case "SET_BOARD_MATERIAL": {
      const ids = selectedSet(state);
      const targets = boardsOf(state, ids);
      if (!targets.length) return state;
      const thicknesses = { kiefer: state.kieferThickness, film: state.filmThickness };
      const nextTh = plateThickness(action.material, thicknesses);
      let changed = 0;
      const boards = state.boards.map((board) => {
        if (!ids.has(board.id) || board.material === action.material) return board;
        changed += 1;
        return withPlateMaterial(board, action.material, nextTh);
      });
      if (!changed) return state;
      return {
        ...state,
        boards,
        logs: addLog(state, `◧ ${selectionLabel(state, targets)} · ${action.material}`),
      };
    }

    case "SET_STOCK_THICKNESS": {
      if (!(STOCK_THICKNESSES as readonly number[]).includes(action.thickness)) return state;
      const key = action.material === "film" ? "filmThickness" : "kieferThickness";
      if (state[key] === action.thickness) return state;
      return {
        ...state,
        [key]: action.thickness,
        boards: state.boards.map((board) =>
          (board.material ?? "kiefer") === action.material
            ? applyStockThickness(board, action.thickness)
            : board
        ),
        logs: addLog(state, `◧ ${action.material} · ${action.thickness} mm`),
      };
    }

    case "MOVE_BOARD":
      return {
        ...state,
        boards: state.boards.map((x) =>
          x.id === action.id ? { ...x, [action.axis]: action.value } : x
        ),
      };

    case "RESIZE_BOARD":
      return {
        ...state,
        boards: state.boards.map((x) => {
          if (x.id !== action.id || action.field === thinField(x)) return x;
          return { ...x, [action.field]: action.value };
        }),
      };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_BOARD_LOOK": {
      const ids = selectedSet(state);
      const targets = boardsOf(state, ids);
      if (!targets.length) return state;
      let changed = 0;
      const boards = state.boards.map((board) => {
        if (!ids.has(board.id) || (board.look ?? DEFAULT_LOOK) === action.look) return board;
        changed += 1;
        return { ...board, look: action.look };
      });
      if (!changed) return state;
      return {
        ...state,
        boards,
        logs: addLog(state, `◧ ${selectionLabel(state, targets)} · ${action.look}`),
      };
    }

    case "SET_LANG":
      return { ...state, lang: action.lang };

    case "TOGGLE_DIMS":
      return { ...state, dims: !state.dims };

    case "LOG":
      return { ...state, logs: addLog(state, action.msg) };

    case "LOAD_DESIGN":
      return {
        ...state,
        boards: boardsFor(action.design),
        selIds: [],
        logs: addLog(state, `◇ ${designLabel(state.lang, action.design)}`),
      };

    default:
      return state;
  }
}

// ── Hook ──

export function useConfiguratorState() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const selectedBoards = state.selIds
    .map((id) => state.boards.find((b) => b.id === id))
    .filter((b): b is Board => !!b);
  const selectedBoard = selectedBoards[selectedBoards.length - 1] ?? null;
  const selId = selectedBoard?.id ?? null;
  const bb = bbox(state.boards);

  // Convenience dispatchers
  const select = useCallback(
    (id: number | null, additive?: boolean) => dispatch({ type: "SELECT", id, additive }),
    []
  );
  const addBoard = useCallback((kind: "h" | "v") => dispatch({ type: "ADD_BOARD", kind }), []);
  const deleteSelected = useCallback(() => dispatch({ type: "DELETE_SELECTED" }), []);
  const rotate = useCallback((axis: "x" | "y" | "z") => dispatch({ type: "ROTATE", axis }), []);
  const setDim = useCallback((field: "w" | "h" | "d", value: number) => dispatch({ type: "SET_DIM", field, value }), []);
  const setMode = useCallback((mode: RenderMode) => dispatch({ type: "SET_MODE", mode }), []);
  const setBoardLook = useCallback((look: string) => dispatch({ type: "SET_BOARD_LOOK", look }), []);
  const setBoardMaterial = useCallback(
    (material: PlateMaterial) => dispatch({ type: "SET_BOARD_MATERIAL", material }),
    []
  );
  const setStockThickness = useCallback(
    (material: PlateMaterial, thickness: number) =>
      dispatch({ type: "SET_STOCK_THICKNESS", material, thickness }),
    []
  );
  const setLang = useCallback((lang: "en" | "de" | "es") => dispatch({ type: "SET_LANG", lang }), []);
  const toggleDims = useCallback(() => dispatch({ type: "TOGGLE_DIMS" }), []);
  const setBoards = useCallback((boards: Board[]) => dispatch({ type: "SET_BOARDS", boards }), []);
  const loadDesign = useCallback((design: DesignId) => dispatch({ type: "LOAD_DESIGN", design }), []);
  const moveBoard = useCallback(
    (id: number, axis: "x" | "y" | "z", value: number) =>
      dispatch({ type: "MOVE_BOARD", id, axis, value }),
    []
  );
  const resizeBoard = useCallback(
    (id: number, field: "w" | "h" | "d", value: number) =>
      dispatch({ type: "RESIZE_BOARD", id, field, value }),
    []
  );

  return {
    ...state,
    selId,
    selectedBoard,
    selectedBoards,
    bbox: bb,
    dispatch,
    select,
    addBoard,
    deleteSelected,
    rotate,
    setDim,
    setMode,
    setBoardLook,
    setBoardMaterial,
    setStockThickness,
    setLang,
    toggleDims,
    setBoards,
    loadDesign,
    moveBoard,
    resizeBoard,
  };
}

export type ConfiguratorStore = ReturnType<typeof useConfiguratorState>;
