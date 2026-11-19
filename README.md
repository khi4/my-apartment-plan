# Floor Plan Builder (Vue 3 + Three.js)

An interactive, to-scale 2D CAD and 3D architectural diorama floor plan builder built with **Vue 3**, **Vite**, and **Three.js (`0.160.0`)**.

Design custom floor plans from scratch or start from built-in templates, snap rooms and hallways together in real-world meters, place doors, sliding glass doors, and windows, furnish with 27 scaled architectural pieces, orient the sun with an interactive 360° solar compass, and explore in **Realistic 3D PBR** mode, **Blueprint** mode, or first-person **Walk** mode.

---

## Key Features

### 1. Immersive Full-Viewport Workspace & Frosted-Glass HUD
- **Full-Bleed 2D & 3D Canvas**: The drawing and 3D viewport cover `100vw × 100dvh` across desktop and mobile screens, with floating VisionOS-inspired specular frosted-glass HUD controls (`backdrop-filter` blur + saturation, dual-layer specular rim borders, and high-contrast ink tokens in both Light and Dark themes).
- **Animated Collapsible Project Summary Card** (top-left): Shows live total, indoor, and terrace areas (`m²`), room/hall and furniture counts, inline project title editing, Undo/Redo, quick template switchers (`+ Blank plan`, `Studio`, `3BR Demo`), and the **Projects & Data** modal. Collapses smoothly into a compact pill badge.
- **Animated Collapsible Time-of-Day & Solar Orientation Card** (bottom-left in 3D): Scrub sun time continuously from `05:30` (**Dawn**) to `21:30` (**Night**), jump to `Dawn / Noon / Dusk / Night` presets, or rotate building North (`-15°`, `North 0°`, `+15°`).
- **Unified Single-Scroll Floating Studio Sidebar** (right): Collapses to a floating chevron pill (`[`) for unobstructed viewing. Houses:
  - **Go to**: Quick camera-fly pills for `Overview` and every room in the plan (works in both 2D and 3D).
  - **Layers & 3D Atmosphere**: Toggle `Labels`, `Grid`, `Furniture`, `Doors & windows`, and `Sun compass`, switch `Realistic` vs. `Blueprint` 3D style, and pick `Daylight`, `Golden hour`, `Cozy evening`, or `Studio` atmosphere.
  - **Builder & Inspector**: Contextual inspector for the selected room, opening, or furniture item, plus tabbed palettes for `Spaces`, `Openings`, `Furniture`, and `Finishes`.

### 2. Flexible To-Scale 2D Floor Plan Authoring
- **Real-World Metric Scale**: `1 grid square = 1.00 m × 1.00 m` (`100 SVG units`). Magnetic edge/corner snapping with `5 cm` (`0.05 m`) default grid snap and `1 cm` (`0.01 m`) fine snap while holding `Shift`.
- **Four Space Types**: Build **Rooms**, **Halls / Corridors**, **Terraces / Balconies**, and **Light Wells / Shafts / Lifts**.
- **Two Ways to Add Spaces**:
  - Set `Across × Deep` dimensions in the **Spaces** tab and drag or click **Add**.
  - Activate **Draw room (`B`)** on the bottom dock and drag directly on the 2D grid with live dimension and area readouts.
- **Dynamic Walls, Open Passages & Railings**:
  - Touching spaces automatically merge shared boundaries into interior walls.
  - Click any shared interior boundary (or toggle in the Room Inspector) to switch between a solid **Wall** and a dashed **Open passage / archway**.
  - Exposed outdoor terrace edges automatically generate `1.00 m` safety railings.
- **Doors, Sliding Doors & Windows**:
  - Drag `Hinged Door`, `Sliding Glass Door`, or `Window` onto any wall segment.
  - Drag endpoint handles to resize width within architectural bounds, click the hinge dot to flip swing hand (`Left` / `Right`), click the leaf to flip swing side (`In` / `Out`), and view real-time red arc warnings when a door swing intersects furniture.
