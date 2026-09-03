// ── Board / panel model ──

export const THICKNESS = 18; // mm, constant for all panels

export interface Board {
  id: number;
  name: string;
  w: number; // width  (mm)
  h: number; // height (mm)
  d: number; // depth  (mm)
  x: number; // centre x (mm, + = right)
  y: number; // centre y (mm, + = up / above floor)
  z: number; // centre z (mm, + = front)
}

// ── Materials ──

export interface Material {
  id: string;
  swatch: string;   // UI chip colour
  base: string;      // face colour
  grain: string | null; // grain tint pattern (null = solid colour)
  grainA: number;    // grain opacity
  rough: number;     // roughness (Three.js)
  comic: string;     // comic-mode face colour
  edge: string;      // edge-line colour
}

export const MATERIALS: Material[] = [
  { id: "birch",  swatch: "#e6d3a9", base: "#e3cfa4", grain: "rgba(163,132,84,A)", grainA: .22, rough: .68, comic: "#fffdf5", edge: "#a08653" },
  { id: "white",  swatch: "#f4f1eb", base: "#f4f1eb", grain: null, grainA: 0, rough: .35, comic: "#ffffff", edge: "#b9b3a7" },
  { id: "black",  swatch: "#2c2a28", base: "#2c2a28", grain: null, grainA: 0, rough: .38, comic: "#ffffff", edge: "#141312" },
  { id: "grey",   swatch: "#8d8b86", base: "#8d8b86", grain: null, grainA: 0, rough: .42, comic: "#ffffff", edge: "#57554f" },
  { id: "yellow", swatch: "#d9a520", base: "#d9a520", grain: null, grainA: 0, rough: .45, comic: "#ffffff", edge: "#8a6708" },
  { id: "blue",   swatch: "#2f5d7c", base: "#2f5d7c", grain: null, grainA: 0, rough: .45, comic: "#ffffff", edge: "#1b384c" },
  { id: "red",    swatch: "#b23a2b", base: "#b23a2b", grain: null, grainA: 0, rough: .45, comic: "#ffffff", edge: "#6f2118" },
  { id: "sage",   swatch: "#7a8a5e", base: "#7a8a5e", grain: null, grainA: 0, rough: .5,  comic: "#ffffff", edge: "#4c5839" },
];

// ── Render mode ──

export type RenderMode = "comic" | "real";

// ── Configurator state (the single source of truth) ──

export interface ConfiguratorState {
  boards: Board[];
  selId: number | null;
  mode: RenderMode;
  mat: string;        // material id
  dims: boolean;      // show dimension labels
  lang: "en" | "de" | "es";
}

// ── Log entry ──

export interface LogEntry {
  id: number;
  time: string;
  msg: string;
  snapshot: {
    boards: Board[];
    selId: number | null;
    mat: string;
  };
}

// ── Bounding box ──

export interface BBox {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}
