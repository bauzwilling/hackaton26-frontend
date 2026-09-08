# Door Box Out

Vue source from `boxout-front`, parked here the same way Plyworks lives under `app/src/plyworks/`. Studio still opens Door Box Out as an iframe (`pages/Boxouts.tsx`) until this module is mounted natively.

Do not import these files from React yet. They need Vue, D3, ExcelJS, and rhino3dm, which are not on the host app.

## Layout

```
boxouts/
  BoxoutsApp.vue           Root conductor (chat, table, solve, viewer)
  boxouts.css              App styles
  components/              Sidebar, CSV table, D3 plot, 3D viewer, nesting
  lib/                     CSV parse, solve client, Three.js scene, env
  README.md
```

`lib/` is the `boxout-front/src/scripts/` folder. Imports are relative (no `@/` alias).

## Not copied

- `main.js` / `index.html` — host already has `app/src/main.tsx`
- Vite Vue plugin and `/api/app` proxy — host Vite is React-only today
- Flask backend (`boxout-back`) — stays a separate service

## Mount (later)

Point `pages/Boxouts.tsx` at this module instead of `VITE_BOXOUT_URL`. Until then, `/?app=boxouts` still loads the iframe.
