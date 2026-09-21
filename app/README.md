# Web app

React + TypeScript + Vite. From this directory:

```bash
npm install
npm run dev
```

`npm run dev:remote` uses Vite `--mode remote` and `app/.env.remote` so the Flask stand-ins proxy to deployed Door Box-Out / Simple Parts / Plyworks. Copy `.env.remote.example` first. Concierge (`/api` → `:8000`) is unchanged.

Studio mounts BoxOut, Simple Parts, and Plyworks as native React modules. Open them through the Studio canvas (`/?app=boxouts`, `/?app=simpleparts`, or `/?app=plyworks`).

See the repository README for the rest of the project.
