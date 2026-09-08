const DICT = {
  en: {
    tools: "Tools", insert: "Insert panel", horiz: "Insert horizontal panel", vert: "Insert vertical panel",
    view: "View", pan: "Move model", renderReal: "Render realistic", showSketch: "Show sketch",
    dimsOn: "Dimensions on", dimsOff: "Dimensions off", reset: "Reset view",
    download: "Download", stepNote: "Every panel as its own BRep solid, sizes in mm.",
    joinery: "JOINERY", produce: "Produce", producing: "Producing…",
    language: "Language", width: "Width", height: "Height", depth: "Depth",
    thickness: "Thickness",
    color: "Color",
    log: "History", logEmpty: "Nothing yet — move a panel.",
    material: "Material", matNote: "Preview colour for this panel.",
    mats: { birch: "Birch", white: "White", black: "Black", grey: "Grey", yellow: "Yellow", blue: "Blue", red: "Red", sage: "Sage" } as Record<string, string>,
    rotate: "Rotate 90°", del: "Delete", done: "Done", parts: "panels",
    multiHint: "Shift- or Ctrl-click to add",
    kiefer: "Kiefer", film: "Film",
    prompt: 'What should we build? e.g. "shelf 1600 tall, one divider"',
    thinking: "thinking …", failed: "I didn't get that — try phrasing it differently?",
    cleared: "All cleared — start with one panel.", ok: "done",
    names: { "Side left": "Side left", "Side right": "Side right", Top: "Top", Bottom: "Bottom", Shelf: "Shelf", Divider: "Divider", Panel: "Panel", Back: "Back panel", Seat: "Seat", "Leg left": "Leg left", "Leg right": "Leg right", Stretcher: "Stretcher", "Stretcher front": "Stretcher front", "Stretcher back": "Stretcher back" } as Record<string, string>,
    aiLang: "English",
    showTemplates: "Show design templates",
    templates: "Design templates",
    templatesHint: "Pick a base to start from.",
    overwriteProject: "Overwrite current project",
    openNewWindow: "Open a new Plyworks window",
    applyHow: "Apply this template how?",
    cancel: "Cancel",
    designNames: { shelf: "Shelf", table: "Table", stool: "Stool", bench: "Bench" } as Record<string, string>,
  },
  de: {
    tools: "Werkzeuge", insert: "Platte einfügen", horiz: "Horizontale Platte einfügen", vert: "Vertikale Platte einfügen",
    view: "Ansicht", pan: "Modell verschieben", renderReal: "Realistisch rendern", showSketch: "Skizze anzeigen",
    dimsOn: "Bemaßung ein", dimsOff: "Bemaßung aus", reset: "Ansicht zurücksetzen",
    download: "Download", stepNote: "Jede Platte als eigener BRep-Volumenkörper, Maße in mm.",
    joinery: "JOINERY", produce: "Produzieren", producing: "Wird produziert…",
    language: "Sprache", width: "Breite", height: "Höhe", depth: "Tiefe",
    thickness: "Stärke",
    color: "Farbe",
    log: "Verlauf", logEmpty: "Noch nichts — verschieb eine Platte.",
    material: "Material", matNote: "Vorschau-Farbe für diese Platte.",
    mats: { birch: "Birke", white: "Weiß", black: "Schwarz", grey: "Grau", yellow: "Gelb", blue: "Blau", red: "Rot", sage: "Salbei" } as Record<string, string>,
    rotate: "90° drehen", del: "Löschen", done: "Fertig", parts: "Platten",
    multiHint: "Umschalt- oder Strg-Klick zum Hinzufügen",
    kiefer: "Kiefer", film: "Film",
    prompt: '„Was soll gebaut werden? z. B. „Regal 1600 hoch, Mittelsteg"',
    thinking: "denkt nach …", failed: "Das habe ich nicht verstanden — nochmal anders formulieren?",
    cleared: "Alles gelöscht — fang mit einer Platte an.", ok: "erledigt",
    names: { "Side left": "Seite links", "Side right": "Seite rechts", Top: "Deckel", Bottom: "Boden", Shelf: "Fachboden", Divider: "Trennwand", Panel: "Platte", Back: "Rückwand", Seat: "Sitz", "Leg left": "Bein links", "Leg right": "Bein rechts", Stretcher: "Traverse", "Stretcher front": "Traverse vorn", "Stretcher back": "Traverse hinten" } as Record<string, string>,
    aiLang: "Deutsch",
    showTemplates: "Designvorlagen zeigen",
    templates: "Designvorlagen",
    templatesHint: "Wähle eine Basis zum Starten.",
    overwriteProject: "Aktuelles Projekt überschreiben",
    openNewWindow: "Neues Plyworks-Fenster öffnen",
    applyHow: "Wie soll die Vorlage angewendet werden?",
    cancel: "Abbrechen",
    designNames: { shelf: "Regal", table: "Tisch", stool: "Hocker", bench: "Bank" } as Record<string, string>,
  },
  es: {
    tools: "Herramientas", insert: "Insertar tablero", horiz: "Insertar tablero horizontal", vert: "Insertar tablero vertical",
    view: "Vista", pan: "Mover modelo", renderReal: "Render realista", showSketch: "Ver croquis",
    dimsOn: "Cotas activadas", dimsOff: "Cotas desactivadas", reset: "Restablecer vista",
    download: "Descargar", stepNote: "Cada tablero como sólido BRep propio, medidas en mm.",
    joinery: "JOINERY", produce: "Producir", producing: "Produciendo…",
    language: "Idioma", width: "Ancho", height: "Alto", depth: "Fondo",
    thickness: "Espesor",
    color: "Color",
    log: "Historial", logEmpty: "Aún nada — mueve un tablero.",
    material: "Material", matNote: "Color de vista previa de este tablero.",
    mats: { birch: "Abedul", white: "Blanco", black: "Negro", grey: "Gris", yellow: "Amarillo", blue: "Azul", red: "Rojo", sage: "Salvia" } as Record<string, string>,
    rotate: "Girar 90°", del: "Eliminar", done: "Listo", parts: "tableros",
    multiHint: "Mayús o Ctrl-clic para añadir",
    kiefer: "Kiefer", film: "Film",
    prompt: '¿Qué construimos? p. ej. «estantería de 1600 de alto, con divisoria»',
    thinking: "pensando …", failed: "No lo he entendido — ¿lo dices de otra forma?",
    cleared: "Todo borrado — empieza con un tablero.", ok: "listo",
    names: { "Side left": "Lateral izq.", "Side right": "Lateral der.", Top: "Techo", Bottom: "Base", Shelf: "Balda", Divider: "Divisoria", Panel: "Tablero", Back: "Trasera", Seat: "Asiento", "Leg left": "Pata izq.", "Leg right": "Pata der.", Stretcher: "Travesaño", "Stretcher front": "Travesaño del.", "Stretcher back": "Travesaño tras." } as Record<string, string>,
    aiLang: "Español",
    showTemplates: "Mostrar plantillas de diseño",
    templates: "Plantillas de diseño",
    templatesHint: "Elige una base para empezar.",
    overwriteProject: "Sobrescribir el proyecto actual",
    openNewWindow: "Abrir una ventana Plyworks nueva",
    applyHow: "¿Cómo aplicar esta plantilla?",
    cancel: "Cancelar",
    designNames: { shelf: "Estantería", table: "Mesa", stool: "Taburete", bench: "Banco" } as Record<string, string>,
  },
} as const;

export type Lang = keyof typeof DICT;
type DictEntry = (typeof DICT)["en"];

export function t(lang: Lang, key: keyof DictEntry): any {
  return (DICT[lang] ?? DICT.en)[key];
}

/** Translate a board name (e.g. "Side left") to the active language */
export function boardName(lang: Lang, name: string): string {
  const names = t(lang, "names") as Record<string, string>;
  const m = name.match(/^(.*?)(\s+\d+)?$/);
  const base = m ? m[1] : name;
  return (names[base] || base) + (m?.[2] ?? "");
}

export function designLabel(lang: Lang, id: string): string {
  const names = t(lang, "designNames") as Record<string, string>;
  return names[id] || id;
}
