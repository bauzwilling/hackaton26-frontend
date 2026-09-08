export const HOST_LOOK = "f2f-look";
export const HOST_LOOK_READY = "f2f-look-ready";
export const HOST_HELP = "f2f-help";

export function resolveBg(el: HTMLElement = document.documentElement): string {
  const raw = getComputedStyle(el).getPropertyValue("--bg").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  const probe = document.createElement("span");
  probe.style.backgroundColor = raw || "#f4efe6";
  el.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
  return "#f4efe6";
}

export function listenForHostLook() {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== HOST_LOOK) return;
    const root = document.documentElement;
    if (typeof data.acc === "string" && data.acc) root.style.setProperty("--acc", data.acc);
    if (typeof data.bg === "string" && data.bg) {
      root.style.setProperty("--bg", data.bg);
      document.body.style.backgroundColor = data.bg;
    }
    if (typeof data.face2 === "string" && data.face2) root.style.setProperty("--face2", data.face2);
    if (data.theme === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    window.dispatchEvent(new Event(HOST_LOOK));
  });
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== HOST_HELP) return;
    window.dispatchEvent(new CustomEvent(HOST_HELP, { detail: data }));
  });
  if (window.parent !== window) {
    window.parent.postMessage({ type: HOST_LOOK_READY }, "*");
  }
}
