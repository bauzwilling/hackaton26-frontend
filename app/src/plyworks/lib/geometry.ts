import type { Board, BBox } from "../types";
import { THICKNESS as T } from "../types";

// ── Bounding box ──

export function bbox(boards: Board[]): BBox {
  if (!boards.length)
    return { x0: -400, x1: 400, y0: 0, y1: 800, z0: -150, z1: 150 };
  return {
    x0: Math.min(...boards.map((b) => b.x - b.w / 2)),
    x1: Math.max(...boards.map((b) => b.x + b.w / 2)),
    y0: Math.min(...boards.map((b) => b.y - b.h / 2)),
    y1: Math.max(...boards.map((b) => b.y + b.h / 2)),
    z0: Math.min(...boards.map((b) => b.z - b.d / 2)),
    z1: Math.max(...boards.map((b) => b.z + b.d / 2)),
  };
}

// ── Board factory ──

export function nextId(boards: Board[]): number {
  return Math.max(0, ...boards.map((b) => b.id)) + 1;
}

export function createBoard(
  boards: Board[],
  kind: "h" | "v"
): Board {
  if (!boards.length) {
    return kind === "h"
      ? { id: 1, name: "Panel 1", w: 800, h: T, d: 300, x: 0, y: 400, z: 0 }
      : { id: 1, name: "Panel 1", w: T, h: 800, d: 300, x: 0, y: 400, z: 0 };
  }
  const bb = bbox(boards);
  const cx = (bb.x0 + bb.x1) / 2;
  const dz = bb.z1 - (bb.z0 + T);
  const cz = (bb.z1 + bb.z0 + T) / 2;
  const id = nextId(boards);
  const count =
    boards.filter((b) => (kind === "h" ? b.h === T : b.w === T)).length + 1;

  const b: Board =
    kind === "h"
      ? {
          id,
          name: `Shelf ${count}`,
          w: Math.round(bb.x1 - bb.x0 - 2 * T),
          h: T,
          d: Math.round(dz),
          x: Math.round(cx),
          y: Math.round((bb.y0 + bb.y1) / 2),
          z: Math.round(cz),
        }
      : {
          id,
          name: `Divider ${count}`,
          w: T,
          h: Math.round(bb.y1 - bb.y0 - 2 * T),
          d: Math.round(dz),
          x: Math.round(cx),
          y: Math.round((bb.y0 + bb.y1) / 2),
          z: Math.round(cz),
        };
  return b;
}

// ── Rotation ──

export function rotateBoard(board: Board, axis: "x" | "y" | "z"): Partial<Board> {
  if (axis === "z") return { w: board.h, h: board.w };
  if (axis === "x") return { h: board.d, d: board.h };
  return { w: board.d, d: board.w };
}

// ── Overlap test (for snapping) ──

export function crossOverlap(a: Board, b: Board, ax: string): boolean {
  const dimOf: Record<string, keyof Board> = { x: "w", y: "h", z: "d" };
  return (["x", "y", "z"] as const)
    .filter((k) => k !== ax)
    .every((k) => {
      const d = dimOf[k] as "w" | "h" | "d";
      return (
        Math.min(
          (a[k as "x" | "y" | "z"] as number) + (a[d] as number) / 2,
          (b[k as "x" | "y" | "z"] as number) + (b[d] as number) / 2
        ) -
          Math.max(
            (a[k as "x" | "y" | "z"] as number) - (a[d] as number) / 2,
            (b[k as "x" | "y" | "z"] as number) - (b[d] as number) / 2
          ) >
        -2
      );
    });
}

// ── Contact snap ──

export function contactSnap(
  boards: Board[],
  board: Board,
  ax: "x" | "y" | "z",
  pos: number
): number | null {
  const dimOf: Record<string, "w" | "h" | "d"> = { x: "w", y: "h", z: "d" };
  const half = board[dimOf[ax]] / 2;
  const probe = { ...board, [ax]: pos };
  let best: { w: number; pos: number } | null = null;

  for (const o of boards) {
    if (o.id === board.id) continue;
    const near = crossOverlap(probe, o, ax);
    const oh = o[dimOf[ax]] / 2;
    for (const p of [o[ax] - oh, o[ax] + oh]) {
      for (const s of [-1, 1]) {
        const target = p - s * half;
        const gap = Math.abs(target - pos);
        const w = near ? gap : gap + 8;
        if (gap <= 60 && (!best || w < best.w))
          best = { w, pos: Math.round(target) };
      }
    }
  }
  return best ? best.pos : null;
}

// ── Box vertices (for export) ──
// Model: y = up, z = front.  CAD convention: Z = up → (x, -z, y)

