import { useCallback, useReducer } from "react";
import type { Board, ConfiguratorState, LogEntry, RenderMode } from "../types";
import { THICKNESS } from "../types";
import { bbox, createBoard, rotateBoard } from "../lib/geometry";
import { boardName } from "../lib/i18n";

// ── Log helper ──

function timestamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type Snapshot = LogEntry["snapshot"];

function snapshotOf(state: FullState): Snapshot {
  return {
    boards: state.boards.map((b) => ({ ...b })),
    selId: state.selId,
    mat: state.mat,
  };
}

function withChange(state: FullState, msg: string, patch: Partial<FullState>): FullState {
  return {
    ...state,
    ...patch,
    logs: [
      { id: Date.now() + Math.random(), time: timestamp(), msg, snapshot: snapshotOf(state) },
      ...state.logs,
    ].slice(0, 120),
  };
}

// ── Actions ──

type Action =
  | { type: "SET_BOARDS"; boards: Board[] }
  | { type: "SELECT"; id: number | null }
  | { type: "ADD_BOARD"; kind: "h" | "v" }
  | { type: "DELETE_SELECTED" }
  | { type: "ROTATE"; axis: "x" | "y" | "z" }
  | { type: "SET_DIM"; field: "w" | "h" | "d"; value: number }
  | { type: "MOVE_BOARD"; id: number; axis: "x" | "y" | "z"; value: number }
  | { type: "RESIZE_BOARD"; id: number; field: "w" | "h" | "d"; value: number }
  | { type: "SET_MODE"; mode: RenderMode }
  | { type: "SET_MATERIAL"; mat: string }
  | { type: "SET_LANG"; lang: "en" | "de" | "es" }
  | { type: "TOGGLE_DIMS" }
  | { type: "COMMIT"; msg: string; boards: Board[] }
  | { type: "UNDO" }
  | { type: "UNDO_TO"; id: number };

interface FullState extends ConfiguratorState {
  logs: LogEntry[];
}

const INITIAL_BOARDS: Board[] = [
  { id: 1, name: "Side left",  w: THICKNESS, h: 1200, d: 320, x: -391, y: 600,  z: 0 },
  { id: 2, name: "Side right", w: THICKNESS, h: 1200, d: 320, x: 391,  y: 600,  z: 0 },
  { id: 3, name: "Top",        w: 800, h: THICKNESS, d: 320, x: 0,    y: 1191, z: 0 },
  { id: 4, name: "Bottom",     w: 800, h: THICKNESS, d: 320, x: 0,    y: 9,    z: 0 },
  { id: 5, name: "Shelf 1",    w: 800, h: THICKNESS, d: 320, x: 0,    y: 420,  z: 0 },
  { id: 6, name: "Shelf 2",    w: 800, h: THICKNESS, d: 320, x: 0,    y: 800,  z: 0 },
  { id: 7, name: "Back",       w: 800, h: 1200, d: THICKNESS, x: 0,   y: 600,  z: -151 },
];

const INITIAL_STATE: FullState = {
  boards: INITIAL_BOARDS,
  selId: null,
  mode: "comic",
  mat: "birch",
  dims: false,
  lang: "en",
  logs: [],
};

