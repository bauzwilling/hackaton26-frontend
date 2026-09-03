/**
 * ThreeEngine — imperative Three.js scene for the Plyworks configurator.
 *
 * This class owns the renderer, scene, camera, orbit controls, and all
 * mesh-building logic.  It exposes a small API that the React wrapper
 * calls whenever state changes:
 *
 *   engine.rebuild(boards, selId, mode, matId, showDims)
 *   engine.resetView(bbox)
 *   engine.resize()
 *   engine.dispose()
 *
 * Pointer interaction (orbit, pick, drag handles) lives here too — the
 * engine calls back into React via the callbacks passed to the constructor.
 */

import * as THREE from "three";
import type { Board, Material, RenderMode } from "../types";
import { MATERIALS, THICKNESS as T } from "../types";
import { crossOverlap, contactSnap } from "./geometry";

export interface EngineCallbacks {
  onSelect: (id: number | null) => void;
  onMoveBoard: (id: number, axis: "x" | "y" | "z", value: number) => void;
  onResizeBoard: (id: number, field: "w" | "h" | "d", value: number) => void;
  onLog: (msg: string) => void;
}

export class ThreeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cam: THREE.PerspectiveCamera;
  private group: THREE.Group;
  private ground: THREE.Mesh;
  private blob: THREE.Mesh;
  private hemi: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private orbit = { theta: 0.7, phi: 1.2, r: 3.3, target: new THREE.Vector3(0, 0.6, 0) };
  private animId = 0;
  private stopped = false;
  private cb: EngineCallbacks;

  // Texture caches
  private plyTex: THREE.CanvasTexture | null = null;
  private woodCache: Record<string, THREE.CanvasTexture> = {};

  // Snapshot of last-applied state (for dirty checking)
  private lastBoards: Board[] = [];
  private lastSelId: number | null = null;
  private lastMode: RenderMode = "comic";
  private lastMat = "birch";

  // Drag state
  private drag: {
    h: { dim: "w" | "h" | "d"; ax: "x" | "y" | "z"; sign: number } | null;
    mv: { ax: "x" | "y" | "z" } | null;
    start: Board;
    sx: number;
    sy: number;
  } | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.cb = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f5ead8");

    this.cam = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / container.clientHeight,
      0.05,
      100
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.cursor = "grab";

    // Lights
    this.hemi = new THREE.HemisphereLight("#fff6e8", "#8a7657", 0.9);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight("#fff1dd", 0.55);
    this.keyLight.position.set(2.4, 4.2, 2.8);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const sc = this.keyLight.shadow.camera;
    sc.left = -2.2; sc.right = 2.2; sc.top = 2.6; sc.bottom = -1; sc.near = 0.5; sc.far = 12;
    this.scene.add(this.keyLight);

    this.fill = new THREE.DirectionalLight("#e8dcc4", 0.18);
    this.fill.position.set(-3, 1.6, -2);
    this.scene.add(this.fill);

    // Ground shadow
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 48),
      new THREE.MeshBasicMaterial({ color: "#c0b6a5", transparent: true, opacity: 0.42 })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.001;
    this.blob.scale.set(1, 0.5, 1);
    this.scene.add(this.blob);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.bindPointer(this.renderer.domElement);

    // Render loop
    const loop = () => {
      if (this.stopped) return;
      this.animId = requestAnimationFrame(loop);
      this.draw();
    };
    loop();
  }

  // ── Public API ──

  rebuild(
    boards: Board[],
    selId: number | null,
    mode: RenderMode,
    matId: string,
    showDims: boolean
  ) {
    this.lastBoards = boards;
    this.lastSelId = selId;
    this.lastMode = mode;
    this.lastMat = matId;
    this.applyMode(boards, selId, this.lastMode, this.lastMat, showDims);
  }

  resetView(bb: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) {
    const tgtY = (bb.y0 + bb.y1) / 2000;
    const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, bb.z1 - bb.z0) / 1000;
    const tgtR = Math.max(1.6, span * 1.9);
    const o = this.orbit;
    const from = { theta: o.theta, phi: o.phi, r: o.r, ty: o.target.y, tx: o.target.x, tz: o.target.z };
    const norm = (a: number) => {
      const two = Math.PI * 2;
      return ((a % two) + two) % two > Math.PI ? (a % two) - two : a % two;
    };
    from.theta = norm(from.theta);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 420);
      const e = 1 - Math.pow(1 - k, 3);
      o.theta = from.theta + (0.7 - from.theta) * e;
      o.phi = from.phi + (1.2 - from.phi) * e;
      o.r = from.r + (tgtR - from.r) * e;
      o.target.x = from.tx * (1 - e);
      o.target.z = from.tz * (1 - e);
      o.target.y = from.ty + (tgtY - from.ty) * e;
      this.draw();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  resize() {
    const el = this.renderer.domElement.parentElement;
    if (!el) return;
    this.cam.aspect = el.clientWidth / el.clientHeight;
    this.cam.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  }

  dispose() {
    this.stopped = true;
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }

  // ── Internals ──

  private mat(matId: string): Material {
    return MATERIALS.find((m) => m.id === matId) || MATERIALS[0];
  }

  private plyEdgeTexture(): THREE.CanvasTexture {
    if (this.plyTex) return this.plyTex;
    const cv = document.createElement("canvas");
    cv.width = 32; cv.height = 256;
    const g = cv.getContext("2d")!;
    const plies = 9, step = 256 / plies;
    for (let i = 0; i < plies; i++) {
      g.fillStyle = i % 2 ? "#d9bd8c" : "#eddcb8";
      g.fillRect(0, i * step, 32, step + 0.5);
      g.fillStyle = "rgba(140,106,61,0.28)";
      g.fillRect(0, i * step, 32, 1.2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    this.plyTex = tex;
    return tex;
  }

  private woodTexture(M: Material): THREE.CanvasTexture {
    if (this.woodCache[M.id]) return this.woodCache[M.id];
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 512;
    const g = cv.getContext("2d")!;
    g.fillStyle = M.base;
    g.fillRect(0, 0, 512, 512);
    if (M.grain) {
      for (let i = 0; i < 190; i++) {
        const y = Math.random() * 512;
        g.strokeStyle = M.grain.replace("A", (M.grainA * (0.3 + Math.random())).toFixed(3));
        g.lineWidth = 0.6 + Math.random() * 2.4;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32)
          g.lineTo(x, y + Math.sin((x + i * 40) / 90) * 5 + (Math.random() - 0.5) * 3);
        g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    this.woodCache[M.id] = tex;
    return tex;
  }

  private applyMode(
    boards: Board[],
    selId: number | null,
    mode: RenderMode,
    matId: string,
    showDims: boolean
  ) {
    const comic = mode === "comic";
    const M = this.mat(matId);

    // Clear meshes
    while (this.group.children.length) {
      const c = this.group.children.pop()!;
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
    }

    // Build board meshes
    boards.forEach((b) => {
      const w = b.w / 1000, h = b.h / 1000, d = b.d / 1000;
      const on = b.id === selId;
      const geo = new THREE.BoxGeometry(w, h, d);

      if (comic) {
        const mat = new THREE.MeshBasicMaterial({
          color: on ? "#ffe1d0" : "#ffffff",
          polygonOffset: true,
          polygonOffsetFactor: 1.5,
          polygonOffsetUnits: 1.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x / 1000, b.y / 1000, b.z / 1000);
        mesh.userData.id = b.id;
        this.group.add(mesh);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: on ? "#b2622d" : "#000000" })
        );
        edges.position.copy(mesh.position);
        this.group.add(edges);
      } else {
        // Realistic mode with plywood edge texture
        let face: THREE.MeshStandardMaterial;
        if (M.grain) {
          const tx = this.woodTexture(M).clone();
          tx.needsUpdate = true;
          tx.repeat.set(Math.max(0.4, w * 1.6), Math.max(0.4, h * 1.6));
          face = new THREE.MeshStandardMaterial({
            map: tx, color: on ? "#ffb779" : "#ffffff", roughness: M.rough, metalness: 0.02,
          });
        } else {
          face = new THREE.MeshStandardMaterial({
            color: on ? "#ffb779" : M.base, roughness: M.rough, metalness: 0.02,
          });
        }
        const mkEdge = (rot: number, rw: number, rh: number) => {
          const t2 = this.plyEdgeTexture().clone();
          t2.needsUpdate = true; t2.rotation = rot; t2.center.set(0.5, 0.5);
          t2.repeat.set(rw, rh);
          return new THREE.MeshStandardMaterial({
            map: t2, color: on ? "#ffb779" : "#ffffff", roughness: 0.75, metalness: 0.01,
          });
        };
        const thin = w <= h && w <= d ? "x" : h <= d ? "y" : "z";
        const px = thin === "x" ? face : mkEdge(Math.PI / 2, 1, Math.max(1, d * 34));
        const py = thin === "y" ? face : mkEdge(0, Math.max(1, w * 34), 1);
        const pz = thin === "z" ? face : mkEdge(Math.PI / 2, 1, Math.max(1, w * 34));
        const mesh = new THREE.Mesh(geo, [px, px, py, py, pz, pz]);
        mesh.position.set(b.x / 1000, b.y / 1000, b.z / 1000);
        mesh.userData.id = b.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        const eg = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: M.edge, transparent: true, opacity: 0.35 })
        );
        eg.position.copy(mesh.position);
        this.group.add(eg);
      }
    });

    // Selection handles (resize spheres + move arrows)
    const sel = boards.find((b) => b.id === selId);
    if (sel) {
      const axes: ["w" | "h" | "d", "x" | "y" | "z", number][] = [
        ["w", "x", 1], ["w", "x", -1], ["h", "y", 1], ["h", "y", -1], ["d", "z", 1], ["d", "z", -1],
      ];
      axes.forEach(([dim, ax, sign]) => {
        const handle = new THREE.Mesh(
          new THREE.SphereGeometry(0.026, 20, 14),
          new THREE.MeshBasicMaterial({ color: "#c67139", depthTest: false })
        );
        handle.renderOrder = 10;
        handle.position.set(sel.x / 1000, sel.y / 1000, sel.z / 1000);
        handle.position[ax] += (sign * sel[dim]) / 2000;
        handle.userData.handle = { dim, ax, sign };
        this.group.add(handle);
      });
      // Move arrows
      const cols: Record<string, string> = { x: "#c67139", y: "#7a8a5e", z: "#645c50" };
      (["x", "y", "z"] as const).forEach((ax) => {
        const L = 0.13;
        const half = sel[({ x: "w", y: "h", z: "d" } as const)[ax]] / 2000;
        const mk = (geo: THREE.BufferGeometry, dist: number) => {
          const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[ax], depthTest: false }));
          m.renderOrder = 11;
          m.position.set(sel.x / 1000, sel.y / 1000, sel.z / 1000);
          m.position[ax] += half + dist;
          if (ax === "x") m.rotation.z = -Math.PI / 2;
          if (ax === "z") m.rotation.x = Math.PI / 2;
          m.userData.move = { ax };
          this.group.add(m);
        };
        mk(new THREE.CylinderGeometry(0.006, 0.006, L, 12), L / 2);
        mk(new THREE.ConeGeometry(0.018, 0.042, 16), L + 0.021);
      });
    }

    // Scene settings per mode
    this.blob.visible = false;
    this.ground.visible = !comic;
    this.hemi.intensity = comic ? 1.35 : 0.5;
    this.keyLight.intensity = comic ? 0.35 : 1.05;
    this.fill.intensity = comic ? 0.1 : 0.25;
    this.keyLight.castShadow = !comic;
    this.renderer.setPixelRatio(comic ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = comic ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = comic ? 1 : 0.95;

    // TODO: dimension labels (addDims) — port when wiring up the dim overlay
    void showDims;

    this.draw();
  }

  private draw() {
    const o = this.orbit;
    this.cam.position.set(
      o.target.x + o.r * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + o.r * Math.cos(o.phi),
      o.target.z + o.r * Math.sin(o.phi) * Math.cos(o.theta)
    );
    this.cam.lookAt(o.target);
    this.renderer.render(this.scene, this.cam);
  }

  // ── Pointer / orbit / pick / drag ──

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  }

  private pick(e: PointerEvent) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.cam);
    const hits = ray.intersectObjects(
      this.group.children.filter((c) => (c as THREE.Mesh).userData.id),
      false
    );
    this.cb.onSelect(hits.length ? hits[0].object.userData.id : null);
  }

  private pickHandle(e: PointerEvent) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.cam);
    const hs = this.group.children.filter(
      (c) => c.userData.handle || c.userData.move
    );
    if (!hs.length) return null;
    const hit = ray.intersectObjects(hs, false)[0];
    if (!hit) return null;
    const b = this.lastBoards.find((x) => x.id === this.lastSelId);
    if (!b) return null;
    return {
      h: (hit.object.userData.handle as { dim: "w" | "h" | "d"; ax: "x" | "y" | "z"; sign: number } | undefined) || null,
      mv: (hit.object.userData.move as { ax: "x" | "y" | "z" } | undefined) || null,
      start: { ...b },
      sx: e.clientX,
      sy: e.clientY,
    };
  }

  private bindPointer(dom: HTMLElement) {
    let down: {
      x: number; y: number; t: number; p: number; moved: number; pan: boolean; tgt: THREE.Vector3;
    } | null = null;

    dom.addEventListener("pointerdown", (e) => {
      dom.setPointerCapture(e.pointerId);
      const grab = this.pickHandle(e);
      if (grab) {
        this.drag = grab;
        dom.style.cursor = "ns-resize";
        return;
      }
      const pan = e.button === 1 || e.shiftKey || e.metaKey;
      down = {
        x: e.clientX, y: e.clientY,
        t: this.orbit.theta, p: this.orbit.phi,
        moved: 0, pan, tgt: this.orbit.target.clone(),
      };
      dom.style.cursor = pan ? "move" : "grabbing";
      if (pan) e.preventDefault();
    });

    dom.addEventListener("pointermove", (e) => {
      if (this.drag) {
        this.handleDrag(e);
        return;
      }
      if (!down) {
        dom.style.cursor = this.pickHandle(e) ? "pointer" : "grab";
        return;
      }
      down.moved = Math.max(down.moved, Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y));
      if (down.pan) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        const scale = (this.orbit.r * 2 * Math.tan((this.cam.fov * Math.PI / 180) / 2)) / dom.clientHeight;
        const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.cam.matrix, 1);
        this.orbit.target
          .copy(down.tgt)
          .add(right.multiplyScalar(-dx * scale))
          .add(up.multiplyScalar(dy * scale));
        return;
      }
      this.orbit.theta = down.t - (e.clientX - down.x) * 0.008;
      this.orbit.phi = Math.min(1.6, Math.max(0.22, down.p - (e.clientY - down.y) * 0.006));
    });

    dom.addEventListener("pointerup", (e) => {
      if (this.drag) {
        this.finishDrag();
        dom.style.cursor = "grab";
        return;
      }
      if (down && down.moved < 5) this.pick(e);
      down = null;
      dom.style.cursor = "grab";
    });

    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.orbit.r = Math.min(8, Math.max(1.4, this.orbit.r * (1 + Math.sign(e.deltaY) * 0.09)));
    }, { passive: false });
  }

  private handleDrag(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    const b = d.start;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const toPx = (v: THREE.Vector3) => {
      const p = v.clone().project(this.cam);
      return new THREE.Vector2(((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height);
    };
    const ax0 = d.h ? d.h.ax : d.mv!.ax;
    const c = new THREE.Vector3(b.x / 1000, b.y / 1000, b.z / 1000);
    const axis = new THREE.Vector3(ax0 === "x" ? 1 : 0, ax0 === "y" ? 1 : 0, ax0 === "z" ? 1 : 0);
    const a = toPx(c.clone().add(axis.clone().multiplyScalar(0.1))).sub(toPx(c));
    const len = a.length();
    if (len < 0.5) return;
    const dirn = a.clone().divideScalar(len);
    const move = new THREE.Vector2(e.clientX - d.sx, e.clientY - d.sy);
    const mmPerPx = 100 / len;
    const dimOfAx: Record<string, "w" | "h" | "d"> = { x: "w", y: "h", z: "d" };

    if (d.mv) {
      // Move
      const raw = Math.round(move.dot(dirn) * mmPerPx);
      let pos = b[ax0 as "x" | "y" | "z"] + raw;
      // Snap
      const probe = { ...b, [ax0]: pos };
      let bestM: { w: number; pos: number } | null = null;
      const tolM = Math.max(20, Math.round(22 * mmPerPx));
      const dim = dimOfAx[ax0];
      const half = b[dim] / 2;
      for (const o of this.lastBoards) {
        if (o.id === b.id) continue;
        const near = crossOverlap(probe, o, ax0);
        const oh = o[dimOfAx[ax0]] / 2;
        for (const [p, s] of [
          [o[ax0 as "x" | "y" | "z"] - oh, -1],
          [o[ax0 as "x" | "y" | "z"] - oh, 1],
          [o[ax0 as "x" | "y" | "z"] + oh, -1],
          [o[ax0 as "x" | "y" | "z"] + oh, 1],
        ] as [number, number][]) {
          const gap = Math.abs(p - (pos + s * half));
          const w = near ? gap : gap + 6;
          if (gap <= tolM && (!bestM || w < bestM.w)) bestM = { w, pos: p - s * half };
        }
      }
      if (bestM) pos = Math.round(bestM.pos);
      this.cb.onMoveBoard(b.id, ax0 as "x" | "y" | "z", pos);
    } else if (d.h) {
      // Resize
      const delta = Math.round(move.dot(dirn) * mmPerPx) * d.h.sign;
      const fixed = b[d.h.ax] - (d.h.sign * b[d.h.dim]) / 2;
      let face = fixed + d.h.sign * Math.max(T, b[d.h.dim] + delta);
      // Snap
      const dimOf = dimOfAx[d.h.ax];
      const tol = Math.max(14, Math.round(16 * mmPerPx));
      let best: { p: number; gap: number } | null = null;
      for (const o of this.lastBoards) {
        if (o.id === b.id || !crossOverlap(b, o, d.h.ax)) continue;
        for (const p of [
          o[d.h.ax] - o[dimOf] / 2,
          o[d.h.ax] + o[dimOf] / 2,
        ]) {
          const gap = Math.abs(p - face);
          if (gap <= tol && (!best || gap < best.gap)) best = { p, gap };
        }
      }
      if (best) face = best.p;
      const size = Math.max(T, (face - fixed) * d.h.sign);
      const shift = ((size - b[d.h.dim]) * d.h.sign) / 2;
      this.cb.onResizeBoard(b.id, d.h.dim, size);
      this.cb.onMoveBoard(
        b.id,
        d.h.ax,
        Math.round(b[d.h.ax] + shift)
      );
    }
  }

  private finishDrag() {
    const d0 = this.drag;
    this.drag = null;
    // Contact snap on release for moves
    if (d0?.mv) {
      const now = this.lastBoards.find((x) => x.id === d0.start.id);
      if (now) {
        const p = contactSnap(this.lastBoards, now, d0.mv.ax, now[d0.mv.ax]);
        if (p !== null && p !== now[d0.mv.ax]) {
          this.cb.onMoveBoard(now.id, d0.mv.ax, p);
        }
      }
    }
  }
}
