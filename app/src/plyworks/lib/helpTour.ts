export type PlyHelpStep = {
  id: string;
  title: string;
  body: string;
  selector: string;
  prepare?: "templates" | "toolbar" | "selection" | "history" | "produce";
};

export const PLYWORKS_TOUR: PlyHelpStep[] = [
  {
    id: "canvas",
    title: "Canvas",
    body: "This is the furniture. Drag a panel to move it. Right-click a part to delete it.",
    selector: ".pw-canvas",
  },
  {
    id: "templates",
    title: "Templates",
    body: "Start from a shelf, table, stool, or bench. Picking one replaces the current design.",
    selector: ".pw-templates-panel, .pw-templates",
    prepare: "templates",
  },
  {
    id: "insert",
    title: "Insert panels",
    body: "Add a horizontal or vertical panel. New parts snap to the current design.",
    selector: ".pw-group.is-insert",
    prepare: "toolbar",
  },
  {
    id: "stock",
    title: "Stock and thickness",
    body: "Kiefer and film plates have their own thicknesses. Change them here before you produce.",
    selector: ".pw-group.is-material",
    prepare: "toolbar",
  },
  {
    id: "view",
    title: "View",
    body: "Switch sketch and realistic view, toggle dimensions, or reset the camera.",
    selector: ".pw-group.is-view",
    prepare: "toolbar",
  },
  {
    id: "selection",
    title: "Selection",
    body: "Click a panel to edit width, height, depth, plate type, and colour. Values apply to the selection.",
    selector: "[data-help='selection']",
    prepare: "selection",
  },
  {
    id: "wood",
    title: "Panel colour",
    body: "Each panel has its own colour. Kiefer stains the wood so grain still shows; film is a solid colour wrap.",
    selector: "[data-help='color']",
    prepare: "selection",
  },
  {
    id: "history",
    title: "History",
    body: "Edits are listed here so you can see what changed in this session.",
    selector: "[data-help='history']",
    prepare: "history",
  },
  {
    id: "download",
    title: "Download",
    body: "Export STEP for manufacture, or DXF and STL for checking.",
    selector: ".pw-group.is-download",
    prepare: "toolbar",
  },
  {
    id: "produce",
    title: "Produce",
    body: "Send the geometry to JointWiz. A banner reports whether the design is ready to nest.",
    selector: ".pw-corner-chip.is-produce",
    prepare: "produce",
  },
];

export function queryPlyHelp(selector: string): HTMLElement | null {
  return document.querySelector(selector);
}