- **2D Interactive Solar Compass Ring & Adaptive Scale Bar**:
  - A 360° architectural compass ring (`CompassRoseLayer.vue`) surrounds the 2D floor plan with a draggable North handle, 15° graduation ticks, upright bilingual cardinal markers (`N / E / S / W` & `ش / ق / ج / غ`), an East→South→West solar path arc, and live sun ray vectors showing exact solar incidence into windows and terraces.
- **Interactive Tape Measure (`M`)**: Click-and-drag anywhere on the 2D plan to measure point-to-point distance, `ΔX / ΔY`, and angle.

### 3. Photorealistic 3D Architectural Diorama, Blueprint & Walk Modes
- **22 Procedural `512×512` PBR Material Presets** (`src/three/textureGenerator.js`):
  - Generated client-side at startup with zero external image downloads. Each texture produces a world-scaled color/albedo `map` (with warm/cool RGB tonal depth), a toroidal `3×3` Sobel tangent-space `normalMap` (`SOBEL_STRENGTH = 3.8`), and a physical gloss-vs-matte `roughnessMap`:
    - **Floors (8)**: `Oak Parquet` (staggered running-bond staves with cathedral grain & satin sheen vs. matte bevel seams), `Walnut Wood`, `Weathered Wood`, `Ceramic Tile`, `Marble Tile`, `Slate Stone`, `Carpet Weave`, `Polished Concrete`.
    - **Walls (6)**: `Venetian Plaster` (hand-troweled lime-wash with eggshell sheen), `Painted Brick`, `Wainscot Wood`, `Wall Tile`, `Linen Wallpaper`, `Stucco Stone`.
    - **Doors & Frames (4)**: `Painted Wood`, `Oak Wood`, `Walnut Wood`, `Matte Metal`.
    - **Furniture (8)**: `Linen Fabric`, `Velvet`, `Full-Grain Leather`, `Oak Wood`, `Walnut Wood`, `Painted Wood`, `Veined Marble`, `Brushed Metal`.
  - Floor patterns align across adjoining rectangles at a consistent scale. Linen and velvet respond to grazing light with a soft sheen, while brushed metal has directional highlights.
- **Global & Per-Element 3D Customization (`Finishes` Tab & Inspector)**:
  - Set apartment-wide wall, main floor, kitchen/bath floor, terrace floor, door/frame, and outer pedestal colors & textures — or click any room, door, or furniture piece in 2D or 3D to style its primary color, accent color, and texture individually.
  - Adjustable cutaway wall thickness (`0.06 m` – `0.25 m`, default `0.08 m`).
- **Architectural Realism & Anti-Z-Fighting Precision**:
  - Textured `stucco-stone` exterior facades with satin cutaway wall top caps, 8-segment vertical ground-bounce AO vertex shading on interior and exterior walls, `0.12 m` floor-wall contact shading, flush wood baseboards, 3D raised-panel hinged doors with lever hardware, dual-track sliding glass doors, mulled windows with protruding marble sills, tempered-glass terrace railings (`MeshPhysicalMaterial`), a concrete model base with a subdued compass ring and a drafting grid confined to the base, and soft under-furniture contact shadows.
  - All structural corners, opening frames, mirror frames, baseboards, floor decals, and multi-part furniture meshes use distinct non-coplanar geometry bounds to prevent depth-buffer flickering.
- **Filmic AgX Lighting & Physical Solar Sky**:
  - `THREE.AgXToneMapping` with `RoomEnvironment` PMREM image-based lighting (IBL) reflections.
  - Spherical solar position computed from `timeOfDay` (`05:30`–`21:30`) and compass `northDeg` (`0°`–`360°`), casting crisp `2048×2048` `PCFSoftShadowMap` shadows across rooms and furniture. The shadow map fits the plan and is reused while the camera moves. In Realistic Walk, exterior windows and glazed terrace doors also cast soft daylight into nearby rooms. Warm, room-sized lights come on at dusk.