function reducer(state: FullState, action: Action): FullState {
  switch (action.type) {
    case "SET_BOARDS":
      return { ...state, boards: action.boards, selId: null };

    case "SELECT":
      return { ...state, selId: action.id };

    case "ADD_BOARD": {
      const b = createBoard(state.boards, action.kind);
      return withChange(state, `+ ${boardName(state.lang, b.name)} · ${b.w}×${b.h}×${b.d}`, {
        boards: [...state.boards, b],
        selId: b.id,
      });
    }

    case "DELETE_SELECTED": {
      const b = state.boards.find((x) => x.id === state.selId);
      if (!b) return { ...state, boards: state.boards.filter((x) => x.id !== state.selId), selId: null };
      return withChange(state, `− ${boardName(state.lang, b.name)}`, {
        boards: state.boards.filter((x) => x.id !== state.selId),
        selId: null,
      });
    }

    case "ROTATE": {
      const b = state.boards.find((x) => x.id === state.selId);
      if (!b) return state;
      const patch = rotateBoard(b, action.axis);
      return withChange(state, `⟳ ${boardName(state.lang, b.name)} · ${action.axis.toUpperCase()} 90°`, {
        boards: state.boards.map((x) =>
          x.id === state.selId ? { ...x, ...patch } : x
        ),
      });
    }

    case "SET_DIM": {
      const v = Math.max(THICKNESS, Math.round(action.value || 0));
      const cur = state.boards.find((x) => x.id === state.selId);
      if (!cur || cur[action.field] === v) return state;
      return withChange(state, `▭ ${boardName(state.lang, cur.name)} · ${action.field.toUpperCase()} ${v}`, {
        boards: state.boards.map((x) =>
          x.id === state.selId ? { ...x, [action.field]: v } : x
        ),
      });
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
        boards: state.boards.map((x) =>
          x.id === action.id ? { ...x, [action.field]: action.value } : x
        ),
      };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_MATERIAL":
      if (state.mat === action.mat) return state;
      return withChange(state, `◧ ${action.mat}`, { mat: action.mat });

    case "SET_LANG":
      return { ...state, lang: action.lang };

    case "TOGGLE_DIMS":
      return { ...state, dims: !state.dims };

    case "COMMIT":
      return {
        ...state,
        logs: [
          {
            id: Date.now() + Math.random(),
            time: timestamp(),
            msg: action.msg,
            snapshot: {
              boards: action.boards.map((b) => ({ ...b })),
              selId: state.selId,
              mat: state.mat,
            },
          },
          ...state.logs,
        ].slice(0, 120),
      };

    case "UNDO": {
      const latest = state.logs[0];
      if (!latest) return state;
      return {
        ...state,
        boards: latest.snapshot.boards,
        selId: latest.snapshot.selId,
        mat: latest.snapshot.mat,
        logs: state.logs.slice(1),
      };
    }

    case "UNDO_TO": {
      const idx = state.logs.findIndex((e) => e.id === action.id);
      if (idx < 0) return state;
      const entry = state.logs[idx];
      return {
        ...state,
        boards: entry.snapshot.boards,
        selId: entry.snapshot.selId,
        mat: entry.snapshot.mat,
        logs: state.logs.slice(idx + 1),
      };
    }

    default:
      return state;
  }
}

// ── Hook ──

export function useConfiguratorState() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const selectedBoard = state.boards.find((b) => b.id === state.selId) ?? null;
  const bb = bbox(state.boards);

  // Convenience dispatchers
  const select = useCallback((id: number | null) => dispatch({ type: "SELECT", id }), []);
  const addBoard = useCallback((kind: "h" | "v") => dispatch({ type: "ADD_BOARD", kind }), []);
  const deleteSelected = useCallback(() => dispatch({ type: "DELETE_SELECTED" }), []);
  const rotate = useCallback((axis: "x" | "y" | "z") => dispatch({ type: "ROTATE", axis }), []);
  const setDim = useCallback((field: "w" | "h" | "d", value: number) => dispatch({ type: "SET_DIM", field, value }), []);
  const setMode = useCallback((mode: RenderMode) => dispatch({ type: "SET_MODE", mode }), []);
  const setMaterial = useCallback((mat: string) => dispatch({ type: "SET_MATERIAL", mat }), []);
  const setLang = useCallback((lang: "en" | "de" | "es") => dispatch({ type: "SET_LANG", lang }), []);
  const toggleDims = useCallback(() => dispatch({ type: "TOGGLE_DIMS" }), []);
  const setBoards = useCallback((boards: Board[]) => dispatch({ type: "SET_BOARDS", boards }), []);
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
  const commit = useCallback((msg: string, beforeBoards: Board[]) => {
    dispatch({ type: "COMMIT", msg, boards: beforeBoards });
  }, []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const undoTo = useCallback((id: number) => dispatch({ type: "UNDO_TO", id }), []);

  return {
    ...state,
    selectedBoard,
    bbox: bb,
    dispatch,
    select,
    addBoard,
    deleteSelected,
    rotate,
    setDim,
    setMode,
    setMaterial,
    setLang,
    toggleDims,
    setBoards,
    moveBoard,
    resizeBoard,
    commit,
    undo,
    undoTo,
  };
}

export type ConfiguratorStore = ReturnType<typeof useConfiguratorState>;
