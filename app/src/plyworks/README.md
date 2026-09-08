# Plyworks

Native React Plyworks module mounted directly inside Studio. It keeps the configurator, templates, material/thickness editing, Three.js board engine, local DXF/STL/STEP export, help tour, validation, JointWiz preview, and nesting preview/download.

## Layout

```
plyworks/
  PlyworksPage.tsx         Studio wrappers for configurator / jw / nesting
  components/              React configurator, JointWiz, nesting, produce banner
  nesting-preview/         Native React DXF nesting viewer
  hooks/                   Configurator + produce job polling
  lib/                     Three.js engine, geometry, produce API, rhino helpers
  assets/icons/            Template picker SVGs
  api.ts                   Temporary namespaced Flask URL helper
  types.ts                 Shared board, material, and configurator types
  plyworks.css
  README.md
```

`useThreeEngine` is the only React bridge to the imperative Three.js configurator engine. The nesting viewer uses `dxf-render`; no Vue or `dxf-vuer` remains.

## Transport is a stand-in, not the architecture

The existing produce pipeline is preserved behind `/api/plyworks`. During local development Vite strips that prefix and proxies to `VITE_PLYWORKS_BACKEND_URL` (default `http://127.0.0.1:5002`), avoiding Studio Concierge on `/api` → `:8000`.

Per boundary-plan §3 and §16 this is temporary: workflow calls and polling eventually move to Platform BFF runs, actions, and artifacts. Call sites are marked `WAITING BFF`; `/api/plyworks` is not a target platform contract.
