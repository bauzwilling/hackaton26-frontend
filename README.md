# File → Factory

Manufacturing-as-a-service workspace. The live product is a React + TypeScript + Vite app under `app/`. Claude Design mockups live in `docs/`.

## Run

The Studio chatbox talks to Claude through a local Python API. Put `ANTHROPIC_API_KEY` in a `.env` file at the repo root, then run both processes — the app needs both, and without the API the concierge falls back to matching app names on its own.

That bridge is temporary: the UI will talk to the Platform BFF, and our own structuring model will replace Claude. Everything to rewire carries a token in a comment, so a grep finds each site:

| Token | Swap it marks |
| --- | --- |
| `WAITING MODEL` | who decides — Claude or a heuristic today, our structuring model later ([docs/model-integration.md](docs/model-integration.md)) |
| `WAITING BFF` | who we call and in what shape |
| `WAITING DATABASE` | where state lives — fixtures and `localStorage` today |

```bash
grep -rn "WAITING MODEL" .
grep -rn "WAITING BFF" .
grep -rn "WAITING DATABASE" .
```

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
  model-integration.md  How chat and file intake move onto our own model
  mockups/           Earlier HTML / Claude Design screens
  assets/            Logos and stills from those screens
```

## Scripts

From the repo root: `uvicorn server:app --reload --port 8000`.

From `app/`: `npm run dev`, `npm run build`, `npm run preview`.

## Commit checks

A `pre-commit` hook reviews every commit against [hackaton26-plans](https://github.com/bauzwilling/hackaton26-plans). `npm install` in `app/` points git at `.githooks/`; to enable it by hand, run `git config core.hooksPath .githooks`.

The review needs `ANTHROPIC_API_KEY` in the repo-root `.env`. If the key is missing or the review cannot finish, the commit still goes through with a warning — only an actual plan violation blocks it. Use `git commit --no-verify` to skip the check deliberately.

Every commit that lands gets a row in `commit-verifications.md`: `PASSED`, `UNVERIFIED` when the review could not run, or `BYPASSED` after `--no-verify`. That register is gitignored, so each clone keeps its own local log.