function boxVerts(b: Board): number[][] {
  const hx = b.w / 2, hy = b.h / 2, hz = b.d / 2;
  const P = (sx: number, sy: number, sz: number) => [
    b.x + sx * hx,
    -(b.z + sz * hz),
    b.y + sy * hy,
  ];
  return [
    P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1),
    P(-1, -1,  1), P(1, -1,  1), P(1, 1,  1), P(-1, 1,  1),
  ];
}

const FACES = [
  [1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2],
  [2, 6, 7, 3], [3, 7, 8, 4], [4, 8, 5, 1],
];

function layerName(b: Board, i: number): string {
  return (
    (b.name || "Panel")
      .replace(/[^A-Za-z0-9äöüÄÖÜß _-]/g, "")
      .replace(/\s+/g, "_") +
    "_" +
    (i + 1)
  );
}

function downloadFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── DXF export ──

export function exportDXF(boards: Board[]) {
  const out: string[] = [];
  const p = (c: number | string, v: number | string) => {
    out.push(String(c));
    out.push(String(v));
  };
  p(0, "SECTION"); p(2, "ENTITIES");
  boards.forEach((b, i) => {
    const lay = layerName(b, i);
    const v = boxVerts(b);
    p(0, "POLYLINE"); p(8, lay); p(66, 1); p(70, 64); p(71, 8); p(72, 6);
    p(10, 0); p(20, 0); p(30, 0);
    v.forEach((pt) => {
      p(0, "VERTEX"); p(8, lay); p(70, 192);
      p(10, pt[0]); p(20, pt[1]); p(30, pt[2]);
    });
    FACES.forEach((f) => {
      p(0, "VERTEX"); p(8, lay); p(70, 128);
      p(10, 0); p(20, 0); p(30, 0);
      p(71, f[0]); p(72, f[1]); p(73, f[2]); p(74, f[3]);
    });
    p(0, "SEQEND"); p(8, lay);
  });
  p(0, "ENDSEC"); p(0, "EOF");
  downloadFile("plyworks-18mm.dxf", out.join("\r\n"));
}

// ── STL export ──

export function exportSTL(boards: Board[]) {
  const lines: string[] = [];
  boards.forEach((b, i) => {
    const v = boxVerts(b);
    lines.push("solid " + layerName(b, i));
    FACES.forEach((f) => {
      const q = f.map((k) => v[k - 1]);
      const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
      const w = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
      let n = [
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      ];
      const L = Math.hypot(n[0], n[1], n[2]) || 1;
      n = n.map((c) => c / L);
      [[q[0], q[1], q[2]], [q[0], q[2], q[3]]].forEach((tri) => {
        lines.push("  facet normal " + n.join(" "));
        lines.push("    outer loop");
        tri.forEach((t) => lines.push("      vertex " + t.join(" ")));
        lines.push("    endloop");
        lines.push("  endfacet");
      });
    });
    lines.push("endsolid " + layerName(b, i));
  });
  downloadFile("plyworks-18mm.stl", lines.join("\n"));
}

// ── STEP export ──
// Full AP214 BRep — each board becomes its own MANIFOLD_SOLID_BREP.
// Ported verbatim from the original; this is the most valuable piece.

