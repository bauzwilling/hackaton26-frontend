# File → Factory

Manufacturing-as-a-service workspace. The live product is a React + TypeScript + Vite app under `app/`. Claude Design mockups live in `docs/`.

## Run

```bash
cd app
npm install
npm run dev
```

Sign in with any password. Example: `lena@frischeis.example`.

## Layout

```
app/                 Vite web app
  src/
    canvas/          Studio board (windows, wires, request log)
    components/      Shared UI kit and 3D viewer
    context/         Session and workspace state
    lib/             Auth, catalog, templates
    pages/           Login and in-window apps
    styles/          Theme and layout CSS
docs/
  mockups/           Earlier HTML / Claude Design screens
  assets/            Logos and stills from those screens
```

## Scripts

From `app/`: `npm run dev`, `npm run build`, `npm run preview`.
