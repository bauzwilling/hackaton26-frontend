export function loadRhino(): Promise<any>;
export function analyzeCsv(text: string): Promise<any>;
export function analyzeImage(body: unknown): Promise<any>;
export function parseBoxCommand(message: string, boxes: unknown[]): Promise<any>;
export function processSolveSnapshot(snapshot: unknown, accumulator: unknown): any;
export function runSolve(
  inputLists: unknown,
  options?: {
    onSnapshot?: (snapshot: any) => void;
    pollIntervalMs?: number;
    shouldAbort?: () => boolean;
    variationIndices?: number[];
    quantities?: number[];
  },
): Promise<any>;
