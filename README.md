# My Apartment Plan

A 2D floor plan of a 3-bedroom apartment, drawn to scale in meters, with furniture you can resize and drag onto the rooms.

| File | What it is |
|---|---|
| `index.html` | The plan (home page of the site), opens in white |
| `apartment-plan.html` | The plan, opens in white (same as `index.html`) |
| `apartment-plan-black.html` | The plan, opens in black |
| `src/plan-template.html` | The source both versions are built from |
| `src/build.py` | Builds both versions from the template |

Open `index.html` in a browser. Every page has an English/Arabic switch and a White/Black switch. Outside Claude, the furniture layout is saved in that browser only.

## Rebuild

```bash
python3 src/build.py src .
```

Then delete the `src/check-*.js` files it leaves behind (they are only for syntax checks and are git-ignored).

## How the plan is measured

- Every room size is a clear inside dimension: from the inside face of one wall to the inside face of the opposite wall, in meters, copied from the developer's plan.
- Sizes are written across × deep (left to right, then top to bottom, as drawn).
- Walls are drawn as lines with no thickness: every room is exactly its clear inside size, neighbouring rooms share one wall line, and the grid, rulers, furniture and measurements all use one scale (1 square = 1 m).
- Door and window positions are traced from the source drawing.
- Indoor area 104.09 m², terraces 7.47 m², total 111.56 m².

The full method, assumptions and coordinates are stored in each page in the `plan-data` JSON block and the `plan:*` meta tags.

## 3D view

The 2D / 3D switch at the top swaps the plan for a 3D model built from the same plan data, in the page's own colours. Walls are 2.80 m high and 4 cm thick, centred on the 2D wall lines, with no ceiling. Doors are openings 2.10 m high, windows run from 0.90 m to 2.10 m, and terrace railings are 1.00 m. Furniture shows as simple blocks at typical heights; click a piece to select it, then edit it from the panel. Drag to turn, scroll or pinch to zoom, right-drag to move; Zoom in/out, Top view and Reset view sit under the drawing. three.js 0.160.0 loads from jsDelivr the first time 3D opens.

## Furniture

Bed, L-Sofa, Sofa, Chair, Wardrobe and Table. Set a length and width in meters, drag a copy onto the plan, then move, resize (corner handle), rotate, flip, duplicate or remove it.
