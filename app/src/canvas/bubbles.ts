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

const DRIFT = 4.5;
const HOVER = 9;
const DAMP = 0.96;
const RESTITUTION = 0.12;
const MAX_SPEED = 42;
const SEPARATE = 0.18;

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

export function stepBubbles(
  bodies: BubbleBody[],
  dt: number,
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

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      collide(bodies[i], bodies[j], heldId);
    }
  }
}
