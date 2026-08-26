export type TemplateStep = { query: string };

export type RequestTemplate = {
  id: string;
  name: string;
  steps: TemplateStep[];
  savedAt: number;
  builtin?: boolean;
};

export const DEFAULT_TEMPLATES: RequestTemplate[] = [
  {
    id: "default-operator",
    name: "Machine operator template",
    builtin: true,
    savedAt: 0,
    steps: [{ query: "Open CNC Orbit" }, { query: "Open Simple Parts" }],
  },
  {
    id: "default-admin",
    name: "Site admin template",
    builtin: true,
    savedAt: 0,
    steps: [{ query: "Open CNC Orbit" }, { query: "Open Projects" }],
  },
  {
    id: "default-designer",
    name: "Designer template",
    builtin: true,
    savedAt: 0,
    steps: [{ query: "Open Simple Parts" }, { query: "Make a boxout 300×2000×1000 — 5×" }],
  },
];

function key(email: string) {
  return `f2f.templates.${email || "anon"}`;
}

export function loadTemplates(email: string): RequestTemplate[] {
  try {
    const raw = localStorage.getItem(key(email));
    if (!raw) return [];
    const data = JSON.parse(raw) as RequestTemplate[];
    return Array.isArray(data) ? data.filter((t) => !t.builtin) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(email: string, list: RequestTemplate[]) {
  try {
    localStorage.setItem(key(email), JSON.stringify(list.filter((t) => !t.builtin)));
  } catch { /* ignore */ }
}

export function uidTemplate() {
  return `tpl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}