- **Blueprint Mode**: Switch from `Realistic` to `Blueprint` for a high-contrast engineering solid-and-wireframe extrusion view.
- **First-Person Walk Mode (`1.60 m` Eye Height)**: Indoor rooms and halls have matte ceilings in Realistic Walk. The entry camera uses a 54° vertical field of view. Step inside the apartment with `WASD` / Arrow keys (hold `Shift` to walk faster) or the on-screen D-pad, look around by dragging, slide smoothly along walls and furniture (`0.22 m` collision radius) with contextual bump hints, and track position on a live 2D radar minimap.

### 4. 27-Piece Scaled Furniture Catalogue
- **5 Categories**:
  - **Bedroom**: Double bed (`bed`), Single bed (`sbed`), Nightstand, Wardrobe, Dresser, Vanity with mirror & stool.
  - **Living**: Sofa, L-Sofa sectional, Armchair, Coffee table, TV unit (with 16:9 flat-screen TV), Woven rug, Bookcase.
  - **Dining**: Dining table + chairs set, Round table, Chair, Sideboard.
  - **Kitchen & Bath**: Kitchen counter (with stainless sink, gooseneck tap & 4-ring hob), Fridge, Washing machine, Glass shower enclosure, Bathtub, Toilet, Washbasin vanity with mirror.
  - **Other**: Office desk (with open laptop prop), Utility table, Potted plant.
- **Clearance & Collision Engine**: 4-way clearance distance lines (`src/core/clearance.js`) to the nearest wall or furniture piece, optional wall-collision blocking during drags, `90°` rotation (`R`), horizontal mirror flip (`F`), duplication, and deletion.

### 5. Bilingual (`English` / `العربية`) & Dual Theme (`White` / `Black`)
- Instant language switching between English (`dir="ltr"`) and Arabic (`dir="rtl"`) across all UI controls, room names, dimensions, compass cardinals, and keyboard hints (`311` parity-checked translation keys).
- Instant theme switching between **White** (light architectural drafting & daylight acrylic) and **Black** (dark CAD & midnight acrylic) with smooth opacity/color micro-transitions.

---

## Tech Stack

