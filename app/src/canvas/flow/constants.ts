export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 12;
/** Camera ceiling for one-shot "bring into view" — must stay below maximize fill (~1). */
export const FIT_ZOOM_MAX = 0.9;
/**
 * Wheel zoom step size vs React Flow's default (1 = same as RF/d3-zoom).
 * Lower = more notches between min and max (finer zoom).
 */
export const ZOOM_WHEEL_MULTIPLIER = 0.35;
export const GRID_GAP = 34;
