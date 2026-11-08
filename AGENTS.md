# AGENTS.md

Guide for coding agents working on this repository. For what the plan is and how people use it, read `README.md`.

## What this is

A single-page, to-scale floor plan of a 3-bedroom apartment. It has draggable furniture, editable doors and windows, and a 3D view with a walk mode. There is no framework, bundler or package manager. It is plain HTML, CSS and JavaScript in one file, plus three.js loaded from a CDN for 3D.

- Live site: https://khi4.github.io/my-apartment-plan/ (GitHub Pages, deployed from `main` at the repo root)
- Repo: https://github.com/khi4/my-apartment-plan

## Golden rule: edit the template, then rebuild

**Edit only `src/plan-template.html`.** The three HTML files at the root are generated from it and are overwritten on every build:

| Generated file | Variant |
|---|---|
| `index.html` | White, site home page (title "3-Bedroom Apartment Plan") |
| `apartment-plan.html` | White |
| `apartment-plan-black.html` | Black |

Rebuild after every template change:

```bash
python3 src/build.py src .
```

The build:
- fills in the `__TITLE__`, `__VARIANT__` and `__DEFAULT_LOOK__` placeholders;
- checks that every room's `across × deep` matches its `area` (to 0.006 m²) and prints the indoor, terrace and total areas;
- writes `src/check-White.js` and `src/check-Black.js`, the main script extracted for a syntax check:

```bash
node --check src/check-White.js && node --check src/check-Black.js
```

Delete `src/check-*.js` afterwards. They are git-ignored, but don't leave them around.

Commit the template and all three generated files together, so the live site matches the source.

## Layout of `src/plan-template.html`

One file, in this order (search for the `// ---- Name ----` comments to jump around):

1. `<head>`: title, the meta description and `plan:*` meta tags (machine-readable notes about the plan; keep them accurate when behaviour changes), then `<style>`.
2. **Theme tokens.** Colours are CSS variables. The white and black token sets live in the template and are switched by `data-look` on `<html>`. `--warn` is the red used for warnings. Never hard-code a colour: both themes must work.
3. **Markup**: header with the language, theme and 2D/3D switches, the SVG plan, the side panel (stats, rooms, method, furniture palette, inspector, doors-and-windows reset).
4. **Import map** for `three@0.160.0` from jsDelivr, and a tiny pre-paint script that sets the theme and language before first paint.
5. **`<script type="application/json" id="plan-data">`**: the single source of truth for geometry. It holds:
   - rooms (with `across`, `deep`, `area`, `outdoor`), wall edges, open edges;
   - the drawn `doors` and `windows` (on the page they become openings `d0`–`d10` and `d11`–`d19`);
   - the furniture catalogue and categories (each with `en` and `ar` names);
   - the method and assumptions text.

   Room sizes are clear inside dimensions copied from the developer's plan. **Don't change measurements** unless the user gives new ones.
6. **Main `<script>`**, in sections:
   - Language (`STR` with `en` and `ar`), storage helpers
   - Layers (SVG group order), stats, room table, method
   - Controls, state
   - Clearance gaps, walls blocking movement
   - Palette, drag lifecycle, move and resize, inspector
   - Doors and windows (openings), swing check
   - Saving, 3D (`make3d`, including Walk)
   - Language and theme switchers, start

## Conventions that matter

- **Units.** Data is in meters. The SVG is in centimetres (1 m = 100 plan units). Use the `m()` helper to convert. Walls are zero-thickness lines, so rooms are exactly their inside size.
- **Every user-visible string goes in `STR`, in both `en` and `ar`.** Arabic switches the page to `dir="rtl"`. Check that new UI still lays out correctly in RTL.
- **Both themes.** Check new UI in white and black.
- **SVG layer order is deliberate.** From bottom to top:
  1. outside, floors, walls
  2. openings, edges, grid, labels
  3. opening hit areas, furniture
  4. swing warnings
  5. selection, gaps, ghost, rulers, measure

  Add new layers in the right place. For example, warnings must sit above furniture.
- **Doors and windows** (`ops`) are `{id, kind: door|sliding|window, o: h|v, c, a1, a2, hs, side}`, in meters.
  - They snap only onto wall segments (`SEGS`, from `baseRuns()`), can't cross a corner or overlap, and doors swing into a room (`fixSide`).
  - The size limits per kind are in `OPK`. It must be defined near `MIN`/`MAX`, before the palette code runs, or you get a temporal dead zone (TDZ) error.
- **Saved state** has the shape `{v: 1, palette, items, opPalette, openings?}`.
  - `openings` is written only once the user has edited doors or windows. Without it, the drawn ones are used.
  - Inside a Claude artifact it is stored in the page database at `layouts/main` (`window.claude.use("db")`).
  - Otherwise it goes to `localStorage` under `apartment-plan-furniture-<variant>`.
  - Keep loading older saved layouts working: validate the input and fall back to defaults.
- **3D** is built lazily from the same data and must follow 2D edits. For example, `V.syncOpenings()` rebuilds the walls when doors or windows change. Don't add a second copy of any geometry.
- **External scripts**: only three.js from jsDelivr, pinned to an exact version. Everything else stays inline.
- **Keep it one file per variant.** Don't add build tools, npm packages or extra JS/CSS files.

## Testing

There is no test suite. Check changes in a browser:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/ (also set up as the `plan` entry in `.claude/launch.json`). For anything you change, test:
- 2D and 3D;
- English and Arabic;
- white and black;
- reloading with a saved layout;
- the browser console stays free of errors.

Clear test data you saved in `localStorage` when you're done, and tell the user if you removed something that might have been theirs.

## Publishing

- Pushing to `main` deploys GitHub Pages. Commit or push only when the user asks.
- The plan is also published as two Claude artifacts, white and black. When the user asks to update them, republish `apartment-plan.html` and `apartment-plan-black.html`:
  - white: https://claude.ai/artifact/JCcm9WC2ZYGzuB2cC9Jnwp
  - black: https://claude.ai/artifact/8QzC31BdkJagHGhbaxKtCw
- Update `README.md` when user-facing behaviour changes.