- **Frontend Framework**: [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`, reactive singleton stores)
- **3D Engine**: [Three.js `0.160.0`](https://threejs.org/) (`OrbitControls`, `RoomEnvironment` PMREM IBL, `AgXToneMapping`, procedural PBR `CanvasTexture` generator)
- **Build Tool**: [Vite 6](https://vite.dev/) (`@vitejs/plugin-vue`)
- **Zero External Asset Dependencies**: All 2D SVG vectors, 3D geometries, and 22 PBR texture sets are generated procedurally in-browser.

---

## Project Structure

```text
my-apartment-plan/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── AGENTS.md
└── src/
    ├── main.js
    ├── App.vue
    ├── assets/styles/
    │   ├── tokens.css              # Light/Dark CAD tokens & VisionOS frosted-glass variables
    │   └── base.css                # Full-viewport HUD layout, transitions & responsive styles
    ├── core/
    │   ├── scale.js                # Meter <-> SVG centimeter conversion, snapping & formatting
    │   ├── walls.js                # Dynamic wall merging, open passages, railings & room geometry
    │   ├── roomSnap.js             # Magnetic edge/corner snapping & non-overlapping room placement
    │   ├── openings.js             # Wall-segment snapping, door swing geometry & swing collision check
    │   ├── clearance.js            # 4-way furniture clearance rays, overlap & wall-blocked movement
    │   ├── furnitureShapes2D.js    # Top-down 2D SVG architectural primitives for all 27 items
    │   └── furnitureShapes3D.js    # Extruded 2D-matched 3D silhouettes for Blueprint mode
    ├── data/
    │   ├── roomPresets.js          # Space presets (Living, Bedroom, Kitchen, Bath, Hall, Terrace, Void)
    │   ├── openingSpecs.js         # Min/max/default widths & 3D heights (H3) for doors/windows
    │   ├── furnitureCatalog.js     # 27 furniture definitions with EN/AR names & default dimensions
    │   ├── materialPresets.js      # 22 PBR texture presets, color swatches & style resolvers
    │   └── samplePlans.js          # Blank Plan, 1BR Studio Starter & 3BR Apartment Demo (111.56 m²)
    ├── i18n/
    │   ├── en.js                   # English strings (311 keys)
    │   ├── ar.js                   # Arabic strings (311 keys)
    │   └── useI18n.js              # Reactive locale switcher, RTL document sync & number formatter
    ├── stores/
    │   ├── usePlanStore.js         # Rooms, openEdges, openings, furniture, sceneStyle, Undo/Redo & persistence
    │   └── useUiStore.js           # Mode (2D/3D), theme, active tool, selection, HUD collapse states
    ├── composables/
    │   ├── useCanvasPanZoom.js     # 2D SVG viewBox pan, wheel/pinch zoom & fit-to-plan
    │   ├── useDragLifecycle.js     # Unified pointer drag/resize lifecycle for rooms, openings & furniture
    │   ├── useMeasureTool.js       # Interactive 2D point-to-point tape measure
    │   ├── useKeyboardShortcuts.js # Global keyboard shortcuts (V, B, M, R, F, Esc, Del, Undo/Redo)
    │   └── useStyleControls.js     # Shared 3D finish/texture/atmosphere helpers for sidebar & inspectors
    ├── three/
    │   ├── textureGenerator.js     # Procedural 512x512 PBR albedo, Sobel normal & physical roughness maps
    │   ├── buildWallsAndFloors3D.js# 3D floors, pedestal, compass ring, stucco/plaster walls, AO & openings
    │   ├── buildFurniture3D.js     # Detailed multi-part 3D PBR models & contact shadows for all 27 items
    │   ├── useThreeScene.js        # Three.js renderer, AgX lighting, solar math, raycasting & camera fly
    │   └── useWalkMode.js          # First-person 1.60m walk controller, collision sliding & 2D minimap
    └── components/
        ├── layout/                 # AppHeader.vue, CanvasToolbar.vue, StudioSidebar.vue
        ├── canvas2d/               # FloorPlanCanvas.vue + 8 SVG layers (Rooms, Openings, Compass, etc.)
        ├── canvas3d/               # FloorPlan3DView.vue, WalkHudOverlay.vue
        ├── palette/                # BuilderPalette.vue, Room/Opening/Furniture cards, SceneStylePanel.vue
        ├── inspector/              # InspectorPanel.vue, Room/Opening/Furniture inspectors
        └── summary/                # ProjectDataModal.vue, RoomsSummaryTable.vue
```

---

## Getting Started

### Prerequisites
- **Node.js** `>= 18` and **npm**

### Install & Run Development Server

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser.

### Build & Preview Production Bundle

```bash
npm run build
npm run preview
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `V` | Select / Move tool (2D) |
| `B` | Draw room tool (sketch rectangle on 2D grid) |
| `M` | Tape measure tool (2D) |
| `R` | Rotate selected furniture `90°` (or rotate selected room) |
| `F` | Flip selected furniture, door swing, or room dimensions |
| `Delete` / `Backspace` | Delete selected room, opening, or furniture item |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | Redo |
| `Shift` (while dragging/resizing) | Fine `1 cm` (`0.01 m`) snap instead of `5 cm` (`0.05 m`) |
| `Space` + Drag / Middle-Click Drag | Pan 2D canvas |
| `WASD` / Arrow Keys (in 3D Walk mode) | Walk forward/back/strafe/turn (hold `Shift` for fast walk) |
| `Escape` | Exit Walk mode, cancel active tool, or clear selection |
