# Plyworks

Native plywood furniture configurator for Studio. Geometry, DXF/STL/STEP export, and the Three.js engine run in the browser — there is no separate Plyworks frontend or backend repo.

Open it from Studio: `/?app=plyworks` (same deep-link as before).

This folder is self-contained. Boxouts and Simple Parts stay iframes; this app uses the host React + Three.js stack.

## Layout

```
plyworks/
  types.ts                 Board / material model
  lib/geometry.ts          Snap, rotate, DXF / STL / STEP export
  lib/i18n.ts              EN / DE / ES strings
  lib/ThreeEngine.ts       Imperative Three.js renderer (not React)
  hooks/                   Configurator state + engine lifecycle
  components/              Toolbar, panels, canvas overlays
  plyworks.css             Overlay UI (Figtree + host CSS variables)
  PlyworksPage.tsx         Studio page wrapper
```

`useThreeEngine` is the only React bridge. Do not wrap `ThreeEngine` in R3F.

## Mount

Studio already renders `PlyworksPage` from `pages/Projects.tsx`. Point that export at this module:

```tsx
export { PlyworksPage } from "../plyworks";
```

Figtree loads from `plyworks.css`. No extra npm packages.
