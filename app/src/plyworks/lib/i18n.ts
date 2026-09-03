const DICT = {
  en: {
    tools: "Tools", insert: "Insert panel", horiz: "Insert horizontal panel", vert: "Insert vertical panel",
    view: "View", pan: "Move model", renderReal: "Render realistic", showSketch: "Show sketch",
    dimsOn: "Dimensions on", dimsOff: "Dimensions off", reset: "Reset view",
    download: "Download", stepNote: "Every panel as its own BRep solid, sizes in mm.",
    language: "Language", width: "Width", height: "Height", depth: "Depth",
    log: "History", logEmpty: "Nothing yet — move a panel.",
    material: "Material", matNote: "18 mm multiplex — applies to every panel.",
    mats: { birch: "Birch", white: "White", black: "Black", grey: "Grey", yellow: "Yellow", blue: "Blue", red: "Red", sage: "Sage" } as Record<string, string>,
    rotate: "Rotate 90°", del: "Delete", done: "Done", parts: "panels · 18 mm",
    prompt: 'What should we build? e.g. "shelf 1600 tall, one divider"',
    thinking: "thinking …", failed: "I didn't get that — try phrasing it differently?",
    cleared: "All cleared — start with one panel.", ok: "done",
    names: { "Side left": "Side left", "Side right": "Side right", Top: "Top", Bottom: "Bottom", Shelf: "Shelf", Divider: "Divider", Panel: "Panel", Back: "Back panel" } as Record<string, string>,
    aiLang: "English",
  },
  de: {
    tools: "Werkzeuge", insert: "Platte einfügen", horiz: "Horizontale Platte einfügen", vert: "Vertikale Platte einfügen",
    view: "Ansicht", pan: "Modell verschieben", renderReal: "Realistisch rendern", showSketch: "Skizze anzeigen",
    dimsOn: "Bemaßung ein", dimsOff: "Bemaßung aus", reset: "Ansicht zurücksetzen",
    download: "Download", stepNote: "Jede Platte als eigener BRep-Volumenkörper, Maße in mm.",
    language: "Sprache", width: "Breite", height: "Höhe", depth: "Tiefe",
    log: "Verlauf", logEmpty: "Noch nichts — verschieb eine Platte.",
    material: "Material", matNote: "18 mm Multiplex — gilt für alle Platten.",
    mats: { birch: "Birke", white: "Weiß", black: "Schwarz", grey: "Grau", yellow: "Gelb", blue: "Blau", red: "Rot", sage: "Salbei" } as Record<string, string>,
    rotate: "90° drehen", del: "Löschen", done: "Fertig", parts: "Platten · 18 mm",
    prompt: '„Was soll gebaut werden? z. B. „Regal 1600 hoch, Mittelsteg"',
    thinking: "denkt nach …", failed: "Das habe ich nicht verstanden — nochmal anders formulieren?",
    cleared: "Alles gelöscht — fang mit einer Platte an.", ok: "erledigt",
    names: { "Side left": "Seite links", "Side right": "Seite rechts", Top: "Deckel", Bottom: "Boden", Shelf: "Fachboden", Divider: "Trennwand", Panel: "Platte", Back: "Rückwand" } as Record<string, string>,
    aiLang: "Deutsch",
  },
  es: {
    tools: "Herramientas", insert: "Insertar tablero", horiz: "Insertar tablero horizontal", vert: "Insertar tablero vertical",
    view: "Vista", pan: "Mover modelo", renderReal: "Render realista", showSketch: "Ver croquis",
    dimsOn: "Cotas activadas", dimsOff: "Cotas desactivadas", reset: "Restablecer vista",
    download: "Descargar", stepNote: "Cada tablero como sólido BRep propio, medidas en mm.",
    language: "Idioma", width: "Ancho", height: "Alto", depth: "Fondo",
    log: "Historial", logEmpty: "Aún nada — mueve un tablero.",
    material: "Material", matNote: "Multiplex de 18 mm — se aplica a todos los tableros.",
    mats: { birch: "Abedul", white: "Blanco", black: "Negro", grey: "Gris", yellow: "Amarillo", blue: "Azul", red: "Rojo", sage: "Salvia" } as Record<string, string>,
    rotate: "Girar 90°", del: "Eliminar", done: "Listo", parts: "tableros · 18 mm",
    prompt: '¿Qué construimos? p. ej. «estantería de 1600 de alto, con divisoria»',
    thinking: "pensando …", failed: "No lo he entendido — ¿lo dices de otra forma?",
    cleared: "Todo borrado — empieza con un tablero.", ok: "listo",
    names: { "Side left": "Lateral izq.", "Side right": "Lateral der.", Top: "Techo", Bottom: "Base", Shelf: "Balda", Divider: "Divisoria", Panel: "Tablero", Back: "Trasera" } as Record<string, string>,
    aiLang: "Español",
  },
} as const;

export type Lang = keyof typeof DICT;
type DictEntry = (typeof DICT)["en"];

export function t(lang: Lang, key: keyof DictEntry) {
  return (DICT[lang] ?? DICT.en)[key];
}

/** Translate a board name (e.g. "Side left") to the active language */
export function boardName(lang: Lang, name: string): string {
  const names = t(lang, "names") as Record<string, string>;
  const m = name.match(/^(.*?)(\s+\d+)?$/);
  const base = m ? m[1] : name;
  return (names[base] || base) + (m?.[2] ?? "");
}
