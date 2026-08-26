export type BubbleBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  phase: number;
  tilt: number;
};

const BOB = 22;
const SWAY = 14;
const GUST = 0.004;
const DAMP = 1.35;
const RESTITUTION = 0.78;
const SEPARATE = 0.62;
const GAP = 10;
const MAX_SPEED = 240;
const MAX_TILT = 9;
const ITERATIONS = 3;

export function spawnVelocity() {
  return {
    vx: (Math.random() - 0.5) * 36,
    vy: -10 - Math.random() * 22,
  };
}

export function capSpeed(b: BubbleBody, max = MAX_SPEED) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > max) {
    b.vx *= max / sp;
    b.vy *= max / sp;
  }
}

function massOf(b: BubbleBody) {
  return Math.max(0.45, Math.min(3.2, (b.w * b.h) / 42000));
}

function collide(a: BubbleBody, b: BubbleBody, heldId: string | null) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const rx = a.w / 2 + b.w / 2 + GAP;
  const ry = a.h / 2 + b.h / 2 + GAP;
  if (rx <= 1 || ry <= 1) return;

  let px = dx / rx;
  let py = dy / ry;
  let mag = Math.hypot(px, py);
  if (mag >= 1) return;
  if (mag < 1e-5) {
    px = 1;
    py = 0;
    mag = 1;
  }

  let nx = (px / mag) / rx;
  let ny = (py / mag) / ry;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;

  const overlap = (1 - mag) * Math.hypot(rx * nx, ry * ny);
  const aHeld = a.id === heldId;
  const bHeld = b.id === heldId;
  const invA = aHeld ? 0 : 1 / massOf(a);
  const invB = bHeld ? 0 : 1 / massOf(b);
  const inv = invA + invB;
  if (inv === 0) return;

  const push = overlap * SEPARATE;
  a.x -= nx * push * (invA / inv);
  a.y -= ny * push * (invA / inv);
  b.x += nx * push * (invB / inv);
  b.y += ny * push * (invB / inv);

  const dvx = b.vx - a.vx;
  const dvy = b.vy - a.vy;
  const vn = dvx * nx + dvy * ny;
  if (vn > 0) return;

  const j = -(1 + RESTITUTION) * vn / inv;
  a.vx -= j * nx * invA;
  a.vy -= j * ny * invA;
  b.vx += j * nx * invB;
  b.vy += j * ny * invB;

  const spin = j * 0.012;
  a.tilt -= spin * (invA ? 1 : 0);
  b.tilt += spin * (invB ? 1 : 0);
}

function wake(bodies: BubbleBody[], heldId: string | null, t: number) {
  if (!heldId) return;
  const held = bodies.find((b) => b.id === heldId);
  if (!held) return;
  const hx = held.x + held.w / 2;
  const hy = held.y + held.h / 2;
  const speed = Math.hypot(held.vx, held.vy);
  if (speed < 8) return;
  for (const b of bodies) {
    if (b.id === heldId) continue;
    const dx = b.x + b.w / 2 - hx;
    const dy = b.y + b.h / 2 - hy;
    const d = Math.hypot(dx, dy) || 1;
    const influence = Math.max(0, 1 - d / 280) ** 2;
    if (!influence) continue;
    b.vx += held.vx * influence * 0.55 * t;
    b.vy += held.vy * influence * 0.55 * t;
  }
}

export function stepBubbles(
  bodies: BubbleBody[],
  dt: number,
  heldId: string | null,
) {
  const t = Math.min(Math.max(dt, 0), 0.05);
  for (const b of bodies) {
    if (b.id === heldId) {
      b.tilt += (Math.max(-MAX_TILT, Math.min(MAX_TILT, b.vx * 0.06)) - b.tilt) * Math.min(1, t * 10);
      continue;
    }
    b.phase += t;
    const bob = Math.sin(b.phase * 0.95) * BOB + Math.sin(b.phase * 1.7 + 1.2) * BOB * 0.35;
    const sway = Math.sin(b.phase * 0.42) * SWAY + Math.cos(b.phase * 0.73 + 0.6) * SWAY * 0.4;
    b.vx += sway * t;
    b.vy += bob * t;
    if (Math.random() < GUST) {
      b.vx += (Math.random() - 0.5) * 48;
      b.vy += (Math.random() - 0.6) * 36;
    }
    const drag = Math.exp(-DAMP * t);
    b.vx *= drag;
    b.vy *= drag;
    capSpeed(b);
    b.x += b.vx * t;
    b.y += b.vy * t;
    const lean = Math.max(-MAX_TILT, Math.min(MAX_TILT, b.vx * 0.055 + Math.sin(b.phase * 2.1) * 1.6));
    b.tilt += (lean - b.tilt) * Math.min(1, t * 7);
  }

  wake(bodies, heldId, t);

  for (let k = 0; k < ITERATIONS; k++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        collide(bodies[i], bodies[j], heldId);
      }
    }
  }
}
