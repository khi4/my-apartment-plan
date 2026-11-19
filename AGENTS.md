# AGENTS.md — Floor Plan Builder

Guide for coding agents working on the **Vue 3 + Vite + Three.js (`0.160.0`)** Floor Plan Builder at the repository root. For user-facing features and setup, read [`README.md`](./README.md).

---

## 1. Repository layout

Run development, build, and verification commands from the repository root.

---

## 2. Architecture & Module Map

- **`src/core/` — Pure Geometry, Scale & Physics (Framework-Agnostic, Headless-Safe)**
  - `scale.js`: Metric conversion (`SCALE = 100` SVG units per meter, `m(v)`, `fromPlan(px)`, `snap(v, fine)`, `fmt(n)`).
  - `walls.js`: Computes merged wall segments (`indoorRuns`), shared interior boundaries (`sharedBoundaries`), perimeter walls, automatic `1.00 m` terrace railings (`railings`), room bounding boxes, and area totals (`computePlanGeometry`).
  - `roomSnap.js`: Magnetic edge/corner alignment (`snapRoomRect`), resize clamping, and non-overlapping room placement.
  - `openings.js`: Snaps doors/sliding doors/windows onto valid wall segments (`SEGS`), enforces corner clearance and overlap rules, computes 2D/3D door swing geometry (`doorGeom`), and detects door-swing collisions with furniture (`checkDoorSwings`).
  - `clearance.js`: Oriented bounding boxes (`furnCorners`), 4-way clearance gap rays (`gapsFor`), furniture overlap detection (`overlaps`), and wall-blocked movement clamping (`clampToRoomWalls`).
  - `furnitureShapes2D.js` & `furnitureShapes3D.js`: Top-down 2D SVG shape generators and Blueprint-mode 3D extrusion parts for all 27 furniture types.
- **`src/data/` — Static Catalogues, Material Presets & Starter Templates**
  - `roomPresets.js`, `openingSpecs.js` (`OP_SPECS`, `H3`), `furnitureCatalog.js` (`FURNITURE_CATALOG`, 27 items), `materialPresets.js` (22 PBR textures across `FLOOR_TEXTURES`, `WALL_TEXTURES`, `DOOR_TEXTURES`, `FURNITURE_TEXTURES`, color swatches, `DEFAULT_SCENE_STYLE`, `DEFAULT_FURNITURE_STYLES`, and `resolve*Style` helpers), `samplePlans.js` (`createBlankPlan`, `createStudioPlan`, `createApartmentPlan`).
- **`src/stores/` — Reactive Singleton State**
  - `usePlanStore.js`: Single source of truth for plan data (`title`, `rooms`, `openEdges`, `openings`, `furniture`, `sceneStyle`, `palettes`), 60-step Undo/Redo history, `localStorage` persistence (`floor-plan-builder-state-v1`), and JSON export/import.
  - `useUiStore.js`: Viewport mode (`2d` / `3d`), theme (`white` / `black`), active 2D tool (`select` / `draw-room` / `measure`), active selection (`{ kind: 'room'|'opening'|'furniture', id }`), layer visibility (`showLabels`, `gridOn`, `showFurniture`, `showOpenings`, `showCompass`), and HUD collapse states (`summaryCollapsed`, `timeCardCollapsed`, `sidebarOpen`, `paletteCollapsed`).
