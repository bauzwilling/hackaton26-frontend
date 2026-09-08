export type PlateMaterial = "kiefer" | "film";

export const STOCK_THICKNESSES = [15, 18, 21] as const;
export type StockThickness = (typeof STOCK_THICKNESSES)[number];

export const KIEFER_THICKNESS = 18;
export const FILM_THICKNESS = 18;
export const THICKNESS = KIEFER_THICKNESS;
export const DEFAULT_LOOK = "birch";

export type ThicknessMap = { kiefer: number; film: number };

export function plateThickness(
  material: PlateMaterial = "kiefer",
  thicknesses: ThicknessMap = { kiefer: KIEFER_THICKNESS, film: FILM_THICKNESS },
): number {
  return material === "film" ? thicknesses.film : thicknesses.kiefer;
}

export interface Board {
  id: number;
  name: string;
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  material: PlateMaterial;
  look?: string;
}

export interface Material {
  id: string;
  swatch: string;
  base: string;
  grain: string | null;
  grainA: number;
  rough: number;
  comic: string;
  edge: string;
}

export const MATERIALS: Material[] = [
  { id: "birch", swatch: "#e6d3a9", base: "#e3cfa4", grain: "rgba(163,132,84,A)", grainA: .22, rough: .68, comic: "#fffdf5", edge: "#a08653" },
  { id: "white", swatch: "#f4f1eb", base: "#f4f1eb", grain: null, grainA: 0, rough: .35, comic: "#ffffff", edge: "#b9b3a7" },
  { id: "black", swatch: "#2c2a28", base: "#2c2a28", grain: null, grainA: 0, rough: .38, comic: "#ffffff", edge: "#141312" },
  { id: "grey", swatch: "#8d8b86", base: "#8d8b86", grain: null, grainA: 0, rough: .42, comic: "#ffffff", edge: "#57554f" },
  { id: "yellow", swatch: "#d9a520", base: "#d9a520", grain: null, grainA: 0, rough: .45, comic: "#ffffff", edge: "#8a6708" },
  { id: "blue", swatch: "#2f5d7c", base: "#2f5d7c", grain: null, grainA: 0, rough: .45, comic: "#ffffff", edge: "#1b384c" },
  { id: "red", swatch: "#b23a2b", base: "#b23a2b", grain: null, grainA: 0, rough: .45, comic: "#ffffff", edge: "#6f2118" },
  { id: "sage", swatch: "#7a8a5e", base: "#7a8a5e", grain: null, grainA: 0, rough: .5, comic: "#ffffff", edge: "#4c5839" },
];

export type RenderMode = "comic" | "real";

export interface ConfiguratorState {
  boards: Board[];
  selIds: number[];
  mode: RenderMode;
  dims: boolean;
  lang: "en" | "de" | "es";
  kieferThickness: number;
  filmThickness: number;
}

export interface LogEntry {
  id: number;
  time: string;
  msg: string;
}

export interface BBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