export function exportSTEP(boards: Board[]) {
  const F = (n: number) => {
    const r = Math.round(n * 1e6) / 1e6;
    return Number.isInteger(r) ? r + "." : String(r);
  };
  const L: string[] = [];
  let id = 0;
  const E = (body: string) => {
    const r = "#" + ++id;
    L.push(r + " = " + body + ";");
    return r;
  };

  const appCtx = E("APPLICATION_CONTEXT('automotive design')");
  E("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000," + appCtx + ")");
  const prodCtx = E("PRODUCT_CONTEXT(''," + appCtx + ",'mechanical')");
  const defCtx = E("PRODUCT_DEFINITION_CONTEXT('part definition'," + appCtx + ",'design')");
  const lenU = E("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )");
  const angU = E("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )");
  const solU = E("( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )");
  const unc = E("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07)," + lenU + ",'distance_accuracy_value','confusion accuracy')");
  const ctx = E("( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((" + unc + ")) GLOBAL_UNIT_ASSIGNED_CONTEXT((" + lenU + "," + angU + "," + solU + ")) REPRESENTATION_CONTEXT('Context #1','3D Context') )");

  const dir: Record<string, string> = {};
  (
    [
      ["px", [1, 0, 0]], ["nx", [-1, 0, 0]],
      ["py", [0, 1, 0]], ["ny", [0, -1, 0]],
      ["pz", [0, 0, 1]], ["nz", [0, 0, -1]],
    ] as [string, number[]][]
  ).forEach(([k, v]) => {
    dir[k] = E("DIRECTION('',(" + v.map(F).join(",") + "))");
  });

  boards.forEach((b, bi) => {
    const name = layerName(b, bi);
    const x0 = b.x - b.w / 2;
    const y0 = -(b.z + b.d / 2);
    const z0 = b.y - b.h / 2;
    const S = [b.w, b.d, b.h];
    const corner = (i: number, j: number, k: number) => [
      x0 + i * S[0], y0 + j * S[1], z0 + k * S[2],
    ];
    const idx = (i: number, j: number, k: number) => i + 2 * j + 4 * k;

    const pts: string[] = [];
    const vtx: string[] = [];
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const c = corner(i, j, k);
          const n = idx(i, j, k);
          pts[n] = E("CARTESIAN_POINT('',(" + c.map(F).join(",") + "))");
          vtx[n] = E("VERTEX_POINT(''," + pts[n] + ")");
        }

    const edges: Record<string, { ref: string; from: number }> = {};
    const addEdge = (a: number, c: number, axis: number) => {
      const key = Math.min(a, c) + "-" + Math.max(a, c);
      const d = axis === 0 ? dir.px : axis === 1 ? dir.py : dir.pz;
      const vec = E("VECTOR(''," + d + "," + F(S[axis]) + ")");
      const line = E("LINE(''," + pts[Math.min(a, c)] + "," + vec + ")");
      edges[key] = {
        ref: E("EDGE_CURVE(''," + vtx[Math.min(a, c)] + "," + vtx[Math.max(a, c)] + "," + line + ",.T.)"),
        from: Math.min(a, c),
      };
    };
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++) addEdge(idx(0, j, k), idx(1, j, k), 0);
    for (let k = 0; k < 2; k++)
      for (let i = 0; i < 2; i++) addEdge(idx(i, 0, k), idx(i, 1, k), 1);
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) addEdge(idx(i, j, 0), idx(i, j, 1), 2);

    const faceDefs = [
      { loop: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], n: dir.nz, r: dir.px },
      { loop: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], n: dir.pz, r: dir.px },
      { loop: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], n: dir.ny, r: dir.px },
      { loop: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], n: dir.py, r: dir.px },
      { loop: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], n: dir.nx, r: dir.py },
      { loop: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], n: dir.px, r: dir.py },
    ];

    const faces = faceDefs.map((fd) => {
      const ns = fd.loop.map((c) => idx(c[0], c[1], c[2]));
      const oriented = ns.map((n0, q) => {
        const n1 = ns[(q + 1) % 4];
        const e = edges[Math.min(n0, n1) + "-" + Math.max(n0, n1)];
        return E("ORIENTED_EDGE('',*,*," + e.ref + "," + (e.from === n0 ? ".T." : ".F.") + ")");
      });
      const loop = E("EDGE_LOOP('',(" + oriented.join(",") + "))");
      const bound = E("FACE_OUTER_BOUND(''," + loop + ",.T.)");
      const place = E("AXIS2_PLACEMENT_3D(''," + pts[ns[0]] + "," + fd.n + "," + fd.r + ")");
      const plane = E("PLANE(''," + place + ")");
      return E("ADVANCED_FACE('',(" + bound + ")," + plane + ",.T.)");
    });

    const shell = E("CLOSED_SHELL('',(" + faces.join(",") + "))");
    const brep = E("MANIFOLD_SOLID_BREP('" + name + "'," + shell + ")");
    const org = E("CARTESIAN_POINT('',(0.,0.,0.))");
    const axis = E("AXIS2_PLACEMENT_3D(''," + org + "," + dir.pz + "," + dir.px + ")");
    const rep = E("ADVANCED_BREP_SHAPE_REPRESENTATION('" + name + "',(" + axis + "," + brep + ")," + ctx + ")");
    const prod = E("PRODUCT('" + name + "','" + name + "',''," + "(" + prodCtx + "))");
    E("PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(" + prod + "))");
    const pdf = E("PRODUCT_DEFINITION_FORMATION('','', " + prod + ")");
    const pd = E("PRODUCT_DEFINITION('design',''," + pdf + "," + defCtx + ")");
    const pds = E("PRODUCT_DEFINITION_SHAPE('','', " + pd + ")");
    E("SHAPE_DEFINITION_REPRESENTATION(" + pds + "," + rep + ")");
  });

  const head = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('Plyworks 18 mm plywood'),'2;1');",
    `FILE_NAME('plyworks-18mm.step','${new Date().toISOString().slice(0, 19)}',('Plyworks'),(''),'Plyworks','Plyworks','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    "ENDSEC;",
    "DATA;",
  ];
  downloadFile(
    "plyworks-18mm.step",
    head.concat(L, ["ENDSEC;", "END-ISO-10303-21;"]).join("\n")
  );
}
