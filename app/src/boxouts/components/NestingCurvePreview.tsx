import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { loadRhino } from "../lib/compute.js";

type Point = { x: number; y: number; z: number };
type Path = { d: string; stroke: string; dash?: string };
type ViewBox = { x: number; y: number; w: number; h: number };

const OUTPUTS = {
  kiefer: { sheet: "K_Sheet", nested: "K_Nested", text: "K_Text" },
  film: { sheet: "F_Sheet", nested: "F_Nested", text: "F_Text" },
};

function xyz(point: unknown): Point {
  const p = point as { x?: number; y?: number; z?: number } | number[];
  if (Array.isArray(p)) return { x: p[0], y: p[1], z: p[2] ?? 0 };
  return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
}

function pointsOf(geometry: Record<string, unknown>): Point[] {
  if (typeof geometry.pointCount === "number" && typeof geometry.point === "function") {
    return Array.from({ length: geometry.pointCount }, (_, index) => xyz((geometry.point as (i: number) => unknown)(index)));
  }
  const line = geometry.line as { from?: unknown; to?: unknown } | undefined;
  if (line?.from && line.to) return [xyz(line.from), xyz(line.to)];
  if (geometry.domain && typeof geometry.pointAt === "function") {
    const [start, end] = geometry.domain as number[];
    return Array.from({ length: 65 }, (_, index) => xyz((geometry.pointAt as (n: number) => unknown)(start + ((end - start) * index) / 64)));
  }
  return [];
}

async function decode(payload: unknown, material: keyof typeof OUTPUTS) {
  const rhino = await loadRhino();
  const result: Record<string, Point[][]> = { sheet: [], nested: [], text: [] };
  const names = OUTPUTS[material];
  const values = ((payload as { values?: unknown[]; Values?: unknown[] })?.values
    ?? (payload as { Values?: unknown[] })?.Values ?? []) as Array<Record<string, unknown>>;
  for (const output of values) {
    const name = String(output.ParamName ?? output.paramName ?? "");
    const layer = Object.entries(names).find(([, value]) => value === name)?.[0];
    if (!layer) continue;
    const tree = (output.InnerTree ?? output.innerTree ?? {}) as Record<string, Array<Record<string, unknown>>>;
    for (const branch of Object.values(tree)) {
      for (const leaf of branch) {
        if (!String(leaf.type ?? "").includes("Geometry")) continue;
        const raw = typeof leaf.data === "string" ? JSON.parse(leaf.data) : leaf.data;
        const geometry = rhino.CommonObject.decode(raw) as Record<string, unknown>;
        const points = pointsOf(geometry);
        if (points.length >= 2) result[layer].push(points);
      }
    }
  }
  return result;
}

export function NestingCurvePreview({ payload }: { payload: unknown }) {
  const container = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; view: ViewBox; width: number; height: number } | null>(null);
  const [material, setMaterial] = useState<keyof typeof OUTPUTS>("kiefer");
  const [paths, setPaths] = useState<Path[]>([]);
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: 100, h: 100 });

  useEffect(() => {
    const element = container.current;
    if (!element || !payload) return;
    const target = element;
    let cancelled = false;
    async function draw() {
      const width = target.clientWidth || 100;
      const height = target.clientHeight || 100;
      const layers = await decode(payload, material);
      if (cancelled) return;
      const all = Object.values(layers).flat(2);
      if (!all.length) { setPaths([]); return; }
      const minX = Math.min(...all.map((p) => p.x));
      const maxX = Math.max(...all.map((p) => p.x));
      const minY = Math.min(...all.map((p) => p.y));
      const maxY = Math.max(...all.map((p) => p.y));
      const scale = Math.min(width / (maxX - minX || 1), height / (maxY - minY || 1)) * 0.84;
      const colors = { sheet: "#c4bfb8", nested: "#57534e", text: "#a8a29e" };
      setPaths(Object.entries(layers).flatMap(([layer, lines]) => lines.map((line) => ({
        stroke: colors[layer as keyof typeof colors],
        dash: layer === "sheet" ? "6 4" : undefined,
        d: line.map((point, index) => `${index ? "L" : "M"}${width / 2 + (point.x - (minX + maxX) / 2) * scale} ${height / 2 - (point.y - (minY + maxY) / 2) * scale}`).join(" "),
      }))));
      setView({ x: 0, y: 0, w: width, h: height });
    }
    void draw();
    const observer = new ResizeObserver(() => void draw());
    observer.observe(target);
    return () => { cancelled = true; observer.disconnect(); };
  }, [payload, material]);

  function wheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
    setView((current) => ({ x: current.x + current.w * (1 - factor) / 2, y: current.y + current.h * (1 - factor) / 2, w: current.w * factor, h: current.h * factor }));
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, view, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start) return;
    setView({ ...start.view, x: start.view.x - ((event.clientX - start.x) / start.width) * start.view.w, y: start.view.y - ((event.clientY - start.y) / start.height) * start.view.h });
  }

  return (
    <section ref={container} className="boxouts-nesting-preview">
      <div className="boxouts-material-toggle">
        {(["kiefer", "film"] as const).map((value) => <button type="button" key={value} className={material === value ? "active" : ""} onClick={() => setMaterial(value)}>{value === "kiefer" ? "Kiefer" : "Film"}</button>)}
      </div>
      <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} onWheel={wheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onDoubleClick={() => setView({ x: 0, y: 0, w: container.current?.clientWidth || 100, h: container.current?.clientHeight || 100 })}>
        {paths.map((path, index) => <path key={index} d={path.d} stroke={path.stroke} strokeDasharray={path.dash} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
      </svg>
    </section>
  );
}
