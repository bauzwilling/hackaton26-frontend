export type BoxParam = "BoxDepth" | "BoxHeight" | "BoxWidth";

export type InputLists = Record<BoxParam, Array<number | null>>;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  kind: "text" | "file" | "result" | "error" | "confirm";
  content: string;
  meta?: { choices?: string[] };
};

export type NestingCounts = {
  kSheetNr: number | null;
  fSheetNr: number | null;
};

export type SolveState = {
  isSolving: boolean;
  solveStage: string;
  solveError: string | null;
  solveOk: boolean;
  geometryCount: number;
  warnings: string[];
  sentParamNames: string[];
  computeProgress: {
    total: number;
    currentIndex: number | null;
    completedCount: number;
    failedCount: number;
  };
  rowErrors: Map<number, string>;
  variationStatuses: string[];
  perBoxNesting: NestingCounts;
  fullSetNesting: NestingCounts & { geometryPayload?: unknown };
};
