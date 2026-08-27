# File → Factory

Manufacturing-as-a-service workspace. The live product is a React + TypeScript + Vite app under `app/`. Claude Design mockups live in `docs/`.

## Run

The Studio chatbox talks to Claude through a local Python API. Put `ANTHROPIC_API_KEY` in a `.env` file at the repo root, then run both processes:

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

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
    lib/             Auth, catalog, templates, concierge client
    pages/           Login and in-window apps
    styles/          Theme and layout CSS
server.py            Local FastAPI bridge to Claude
llm.py               Claude concierge helper
prompts/             Concierge system prompt
docs/
  mockups/           Earlier HTML / Claude Design screens
  assets/            Logos and stills from those screens
```

## Scripts

From the repo root: `uvicorn server:app --reload --port 8000`.

From `app/`: `npm run dev`, `npm run build`, `npm run preview`.

## Commit checks

A `pre-commit` hook reviews every commit against [hackaton26-plans](https://github.com/bauzwilling/hackaton26-plans). `npm install` in `app/` points git at `.githooks/`; to enable it by hand, run `git config core.hooksPath .githooks`.

The review needs `ANTHROPIC_API_KEY` in the repo-root `.env`. If the key is missing or the review cannot finish, the commit still goes through with a warning — only an actual plan violation blocks it. Use `git commit --no-verify` to skip the check deliberately.

Every commit that lands gets a row in [commit-verifications.md](commit-verifications.md): `PASSED`, `UNVERIFIED` when the review could not run, or `BYPASSED` after `--no-verify`. The row is written just after the commit it describes, so it travels with the next one.
