# Door Box Out

Native React Door Box Out module mounted directly inside Studio. It keeps the standalone app's CSV/Excel/image intake, table editing, D3 plot, Grasshopper solve polling, rhino3dm/Three.js viewer, nesting counts and nesting preview. Chat lives in Concierge; this window no longer embeds its own chat sidebar.

## Layout

```
boxouts/
  BoxoutsPage.tsx          React conductor (table, solve, viewer; Concierge owns chat)
  types.ts                 Shared state and input types
  boxouts.css              Original palette and responsive rules
  boxouts-react.css        Native component layout and styles
  components/              Table, D3 plot, 3D viewer, nesting
  lib/                     CSV parse, solve client, Three.js scene, env
  README.md
```

`lib/` remains framework-neutral. `viewerScene.js` is the imperative Three.js engine; `Viewer3D.tsx` owns its React lifecycle.

## Backend

During local development, Vite proxies `/api/app` to `VITE_BOXOUT_BACKEND_URL` (default `http://127.0.0.1:5000`) and strips `/api/app`. The Flask backend remains a separate service.

The direct Flask/AI contracts are temporary and marked `WAITING BFF` / `WAITING MODEL`.
