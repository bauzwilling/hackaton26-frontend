import type { BoxParam, InputLists } from "../types";

export const CSV_GH_INPUT_NAMES: BoxParam[];
export const CSV_GH_PARAM_BOUNDS: Record<BoxParam, { min: number; max: number }>;
export const CSV_GH_PARAM_LABELS: Record<BoxParam, string>;
export const CSV_CELL_MISSING: string;
export const CSV_CELL_EMPTY: string;
export const CSV_CELL_OUT_OF_RANGE: string;
export const CSV_PARSE_SOURCE: { local: string; llm: string };
export const CSV_PARSE_SOURCE_LABELS: Record<string, string>;

export function formatDefaultBoxName(index: number): string;
export function getVariationRowCount(lists: InputLists | null, names?: string[], quantities?: number[]): number;
export function coerceQuantity(value: unknown): number;
export function normalizeVariationPayload(payload: unknown): any;
export function spliceBoxRow(lists: InputLists, names: string[], index: number, quantities?: number[]): any;
export function appendVariations(lists: InputLists | null, names: string[], payload: unknown, quantities?: number[]): any;
export function summarizeVariationRows(lists: InputLists, names: string[], start?: number, quantities?: number[]): string[];
export function collectOutOfRangeMessages(lists: InputLists, names: string[], start?: number): string[];
export function coerceParamValue(value: unknown): number | null;
export function isParamValueValid(value: unknown, param: BoxParam): boolean;
export function formatVariationCellDisplay(value: unknown, options?: { param?: BoxParam; isName?: boolean }): string;
export function parseLenientLocalCsv(text: string): any;
export function mergeAnalyzeWithLocalParse(local: unknown, result: unknown): any;
export function tryParseCleanCsv(text: string): any;
export function inputListsToVariationRows(lists: InputLists, names: string[], quantities?: number[]): Array<Record<string, unknown>>;
export function getEditedCellKeys(source: InputLists, current: InputLists, names?: string[]): Set<string>;
export function collectInvalidRowErrors(lists: InputLists, names: string[]): Map<number, string>;
export function cloneInputListsForSolve(lists: InputLists): InputLists;
