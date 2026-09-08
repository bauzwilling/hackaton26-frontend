# Simple Parts

Native React Simple Parts module mounted directly inside Studio. It keeps the standalone app's chat, DXF/DWG/3DM intake, Hops preview and nesting flow, metadata editing, Three.js viewers, nesting result modal, and downloads.

## Layout

```
simpleparts/
  SimplePartsPage.tsx      React layout (sidebar + viewer + nesting modal)
  simpleparts.css          Original palette and base styles
  simpleparts-react.css    React component and Studio-node layout
  components/              React chat, DXF/3D viewers, metadata, nesting modal
  features/                Upload, chat, Hops solve, metadata business logic
  hooks/                   React bridge for the app state
  reactivity.js            Small framework-neutral ref/computed/watch adapter
  assets/                  Logo
  *.js                     DXF / rhino3dm helpers (browser-side)
  README.md
```

Sample CAD and the input-requirements PDF live in `app/public/input-requirements/` (same URLs the Vue UI already uses).

## Transport is a stand-in, not the architecture

Per boundary-plan §3 the UI may only talk to the Platform BFF and **must never call Simple Parts**. That BFF does not exist yet, so this window still drives the standalone Flask app directly. Every one of those calls is a temporary mock.

`/api/parts` is only a local dev prefix so those mock calls stop colliding with Studio Concierge on `/api` → `:8000`; Vite strips the prefix and proxies to `VITE_SIMPLEPARTS_BACKEND_URL` (default `http://127.0.0.1:5001`). It is not a platform route and nothing should depend on it.

When the BFF lands, `partsApi()` and the proxy rule both go away: chat, run status, and artifacts move to the platform endpoints in boundary-plan §18, and Simple Parts sits behind the BFF via `SimplePartsAdapter` (§12). Per msd-simple-parts-ui, the window stays; only the transport and the local quote/production fakes are replaced. Call sites carry `WAITING BFF` / `WAITING MODEL`.
