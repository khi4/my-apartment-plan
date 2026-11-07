# My Apartment Plan

A 2D floor plan of a 3-bedroom apartment, drawn to scale in meters, with furniture you can resize and drag onto the rooms.

| File | What it is |
|---|---|
| `apartment-plan.html` | White version |
| `apartment-plan-black.html` | Black version |
| `src/plan-template.html` | The source both versions are built from |
| `src/build.py` | Builds both versions from the template |

Open either HTML file in a browser. Outside Claude, the furniture layout is saved in that browser only.

## Rebuild

```bash
python3 src/build.py src .
```

Then delete the `src/check-*.js` files it leaves behind (they are only for syntax checks and are git-ignored).

## How the plan is measured

- Every room size is a clear inside dimension: from the inside face of one wall to the inside face of the opposite wall, in meters, copied from the developer's plan.
- Sizes are written across × deep (left to right, then top to bottom, as drawn).
- Walls are assumed 15 cm thick, so the overall outer size is approximate; room sizes are not affected.
- Door and window positions are traced from the source drawing.
- Indoor area 104.09 m², terraces 7.47 m², total 111.56 m².

The full method, assumptions and coordinates are stored in each page in the `plan-data` JSON block and the `plan:*` meta tags.

## Furniture

Bed, L-Sofa, Sofa, Chair, Wardrobe and Table. Set a length and width in meters, drag a copy onto the plan, then move, resize (corner handle), rotate, flip, duplicate or remove it.
