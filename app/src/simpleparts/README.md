# Simple Parts

Native React Simple Parts module mounted directly inside Studio. It keeps the standalone app's DXF/DWG/3DM intake, Hops preview and nesting flow, metadata editing, Three.js viewers, nesting result Studio window, and downloads. Chat lives in Concierge; this window no longer embeds its own chat sidebar.

## Layout

```
simpleparts/
  SimplePartsPage.tsx         React layout (viewer + Studio nesting handoff)
  SimplePartsNestingPage.tsx  Nesting result Studio window (query = stand-in job/run id)
  nestingResultStore.ts       In-session nesting snapshot until BFF artifacts exist
  simpleparts.css             Original palette and base styles
  simpleparts-react.css       React component and Studio-node layout
  components/                 DXF/3D viewers, metadata, nesting result UI
  features/                   Upload, chat bridge, Hops solve, metadata business logic
  hooks/                      React bridge for the app state
  reactivity.js               Small framework-neutral ref/computed/watch adapter
  *.js                        DXF / rhino3dm helpers (browser-side)
  README.md
```

Sample CAD and the input-requirements PDF live in `app/public/input-requirements/` (same URLs the Vue UI already uses).

## Transport is a stand-in, not the architecture

Per boundary-plan §3 the UI may only talk to the Platform BFF and **must never call Simple Parts**. That BFF does not exist yet, so this window still drives the standalone Flask app directly. Every one of those calls is a temporary mock.

`/api/parts` is only a local dev prefix so those mock calls stop colliding with Studio Concierge on `/api` → `:8000`; Vite rewrites `/api/parts` → `/api` and proxies to `VITE_SIMPLEPARTS_BACKEND_URL` (default `http://127.0.0.1:5001`). It is not a platform route and nothing should depend on it.

When the BFF lands, `partsApi()` and the proxy rule both go away: chat, run status, and artifacts move to the platform endpoints in boundary-plan §18, and Simple Parts sits behind the BFF via `SimplePartsAdapter` (§12). Per msd-simple-parts-ui, the Mill window stays and shows WorkflowRun / `manufacturing.milling-package/v1` artifact metadata; sheet DXFs and ZIP downloads come from `GET /api/artifacts/{artifactId}/download`. Until then the nesting window unpacks the Flask stand-in `GET /api/jobs/{jobId}/download` (ZIP of `nesting_001.dxf` …) — deployed `main` has no `/download/sheets` or `/download/sheet/:index`. Call sites carry `WAITING BFF` / `WAITING MODEL` / `WAITING DATABASE`.