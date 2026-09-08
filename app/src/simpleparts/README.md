# Simple Parts

Vue source from `simple-parts-front`, parked here the same way BoxOut first landed under `app/src/boxouts/`. Studio still opens Simple Parts as an iframe (`pages/Parts.tsx`) until this module is mounted natively.

Do not import these files from React yet. They need Vue, dxf-vuer, JSZip, and rhino3dm, which are not wired into the host app for this module.

## Layout

```
simpleparts/
  SimplePartsApp.vue       Root layout (sidebar + viewer + nesting modal)
  simpleparts.css          App styles
  components/              Chat, DXF/3D viewers, metadata, nesting modal
  features/                Composables: upload, chat, Hops solve, metadata
  assets/                  Logo
  *.js                     DXF / rhino3dm helpers (browser-side)
  README.md
```

Sample CAD and the input-requirements PDF live in `app/public/input-requirements/` (same URLs the Vue UI already uses).

## Not copied

- `main.js` / `index.html` — host already has `app/src/main.tsx`
- Vue Vite plugin and `/api` → `:5001` proxy — host Vite already proxies `/api` to Studio Concierge on `:8000`
- Flask backend (`simple-parts-back`) — stays a separate service

## Backend collision (when mounting later)

This app fetches `/api/chat`, `/api/hops/solve`, `/api/materials`, and `/api/jobs/...`. Those collide with Studio Concierge’s `/api` proxy. Give Simple Parts its own prefix (for example `/api/parts`) before native mount, or point `VITE_*` at the deployed Simple Parts API.

## Mount (later)

Point `pages/Parts.tsx` at this module instead of `VITE_SIMPLEPARTS_URL`. Until then, `/?app=simpleparts` still loads the iframe.
