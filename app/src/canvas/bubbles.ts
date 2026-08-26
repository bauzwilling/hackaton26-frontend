export type BubbleBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  r: number;
};

export type WorldBounds = { left: number; top: number; right: number; bottom: number };

const DRIFT = 42;
const DAMP = 0.991;
const RESTITUTION = 0.86;
const MAX_SPEED = 2200;
const BUOYANCY = 22;

export function bubbleRadius(w: number, h: number) {
  return 0.5 * Math.hypot(w, h);
}

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
    vx: (Math.random() - 0.5) * 90,
    vy: (Math.random() - 0.5) * 70 - 24,
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
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const aHeld = a.id === heldId;
  const bHeld = b.id === heldId;

  if (aHeld && !bHeld) {
    b.x += nx * overlap;
    b.y += ny * overlap;
  } else if (bHeld && !aHeld) {
    a.x -= nx * overlap;
    a.y -= ny * overlap;
  } else if (!aHeld && !bHeld) {
    const half = overlap * 0.5;
    a.x -= nx * half;
    a.y -= ny * half;
    b.x += nx * half;
    b.y += ny * half;
  }

  const dvx = b.vx - a.vx;
  const dvy = b.vy - a.vy;
  const vn = dvx * nx + dvy * ny;
  if (vn > 0) return;

  if (aHeld && !bHeld) {
    const impulse = vn * (1 + RESTITUTION);
    b.vx -= impulse * nx;
    b.vy -= impulse * ny;
  } else if (bHeld && !aHeld) {
    const impulse = vn * (1 + RESTITUTION);
    a.vx += impulse * nx;
    a.vy += impulse * ny;
  } else if (!aHeld && !bHeld) {
    const impulse = vn * (1 + RESTITUTION) / 2;
    a.vx += impulse * nx;
    a.vy += impulse * ny;
    b.vx -= impulse * nx;
    b.vy -= impulse * ny;
  }
}

function bounceWalls(b: BubbleBody, bounds: WorldBounds) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const spanX = bounds.right - bounds.left;
  const spanY = bounds.bottom - bounds.top;
  const r = Math.min(b.r, spanX * 0.48, spanY * 0.48);

  if (cx - r < bounds.left) {
    b.x = bounds.left + r - b.w / 2;
    b.vx = Math.abs(b.vx) * RESTITUTION;
  } else if (cx + r > bounds.right) {
    b.x = bounds.right - r - b.w / 2;
    b.vx = -Math.abs(b.vx) * RESTITUTION;
  }
  if (cy - r < bounds.top) {
    b.y = bounds.top + r - b.h / 2;
    b.vy = Math.abs(b.vy) * RESTITUTION;
  } else if (cy + r > bounds.bottom) {
    b.y = bounds.bottom - r - b.h / 2;
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
    b.vx += (Math.random() - 0.5) * DRIFT * t * 60;
    b.vy += (Math.random() - 0.5) * DRIFT * t * 60 - BUOYANCY * t;
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
