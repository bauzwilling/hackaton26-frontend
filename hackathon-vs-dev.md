# hackathon vs live `dev`

Contrast of dashboard-integration branch **`hackathon`** against each app’s live default **`origin/dev`**. Use this when reconciling the two lines of work.

**Compared:** local `hackathon` vs locally cached `origin/dev` on 14 Sep 2026. This was **not** a fresh `git fetch`. If `origin/dev` is stale locally, live may have moved. Boxouts `origin/dev` in this cache is older than Simple Parts.

**Default on GitHub:** `origin/HEAD` → `origin/dev` for all four nested app remotes.

| Repo | Relationship | `origin/dev` tip | `hackathon` tip |
|------|----------------|------------------|-----------------|
| `apps/boxout-front` | hackathon **ahead** (dev has nothing extra) | 27 Jul — `versioning` | 14 Sep — readme update |
| `apps/boxout-back` | hackathon **ahead** | 24 Aug — `error fallbacks on gh` | 14 Sep — readme update |
| `apps/simple-parts-front` | **diverged** | 9 Sep — file-naming PR #126 | 14 Sep — readme update |
| `apps/simple-parts-back` | **diverged** | 9 Sep — file-naming PR #101 | 14 Sep — readme + GH cleanup |

Split points for Simple Parts: front `c7b63b9` (7 Aug, versioning), back `deedf1a` (7 Aug, nesting-info merge).

---

## Boxouts — `hackathon` is a stack of dashboard work on top of live `dev`

Live `dev` has not received these commits. Merging `hackathon` → `dev` would be a fast-forward **if** remote `dev` still matches this cache.

### Front (`boxout-front`)

Dashboard / Studio integration plus nesting UX that live Vue does not have:

- Vite **pinned to 5174** (`strictPort`), junction `chdir` so `apps/` works on Windows.
- Nesting **DXF preview** (`NestingDxfViewer`, zip `?preview=1`) and download; `dxf-vuer` / `jszip` added; Three bumped.
- Larger `App.vue` / `3DViewer` / chat / nesting-count changes (preview lag, tooltips, Send Results).
- README rewritten for `hackathon-boxout.gh` and current routes.

### Back (`boxout-back`)

Live still points nesting at **`nestSplit/doorBoxOut_Nesting.gh`**. Hackathon switched to shared dashboard nesting:

| Live `dev` | `hackathon` |
|------------|-------------|
| `NESTING_DEFINITION_PATH` → `doorBoxOut_Nesting.gh` | `definitions/dashboard/hackathon-boxout.gh` (`toNest`, `plyworks=false`) |
| Sheet hops as before that GH | `K_SheetAmount` / `F_SheetAmount` + `K_*`/`F_*` layer hops |
| No zip/PDF/CSV-on-Compute path in this delta | `nesting_zip.py`, `dxf_serializer.py`, `dxf_to_pdf.py`, `layer_scheme.py`, `part_amount.py`, `COMPUTE_CSV_TEMP_BASE`, `JOBS_DIR` |
| — | New `definitions/dashboard/` tree (canonical + `wip/` GH files) |

Solve ticket on hackathon: per-row JW → per-row nest → MultiBox_SimpleBreps nest → MultiBox_JW nest + zip. Download routes and image analyze sit on this branch’s later work (some of that may already have been on `dev` depending on fetch freshness).

**Contrast later:** treat Boxouts as “dashboard nesting + iframe ports vs old Nesting.gh”. Unlikely to have lost live-only features in this cache.

---

## Simple Parts — both branches moved; they are not a fast-forward

Hackathon periodically merged `dev` until ~7 Aug, then each side added different work. **Do not merge blindly.**

### Front (`simple-parts-front`)

**Only on `hackathon` (small, Studio-shaped):**

- Vite **5175** `strictPort`; **vue-devtools plugin removed**.
- Layout: `#app` `overflow: hidden`, `.app` `height: 100%` (iframe), sidebar **22% / 300px** vs live **~16.7% / 240px**.
- Chat / input-requirements copy tweaks.
- `deploy.yml` (push `main` → EC2). Live `dev` does not have this file in the split diff.
- README for hops/`summon2d-nesting`.

**Only on live `dev` (product):**

- Excel / Swisspearl **xlsx** intake.
- **PDF** rasterization + interpretation; download zip with DXFs-only option.
- Image analysis; skip-uncertain-parts; thinking-message fixes.
- Download **file naming** panel + tests; download-info in the nesting modal.
- Sidebar size fix on `dev` (conflicts with hackathon’s wider iframe sidebar).
- Bore-placing was merged then **reverted**.

### Back (`simple-parts-back`)

Python on `hackathon` vs `dev` is the same at the split for `config.py` / `compute_service.py`. Hackathon-only files are GH + README.

**Only on `hackathon`:**

- Extra GH tree: `definitions/dashboard/hackathon-simple-parts.gh` + `definitions/dashboard/wip/*`.
- Edits to **`simple-parts-summon2d-nesting.gh`** (limits, then later GH update). Live also updated **the same file** — binary conflict on merge.
- README rewrite (hops/solve, Bores, no `main.py` / process).

**Only on live `dev`:**

- **xlsx** pipeline: `xlsx_reader.py`, `xlsx_dxf_builder.py`, material-check prompt, tests.
- **Sketch / scan:** `sketch_validate.py`, `scan_raster.py`, `parts_outline.py`, `canonical_parts.py`, sketch prompt.
- Routes: image analysis, PDF inspect, skip-uncertain, separate CSV/PDF endpoints, zip **filename** fixes.
- `llm.py` + `routes/core.py` growth; Pipfile lock; GH def update on **the same** `simple-parts-summon2d-nesting.gh`.
- Accidental `__pycache__` / `.pyc` in the `dev` diff — noise when contrasting.

**Contrast later:** hackathon = iframe chrome + dashboard GH copies + a different `.gh` binary. Live `dev` = xlsx/PDF/scan/naming. Shared file that will collide: `definitions/simple-parts-summon2d-nesting.gh`.

---

## How to use this when reconciling

1. **Boxouts:** likely cherry-pick or merge `hackathon` → `dev` after a fresh fetch. Watch GH path `doorBoxOut_Nesting.gh` → `hackathon-boxout.gh` and hop rename Amount vs Nr.
2. **Simple Parts:** three-way merge. Keep live xlsx/PDF/scan/naming; keep hackathon port/iframe CSS; **manually reconcile** the nesting `.gh`.
3. Re-fetch `origin/dev` before treating Boxouts `dev` as frozen (front tip in this cache is 27 Jul).
