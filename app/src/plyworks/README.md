# Plyworks

Frontend source from `hackaton26-plyworks/front`, parked here the same way BoxOut and Simple Parts first landed. Studio still opens Plyworks as an iframe (`pages/Plyworks.tsx`, `VITE_PLYWORKS_URL`, default `http://localhost:5176`) until this module is mounted natively.

Do not import the pipeline files from Studio yet. JointWiz / nesting still need Vue (`dxf-vuer`), JSZip, and rhino3dm, which are not wired for this module. The older in-repo configurator (`PlyworksPage.tsx`, `MaterialPicker.tsx`, `types.ts`) stays unused while the iframe is the live window.

These files are a look-only park of the existing Plyworks window (`hackaton26-plyworks/front`). They are not a second mill/produce pipeline in Studio, not a PlyworksAdapter, and not a native mount. JointWiz and nesting stay inside that existing-system app until a later port, the same as BoxOut and Simple Parts copy-only landings.

## Layout

```
plyworks/
  App.tsx                  Standalone router (configurator / jw / nesting)
  components/              Configurator, JointWiz, nesting, produce banner
  nesting-preview/         Vue DXF / curve viewers (iframe-era leftovers)
  hooks/                   Configurator + produce job polling
  lib/                     Three.js engine, geometry, produce API, rhino helpers
  assets/icons/            Template picker SVGs
  plyworks.css
  README.md
```

Not copied: `main.tsx` / `index.html` (host already has `app/src/main.tsx`), the Flask back, Grasshopper definitions, or `plyworks-react/` (reference prototype).

## Backend collision (when mounting later)

This app fetches `/api/produce` and related job URLs. Those collide with Studio Concierge’s `/api` proxy (`:8000`). Give Plyworks its own prefix (for example `/api/plyworks`) before native mount, or point env at the deployed produce API. Default Flask port in the standalone app is `:5002`.
