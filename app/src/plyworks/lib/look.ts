export function resolveBg(el: HTMLElement = document.documentElement): string {
  const raw = getComputedStyle(el).getPropertyValue("--bg").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  const probe = document.createElement("span");
  probe.style.backgroundColor = raw || "#f4efe6";
  el.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent"
    ? color
    : "#f4efe6";
}
