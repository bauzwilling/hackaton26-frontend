export type BubbleBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  phase: number;
};

export type WorldBounds = { left: number; top: number; right: number; bottom: number };

const DRIFT = 4.5;
const HOVER = 9;
const DAMP = 0.96;
const RESTITUTION = 0.12;
const MAX_SPEED = 42;
const SEPARATE = 0.18;

export function viewportToWorld(
  pan: { x: number; y: number },
  zoom: number,
  viewport: { width: number; height: number },
): WorldBounds {
  const pad = 12 / zoom;
  const bottomPad = 88 / zoom;
  return {
    left: (0 - pan.x) / zoom + pad,
    top: (0 - pan.y) / zoom + pad,
    right: (viewport.width - pan.x) / zoom - pad,
    bottom: (viewport.height - pan.y) / zoom - bottomPad,
  };
}

export function spawnVelocity() {
  return {
    vx: (Math.random() - 0.5) * 10,
    vy: (Math.random() - 0.5) * 8,
  };
}

export function capSpeed(b: BubbleBody, max = MAX_SPEED) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > max) {
    b.vx *= max / sp;
    b.vy *= max / sp;
  }
}

function collide(a: BubbleBody, b: BubbleBody, heldId: string | null) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return;

  let nx = 0;
  let ny = 0;
  let overlap = 0;
  if (ox < oy) {
    nx = a.x + a.w / 2 <= b.x + b.w / 2 ? 1 : -1;
    overlap = ox;
  } else {
    ny = a.y + a.h / 2 <= b.y + b.h / 2 ? 1 : -1;
    overlap = oy;
  }

  const push = overlap * SEPARATE;
  const aHeld = a.id === heldId;
  const bHeld = b.id === heldId;

  if (aHeld && !bHeld) {
    b.x += nx * push;
    b.y += ny * push;
  } else if (bHeld && !aHeld) {
    a.x -= nx * push;
    a.y -= ny * push;
  } else if (!aHeld && !bHeld) {
    const half = push * 0.5;
    a.x -= nx * half;
    a.y -= ny * half;
    b.x += nx * half;
    b.y += ny * half;
  }

  const dvx = b.vx - a.vx;
  const dvy = b.vy - a.vy;
  const vn = dvx * nx + dvy * ny;
  if (vn > 0) return;

  const impulse = vn * (1 + RESTITUTION) * 0.35;
  if (aHeld && !bHeld) {
    b.vx -= impulse * nx;
    b.vy -= impulse * ny;
  } else if (bHeld && !aHeld) {
    a.vx += impulse * nx;
    a.vy += impulse * ny;
  } else if (!aHeld && !bHeld) {
    a.vx += impulse * nx;
    a.vy += impulse * ny;
    b.vx -= impulse * nx;
    b.vy -= impulse * ny;
  }
}

function bounceWalls(b: BubbleBody, bounds: WorldBounds) {
  const maxW = Math.max(40, bounds.right - bounds.left);
  const maxH = Math.max(40, bounds.bottom - bounds.top);
  const w = Math.min(b.w, maxW);
  const h = Math.min(b.h, maxH);

  if (b.x < bounds.left) {
    b.x = bounds.left;
    b.vx = Math.abs(b.vx) * RESTITUTION;
  } else if (b.x + w > bounds.right) {
    b.x = bounds.right - w;
    b.vx = -Math.abs(b.vx) * RESTITUTION;
  }
  if (b.y < bounds.top) {
    b.y = bounds.top;
    b.vy = Math.abs(b.vy) * RESTITUTION;
  } else if (b.y + h > bounds.bottom) {
    b.y = bounds.bottom - h;
    b.vy = -Math.abs(b.vy) * RESTITUTION;
  }
}

export function stepBubbles(
  bodies: BubbleBody[],
  dt: number,
  bounds: WorldBounds,
  heldId: string | null,
) {
  const t = Math.min(Math.max(dt, 0), 0.05);
  for (const b of bodies) {
    if (b.id === heldId) continue;
    b.phase += t;
    b.vx += (Math.random() - 0.5) * DRIFT * t * 60 + Math.cos(b.phase * 0.55) * HOVER * 0.35 * t;
    b.vy += (Math.random() - 0.5) * DRIFT * t * 60 + Math.sin(b.phase * 0.7) * HOVER * t;
    b.vx *= DAMP;
    b.vy *= DAMP;
    capSpeed(b);
    b.x += b.vx * t;
    b.y += b.vy * t;
  }

  for (const b of bodies) {
    if (b.id === heldId) continue;
    bounceWalls(b, bounds);
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      collide(bodies[i], bodies[j], heldId);
    }
  }
}
