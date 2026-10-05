/* WAITING DATABASE: catalog fixtures (machines, projects, materials) until product APIs exist. */
import { bindMachineSeed } from "./machineStore";
import type { Session } from "./auth";

export const WOODS = [
  { id: "Pine", note: "Solid, oiled", rate: 1, chip: "#d8b184" },
  { id: "Spruce", note: "Solid, rough", rate: 0.88, chip: "#e2c9a4" },
  { id: "Birch", note: "Plywood 18 mm", rate: 1.24, chip: "#cfa876" },
  { id: "Oak", note: "Solid, light", rate: 1.62, chip: "#b98d5c" },
];

export const MATERIALS = [
  { id: "Steel", note: "S235, lasered", rate: 0.62, chip: "#8b8f94" },
  { id: "Aluminium", note: "AlMg3, milled", rate: 0.78, chip: "#b9bfc4" },
  { id: "Birch", note: "Plywood", rate: 0.41, chip: "#d8b184" },
  { id: "Acrylic", note: "PMMA, clear", rate: 0.55, chip: "#c9d6da" },
];

export const MACHINES = [
  { name: "04G0", slug: "at-datab-0001", owner: "DataB", location: "Biedermannsdorf, Austria", online: true },
  { name: "06G2", slug: "at-datab-0002", owner: "Dataform.work", location: "Biedermannsdorf, Austria", online: false },
  { name: "09G2", slug: "at-datab-0003", owner: "Dataform.work", location: "Biedermannsdorf, Austria", online: false },
  { name: "02G1", slug: "at-frischeis-0001", owner: "Frischeis", location: "Stockerau, Austria", online: false },
  { name: "05G2", slug: "de-strabag-0001", owner: "Strabag", location: "Bad Hersfeld, Germany", online: true },
  { name: "12G2", slug: "de-strabag-0002", owner: "Strabag", location: "Bad Hersfeld, Germany", online: false },
  { name: "07G2", slug: "nl-peri-0001", owner: "Peri", location: "Schijndel, Netherlands", online: false },
  { name: "10G2", slug: "ch-peri-0001", owner: "Peri", location: "Ohringen, Switzerland", online: false },
];

bindMachineSeed(MACHINES);

export const PROJECTS = [
  { title: "Door boxout · 300×1790×945", desc: "Six-box set, pine + film plates, nesting confirmed.", kind: "Boxouts", status: "Quoted", when: "2h ago" },
  { title: "Simple Parts · bracket batch", desc: "Laser-cut steel brackets, 2 mm, 240 units.", kind: "Simple Parts", status: "In production", when: "Yesterday" },
  { title: "Shelf system · oak", desc: "Natural-language brief, three variants routed to two workshops.", kind: "Briefs", status: "Draft", when: "3 days ago" },
  { title: "Door boxout set · 12 units", desc: "Repeat order from March, dimensions unchanged.", kind: "Boxouts", status: "Shipped", when: "1 week ago" },
  { title: "Housing prototype", desc: "SLS nylon, two iterations, tolerance ±0.15 mm.", kind: "Briefs", status: "Quoted", when: "2 weeks ago" },
  { title: "Simple Parts · spacer rings", desc: "Turned aluminium, 60 units, no finishing.", kind: "Simple Parts", status: "Shipped", when: "3 weeks ago" },
];

export const TOUR_CHIP = "Give me a tour";
export const CAPABILITIES_CHIP = "What can I do here?";
export const WILDCARD_CHIP = "Will it rain?";

/** Shared manufacturing FAQ starters — every role gets these after role-specific asks. */
export const COMMON_CHIPS = [
  "What is plate nesting?",
  "What is CNC milling?",
  "What can you manufacture?",
];

/** Designer / user role-specific asks (no app-name wording). */
export const USER_ROLE_CHIPS = [
  "Make a boxout 300×2000×1000 — 5×",
  "I need laser-cut brackets",
  "Design a plywood shelf",
];

/** Operator role-specific asks. */
export const OPERATOR_ROLE_CHIPS = [
  "How are my assigned jobs looking?",
  "What's running on the shop floor?",
];

/** Manager role-specific asks. */
export const MANAGER_ROLE_CHIPS = [
  "What's the job status?",
  "Who's free on the floor?",
];

/** Admin role-specific asks. */
export const ADMIN_ROLE_CHIPS = [
  "Who can sign in here?",
  "Which machines are in the fleet?",
];

function withLandingRecipe(roleChips: readonly string[]) {
  return [TOUR_CHIP, ...roleChips, ...COMMON_CHIPS, WILDCARD_CHIP];
}

export const USER_CHIPS = withLandingRecipe(USER_ROLE_CHIPS);
export const OPERATOR_CHIPS = withLandingRecipe(OPERATOR_ROLE_CHIPS);
export const MANAGER_CHIPS = withLandingRecipe(MANAGER_ROLE_CHIPS);
export const ADMIN_CHIPS = withLandingRecipe(ADMIN_ROLE_CHIPS);

/**
 * Landing / ask-menu suggestion chips for the signed-in role.
 * WAITING MODEL: the structuring model should pick starters from role + inspector facts;
 * these lists are the heuristic stand-in until then.
 */
export function chipsFor(session: Session | null): string[] {
  if (session?.role === "operator") return OPERATOR_CHIPS;
  if (session?.role === "manager") return MANAGER_CHIPS;
  if (session?.role === "admin") return ADMIN_CHIPS;
  return USER_CHIPS;
}

export const PLYWORKS_INTRO =
  "Plyworks is a plywood furniture configurator. Start from a base design (shelf, table, stool, or bench), add or move panels, preview realistic wood, then download STEP, DXF, or STL for manufacture.";

export function plyworksOpening(prefix: string) {
  return `${prefix} ${PLYWORKS_INTRO}`;
}

export function quoteBox(w: number, h: number, d: number, count: number, rate: number, film: boolean, nest: boolean) {
  const area = (w * h * 2 + d * h * 2 + w * d) / 1e6;
  const bulk = count >= 12 ? 0.86 : count >= 6 ? 0.93 : 1;
  const unit = area * 78 * rate * (film ? 1.14 : 1) * bulk;
  const minutes = Math.round(area * count * 26);
  return {
    area,
    unit,
    total: unit * count,
    sheets: Math.max(1, Math.ceil((area * count) / 3.1)),
    waste: nest ? 7 : 19,
    minutes,
  };
}

export function quotePart(qty: number, thickness: number, rate: number, rush: boolean, deburr: boolean) {
  const unit = (12 + thickness * 1.8) * rate * (deburr ? 1.08 : 1) * (rush ? 1.35 : 1);
  return { unit, total: unit * qty, minutes: Math.round(qty * (2.2 + thickness * 0.4)) };
}

export function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function hours(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}
