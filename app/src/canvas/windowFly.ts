type Rect = { left: number; top: number; width: number; height: number };

const FLY_MS = 280;
const flying = new Set<string>();

function preferReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rectOf(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function sinkEl() {
  return document.querySelector('[data-fly-sink="windows"]');
}

function nodeEl(id: string) {
  return document.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
}

function pulseSink() {
  const el = sinkEl();
  if (!el) return;
  el.classList.add("is-fly-sink");
  window.setTimeout(() => el.classList.remove("is-fly-sink"), 420);
}

function runGhost(from: Rect, to: Rect, title: string): Promise<void> {
  return new Promise((resolve) => {
    const ghost = document.createElement("div");
    ghost.className = "win-fly-ghost";
    ghost.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "win-fly-ghost-title";
    label.textContent = title;
    ghost.appendChild(label);
    Object.assign(ghost.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      opacity: "0.92",
    });
    document.body.appendChild(ghost);
    ghost.getBoundingClientRect();
    const shrinking = to.width * to.height < from.width * from.height;
    Object.assign(ghost.style, {
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      opacity: shrinking ? "0.2" : "0.95",
    });
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      ghost.removeEventListener("transitionend", onEnd);
      ghost.remove();
      resolve();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === ghost && e.propertyName === "left") done();
    };
    ghost.addEventListener("transitionend", onEnd);
    window.setTimeout(done, FLY_MS + 80);
  });
}

function waitFrames(n: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/** Shrink the window into the Windows chrome button, then commit hide. */
export async function flyHideWindow(id: string, title: string, commit: () => void) {
  if (flying.has(id) || preferReducedMotion()) {
    commit();
    return;
  }
  const from = rectOf(nodeEl(id));
  const sink = rectOf(sinkEl());
  if (!from || !sink) {
    commit();
    return;
  }
  flying.add(id);
  commit();
  pulseSink();
  try {
    await runGhost(from, sink, title);
  } finally {
    flying.delete(id);
  }
}

/** Reveal from the Windows chrome button into the remounted window. */
export async function flyShowWindow(id: string, title: string, commit: () => void) {
  if (flying.has(id) || preferReducedMotion()) {
    commit();
    return;
  }
  const sink = rectOf(sinkEl());
  if (!sink) {
    commit();
    return;
  }
  flying.add(id);
  commit();

  let node: Element | null = null;
  for (let i = 0; i < 12; i++) {
    await waitFrames(1);
    node = nodeEl(id);
    if (node) break;
  }
  if (!node) {
    flying.delete(id);
    return;
  }
  node.classList.add("is-fly-pending");
  await waitFrames(1);
  const to = rectOf(node);
  if (!to) {
    node.classList.remove("is-fly-pending");
    flying.delete(id);
    return;
  }
  pulseSink();
  try {
    await runGhost(sink, to, title);
  } finally {
    node.classList.remove("is-fly-pending");
    flying.delete(id);
  }
}
