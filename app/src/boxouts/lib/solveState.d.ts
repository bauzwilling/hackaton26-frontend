import type { SolveState } from "../types";

export const SOLVE_STAGE: { idle: string; running: string; completed: string; failed: string };
export const ROW_STATUS: { pending: string; computing: string; done: string; failed: string };
export function createSolveState(): SolveState;
export function buildVariationStatuses(options: {
  total: number;
  cache: Map<number, unknown>;
  rowErrors: Map<number, string>;
  currentIndex: number | null;
  isSolving: boolean;
  computingIndices?: number[] | null;
}): string[];