- **`src/three/` — 3D PBR Scene, Procedural Textures, Builders & Walk Mode**
  - `textureGenerator.js`: Procedural `512×512` PBR texture generator (`sampleTextureBuffers`, `createTextureManager`, `getPBRMaterial`).
  - `buildWallsAndFloors3D.js`: Builds 3D room floors, diorama pedestal slab, 3D cardinal compass ring, textured exterior/interior walls with vertical bounce-AO vertex colors, floor-wall contact AO strips, baseboards, 3D framed doors/sliding doors/windows, and glass terrace railings.
  - `buildFurniture3D.js`: Builds multi-part, multi-material 3D PBR models and soft grounded contact shadows for all 27 furniture items (plus Blueprint-mode extrusions).
  - `useThreeScene.js`: Manages `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, `RoomEnvironment` PMREM IBL, `computeTimeOfDayLighting` solar physics, raycast hover/selection, projected HTML room pills, and camera fly transitions.
  - `useWalkMode.js`: First-person (`1.60 m` eye height, `0.22 m` collision radius) walk controller and 2D radar minimap.
- **`src/components/` — Frosted-Glass HUD & 2D/3D Views**
  - `layout/`: `AppHeader.vue` (top-left collapsible summary card + top-right 2D/3D, language, and theme pill bar), `CanvasToolbar.vue` (bottom-left collapsible Time-of-day & North card, bottom-center tool/walk dock, bottom-right camera & layer controls), `StudioSidebar.vue` (single-scroll right floating sidebar).
  - `canvas2d/`: `FloorPlanCanvas.vue` and 8 ordered SVG layers including `CompassRoseLayer.vue` and `GridAndRulersLayer.vue`.
  - `canvas3d/`: `FloorPlan3DView.vue` and `WalkHudOverlay.vue`.
  - `palette/`, `inspector/`, `summary/`: Builder tabs, contextual inspectors, and project/data modal.

---

## 3. Conventions & Technical Rules

### Units, Coordinates & Compass Orientation
- **Meters in state, centimeters in 2D SVG**: All room, opening, and furniture dimensions in `usePlanStore` are in **meters**. Convert to 2D SVG coordinates (`1 m = 100 units`) with `m()` from `src/core/scale.js`.
- **2D to 3D axis mapping**: 2D `(x, y)` maps to 3D `(x, 0, z)` with `+Y` pointing up:
  - Wall height `H3.wall = 2.80 m`
  - Door height `H3.door = 2.10 m`
  - Window sill `H3.sill = 0.90 m`, head `H3.head = 2.10 m`
  - Terrace railing `H3.rail = 1.00 m`
  - Default cutaway wall thickness `sceneStyle.wallThickness = 0.08 m`
- **Compass & Solar Azimuth (`sceneStyle.northDeg`)**:
  - `northDeg` (`0..360°`) is the clockwise angle on the 2D plan where **North** points (`0° = top / -Y in 2D / -Z in 3D`, `90° = East / +X`, `180° = South / +Y / +Z`, `270° = West / -X`).
  - `computeTimeOfDayLighting(timeOfDay, look, preset, northDeg)` in `src/three/useThreeScene.js` computes true spherical solar azimuth and elevation from `timeOfDay` (`5.5` Dawn .. `21.5` Night) rotated by `northDeg`.

### 3D PBR Materials, Lighting & `three@0.160.0` Compatibility
- **Physical `roughnessMap` Scaling**: In Three.js `MeshStandardMaterial`, effective roughness is `material.roughness * roughnessMap.g`. Because `textureGenerator.js` encodes calibrated physical roughness (`0..255`) directly into `roughData`, `getPBRMaterial` sets `material.roughness = 1.0` whenever `roughnessMap` is attached and `roughnessOverride == null`. In the headless fallback (no canvas), it falls back to `preset.roughness`.
- **Wall Finishes**: Keep interior `plaster` smooth and architectural (broad multi-scale Venetian trowel sweeps + eggshell `roughnessMap` variation, `normalScale: 0.38`, no high-frequency 2–4 px sandpaper height spikes). Exterior structural walls use world-meter UV-mapped `stucco-stone` (`normalScale: 0.68`) on vertical side faces and crisp satin `wallCapMat` on top cutaway caps.
- **`three@0.160.0` Specifics**:
  - Realistic mode uses `THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping` (`AgXToneMapping === 6` in `three@0.160.0`).
  - `Scene.environmentIntensity` does **not** exist in `three@0.160.0`. Modulate IBL strength per material via `applyEnvIntensityToGroup(scene, envMult)` using `mat.userData.baseEnvIntensity` / `mat.userData.baseEnvMapIntensity`.
  - Keep `WebGLRenderer({ antialias: true, alpha: true })` and `renderer.setClearColor(0x000000, 0)` in Realistic mode so the dynamic CSS sky gradient on `.view3d` renders seamlessly behind the diorama. Do not add post-processing passes that break canvas alpha transparency.

### Anti-Z-Fighting Rules (Strict Geometry Separation)
Never create two 3D meshes with coplanar faces at identical coordinates:
1. **Floor & Decal Elevation Tiers**:
   - Room floor plane: `y = 0.0000` (void floor: `y = -0.0050`)
   - Horizontal wall-floor AO strip: `y = 0.0022`
   - Vertical wall-floor AO strip: `y = 0.0030`
   - Under-furniture contact shadow quad: `y = 0.0042` (must set `shadowMesh.raycast = () => {}` so shadows never intercept pointer hits)
   - Rug slab: `y = 0.0055..0.0175`; rug border inset strips: `y = 0.0180..0.0215`
2. **Perpendicular Wall & Baseboard Corners**:
   - Keep `wallPieces` export unchanged. In `buildRealistic`, vertical (`'v'`) structural wall cores use `coreHalfTV = Math.max(0.004, coreHalfT - 0.0008)` and `y1V = p.y1 - 0.0012` at wall top height so L-corners and T-junctions never share coplanar top caps or side faces with horizontal (`'h'`) cores.
   - Vertical (`'v'`) interior baseboards use height `0.0644 m` and outer offset `halfT + 0.0066` (vs. `0.065 m` and `halfT + 0.007` on `'h'`).
3. **Frames & Sub-Parts**:
   - Trim vertical jambs/stiles strictly between horizontal top and bottom rails on windows, hinged doors, sliding door frames/sashes, vanity/basin mirror frames, and shower frames.
   - On beds (`buildBed`), the duvet must extend proud of the mattress on the foot (`+0.014 m`), sides (`+0.014 m` each), and top (`+0.028 m`), and headboard vertical stiles/center panel must stop at `y = 0.905` beneath the `0.905..0.950` top cap.

### Headless Node Compatibility
All modules in `src/core/`, `src/data/`, and `src/three/` (`textureGenerator.js`, `buildWallsAndFloors3D.js`, `buildFurniture3D.js`, `useThreeScene.js`) must guard `document` / `window` access (`typeof document !== 'undefined'`) so they can be imported and verified directly in headless Node.js scripts.

### Bilingual (`EN` / `AR`), Themes & Frosted-Glass UI
- **i18n Parity**: Every user-visible string must be added to both `src/i18n/en.js` and `src/i18n/ar.js` with identical keys. Verify key parity whenever adding or removing strings.
- **RTL Layout**: Arabic sets `dir="rtl"` and `lang="ar"` on `<html>`. Use logical alignment or `[dir="rtl"]` rules so floating cards, sliders, and sidebars mirror cleanly.
- **Theme Tokens**: Use CSS variables from `src/assets/styles/tokens.css` (`--glass-surface`, `--glass-ink`, `--glass-mid`, `--glass-lo`, `--glass-border-top`, `--glass-blur`, `--paper`, `--ink`, `--warn`, etc.). Never hard-code light-only or dark-only colors in components.
- **Single-Scroll Sidebar**: Keep `.studio-sidebar-scroll` in `StudioSidebar.vue` as the single vertical scroll container; do not add inner `max-height` / `overflow-y: auto` scroll boxes inside sidebar sections.

---

## 4. Verification Checklist

Before finishing any change in this repository:

1. **Syntax & Production Build**:
   ```bash
   npm run build
   ```
2. **i18n Key Parity Check**:
   ```bash
   node --input-type=module -e '
   import assert from "node:assert/strict";
   import en from "./src/i18n/en.js";
   import ar from "./src/i18n/ar.js";
   assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
   console.log("I18N_KEYS_OK:", Object.keys(en).length);
   '
   ```
3. **Headless 3D Builders, Textures & Lighting Check**:
   ```bash
   node --input-type=module -e '
   import assert from "node:assert/strict";
   import * as THREE from "./node_modules/three/build/three.module.js";
   import { sampleTextureBuffers, createTextureManager } from "./src/three/textureGenerator.js";
   import { computeTimeOfDayLighting } from "./src/three/useThreeScene.js";
   import { buildWallsAndFloors3D } from "./src/three/buildWallsAndFloors3D.js";
   import { buildFurniture3D } from "./src/three/buildFurniture3D.js";
   import { createApartmentPlan, createStudioPlan } from "./src/data/samplePlans.js";
   import { computePlanGeometry } from "./src/core/walls.js";
   import { DEFAULT_SCENE_STYLE } from "./src/data/materialPresets.js";

   const tm = createTextureManager(THREE);
   for (const plan of [createApartmentPlan(), createStudioPlan()]) {
     const geom = computePlanGeometry(plan.rooms, plan.openEdges);
     const floorsGroup = new THREE.Group(), wallsGroup = new THREE.Group(), gridGroup = new THREE.Group(), furnGroup = new THREE.Group();
     buildWallsAndFloors3D({ THREE, floorsGroup, wallsGroup, gridGroup, rooms: plan.rooms, openEdges: plan.openEdges, openings: plan.openings, geom, renderMode: "realistic", sceneStyle: DEFAULT_SCENE_STYLE, texManager: tm });
     buildFurniture3D({ THREE, furnGroup, furniture: plan.furniture, renderMode: "realistic", sceneStyle: DEFAULT_SCENE_STYLE, texManager: tm });
     assert.equal(furnGroup.children.length, plan.furniture.length);
   }
   const plaster = sampleTextureBuffers("plaster");
   assert.equal(plaster.mapData.length, 512 * 512 * 4);
   const noon = computeTimeOfDayLighting(12.5, "white", "daylight", 0);
   assert.ok(noon.sunIntensity > 2.5);
   console.log("3D_HEADLESS_CHECKS_OK");
   '
   ```
4. **Browser & Git Scope Check**:
   - Verify changes at `http://localhost:5173/` across **2D** and **3D** (`Realistic`, `Blueprint`, and `Walk`), **English** and **Arabic**, **White** and **Black** themes, with `0` console errors.
   - Run `git status --short` to review the changed files.
