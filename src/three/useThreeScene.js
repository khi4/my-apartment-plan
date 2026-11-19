/**
 * Three.js scene lifecycle, PBR lighting & render modes, OrbitControls,
 * projected HTML room labels, raycast hover/selection, and Walk mode orchestration.
 */

import { fmt } from '../core/scale.js';
import { getRoomRects, computePlanGeometry, roomAt } from '../core/walls.js';
import { P } from '../core/openings.js';
import { FURNITURE_BY_TYPE } from '../data/furnitureCatalog.js';
import { DEFAULT_SCENE_STYLE } from '../data/materialPresets.js';
import { H3 } from '../data/openingSpecs.js';
import { createTextureManager } from './textureGenerator.js';
import {
  buildWallsAndFloors3D,
  inSide,
  isExteriorDoor,
} from './buildWallsAndFloors3D.js';
import { buildFurniture3D } from './buildFurniture3D.js';
import { createWalkController } from './useWalkMode.js';

const ENTRANCE_ROOM_PATTERN = /entrance|lobby|مدخل|بهو/i;

const TIME_MIN = 5.5;
const TIME_MAX = 21.5;

const TIME_KEYFRAMES = [
  {
    t: 5.5, // Dawn start
    sunColor: '#ffb78e',
    sunIntensity: 1.12,
    hemiSky: '#d3dced',
    hemiGround: '#92817a',
    hemiIntensity: 0.42,
    fillColor: '#a9bfde',
    fillIntensity: 0.12,
    ambColor: '#eadbef',
    ambIntensity: 0.04,
    envIntensity: 0.39,
    skyTop: '#5f7391',
    skyBottom: '#d9a48a',
    exposure: 1.08,
  },
  {
    t: 6.5, // Early morning / Dawn
    sunColor: '#ffc9a4',
    sunIntensity: 1.92,
    hemiSky: '#dce7f7',
    hemiGround: '#a29387',
    hemiIntensity: 0.48,
    fillColor: '#b4cae7',
    fillIntensity: 0.13,
    ambColor: '#f3ece5',
    ambIntensity: 0.04,
    envIntensity: 0.44,
    skyTop: '#6e8098',
    skyBottom: '#deb095',
    exposure: 1.04,
  },
  {
    t: 9.5, // Crisp morning
    sunColor: '#fff2de',
    sunIntensity: 3.08,
    hemiSky: '#d9e9f9',
    hemiGround: '#c2b6a4',
    hemiIntensity: 0.62,
    fillColor: '#cfe1f6',
    fillIntensity: 0.14,
    ambColor: '#fff9f0',
    ambIntensity: 0.04,
    envIntensity: 0.54,
    skyTop: '#859daa',
    skyBottom: '#dce2dc',
    exposure: 1.02,
  },
  {
    t: 11.5, // Crisp late-morning / noon daylight
    sunColor: '#fff5e4',
    sunIntensity: 3.42,
    hemiSky: '#deecfa',
    hemiGround: '#c2b8a9',
    hemiIntensity: 0.65,
    fillColor: '#cadcf5',
    fillIntensity: 0.15,
    ambColor: '#f7f7f6',
    ambIntensity: 0.04,
    envIntensity: 0.58,
    skyTop: '#8ca3b1',
    skyBottom: '#e0e4dd',
    exposure: 1.00,
  },
  {
    t: 13.0, // Early afternoon
    sunColor: '#fff5e4',
    sunIntensity: 3.46,
    hemiSky: '#deecfa',
    hemiGround: '#c2b8a9',
    hemiIntensity: 0.65,
    fillColor: '#cadcf5',
    fillIntensity: 0.15,
    ambColor: '#f7f7f6',
    ambIntensity: 0.04,
    envIntensity: 0.58,
    skyTop: '#8ca3b1',
    skyBottom: '#e0e4dd',
    exposure: 1.00,
  },
  {
    t: 16.0, // Warm afternoon
    sunColor: '#ffe1be',
    sunIntensity: 2.92,
    hemiSky: '#d7e6f7',
    hemiGround: '#ac9e8a',
    hemiIntensity: 0.58,
    fillColor: '#bfd2ec',
    fillIntensity: 0.14,
    ambColor: '#f7f2ec',
    ambIntensity: 0.04,
    envIntensity: 0.52,
    skyTop: '#859ba8',
    skyBottom: '#dfd8c6',
    exposure: 1.02,
  },
  {
    t: 18.0, // Golden dusk west
    sunColor: '#ffb37a',
    sunIntensity: 1.82,
    hemiSky: '#b4c6dd',
    hemiGround: '#8f7970',
    hemiIntensity: 0.43,
    fillColor: '#9aafd3',
    fillIntensity: 0.12,
    ambColor: '#eadbec',
    ambIntensity: 0.04,
    envIntensity: 0.40,
    skyTop: '#657892',
    skyBottom: '#dcad92',
    exposure: 1.07,
  },
  {
    t: 19.3, // Twilight transition
    sunColor: '#a0b7db',
    sunIntensity: 0.42,
    hemiSky: '#8194ba',
    hemiGround: '#605356',
    hemiIntensity: 0.33,
    fillColor: '#8c9ebf',
    fillIntensity: 0.11,
    ambColor: '#b9c3d7',
    ambIntensity: 0.04,
    envIntensity: 0.29,
    skyTop: '#24314a',
    skyBottom: '#595570',
    exposure: 1.09,
  },
  {
    t: 21.0, // Moonlit night
    sunColor: '#93addb',
    sunIntensity: 0.40,
    hemiSky: '#677ba5',
    hemiGround: '#474351',
    hemiIntensity: 0.27,
    fillColor: '#7183ac',
    fillIntensity: 0.08,
    ambColor: '#aab9d5',
    ambIntensity: 0.04,
    envIntensity: 0.23,
    skyTop: '#162030',
    skyBottom: '#34465a',
    exposure: 1.1,
  },
  {
    t: 21.5, // Late night
    sunColor: '#93addb',
    sunIntensity: 0.40,
    hemiSky: '#677ba5',
    hemiGround: '#474351',
    hemiIntensity: 0.27,
    fillColor: '#7183ac',
    fillIntensity: 0.08,
    ambColor: '#aab9d5',
    ambIntensity: 0.04,
    envIntensity: 0.23,
    skyTop: '#162030',
    skyBottom: '#34465a',
    exposure: 1.1,
  },
];

function clampNum(v, lo, hi) {
  return v <= lo ? lo : v >= hi ? hi : v;
}

function lerpNum(a, b, k) {
  return a + (b - a) * k;
}

function smoothstep01(k) {
  const u = clampNum(k, 0, 1);
  return u * u * (3 - 2 * u);
}

function normalizeCompassDeg(northDeg) {
  const raw =
    northDeg === null || northDeg === undefined || northDeg === '' || typeof northDeg === 'boolean'
      ? 0
      : Number(northDeg);
  return Number.isFinite(raw) ? ((raw % 360) + 360) % 360 : 0;
}

function solarVectorsFromCompass(worldAzDeg, sunElevationDeg) {
  const azRad = (worldAzDeg * Math.PI) / 180;
  const altRad = (sunElevationDeg * Math.PI) / 180;
  const dirX = Math.cos(altRad) * Math.sin(azRad);
  const dirY = Math.sin(altRad);
  const dirZ = -Math.cos(altRad) * Math.cos(azRad);
  return {
    sunOffset: [dirX * 1.65, dirY * 1.65, dirZ * 1.65],
    fillOffset: [-dirX * 1.15, Math.max(0.55, 0.9 - dirY * 0.25), -dirZ * 1.15],
  };
}

/**
 * Computes continuous time-of-day sun arc, hemisphere/fill bounce, sky gradient,
 * compass-driven spherical solar direction, IBL intensity, and warm interior point lights
 * across `5.5` (Dawn) .. `21.5` (Night). Keeps crisp studio lighting when `preset === 'studio'`.
 */
export function computeTimeOfDayLighting(
  timeOfDay = 11.5,
  look = 'white',
  preset = 'daylight',
  northDeg = 0,
) {
  const rawTime =
    timeOfDay === null || timeOfDay === undefined || timeOfDay === '' || typeof timeOfDay === 'boolean'
      ? NaN
      : Number(timeOfDay);
  const t = clampNum(Number.isFinite(rawTime) ? rawTime : 11.5, TIME_MIN, TIME_MAX);
  const normalizedLook = look === 'black' ? 'black' : 'white';
  const normalizedPreset = typeof preset === 'string' && preset.trim() ? preset.trim() : 'daylight';
  const north = normalizeCompassDeg(northDeg);

  if (normalizedPreset === 'studio') {
    const isBlack = normalizedLook === 'black';
    const skyTop = isBlack ? '#17191e' : '#aebbc4';
    const skyBottom = isBlack ? '#252932' : '#dbe0df';
    const skyMid = mix(skyTop, skyBottom, 0.55);
    const worldAzDeg = (north + 145) % 360;
    const sunElevationDeg = 58;
    const { sunOffset, fillOffset } = solarVectorsFromCompass(worldAzDeg, sunElevationDeg);
    return {
      preset: 'studio',
      timeOfDay: t,
      northDeg: north,
      sunAzimuthDeg: Math.round(worldAzDeg * 10) / 10,
      sunElevationDeg: Math.round(sunElevationDeg * 10) / 10,
      sunColor: '#ffffff',
      sunIntensity: 2.85,
      sunOffset,
      hemiSky: '#f6f8ff',
      hemiGround: '#c9c1b4',
      hemiIntensity: 0.64,
      fillColor: '#f3f6fb',
      fillIntensity: 0.21,
      fillOffset,
      ambColor: '#ffffff',
      ambIntensity: 0.04,
      envIntensity: 0.62,
      pointColor: '#ffcc98',
      pointIntensity: 0,
      skyTop,
      skyMid,
      skyBottom,
      horizonColor: skyBottom,
      exposure: 1.02,
      isNight: isBlack,
    };
  }

  let k0 = TIME_KEYFRAMES[0];
  let k1 = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1];
  for (let i = 0; i < TIME_KEYFRAMES.length - 1; i++) {
    const a = TIME_KEYFRAMES[i];
    const b = TIME_KEYFRAMES[i + 1];
    if (t >= a.t && t <= b.t) {
      k0 = a;
      k1 = b;
      break;
    }
  }

  const spanT = k1.t - k0.t;
  const u = spanT > 1e-6 ? clampNum((t - k0.t) / spanT, 0, 1) : 0;
  const s = smoothstep01(u);

  const skyTop = mix(k0.skyTop, k1.skyTop, s);
  const skyBottom = mix(k0.skyBottom, k1.skyBottom, s);
  const skyMid = mix(skyTop, skyBottom, 0.55);

  let pointIntensity = 0;
  if (t > 17.5) {
    const pk = clampNum((t - 17.5) / (21.0 - 17.5), 0, 1);
    pointIntensity = 13 * smoothstep01(pk);
  }

  let solarLocalDeg;
  let sunElevationDeg;
  if (t <= 18.5) {
    const dayP = clampNum((t - 5.5) / (18.5 - 5.5), 0, 1);
    solarLocalDeg = 80 + 200 * dayP;
    sunElevationDeg = 9 + 55 * Math.sin(Math.PI * dayP);
  } else {
    const nightP = clampNum((t - 18.5) / (21.5 - 18.5), 0, 1);
    solarLocalDeg = lerpNum(280, 330, nightP);
    sunElevationDeg = lerpNum(9, 48, smoothstep01(nightP));
  }
  const worldAzDeg = (north + solarLocalDeg) % 360;
  const { sunOffset, fillOffset } = solarVectorsFromCompass(worldAzDeg, sunElevationDeg);

  return {
    preset: normalizedPreset,
    timeOfDay: t,
    northDeg: north,
    sunAzimuthDeg: Math.round(worldAzDeg * 10) / 10,
    sunElevationDeg: Math.round(sunElevationDeg * 10) / 10,
    sunColor: mix(k0.sunColor, k1.sunColor, s),
    sunIntensity: lerpNum(k0.sunIntensity, k1.sunIntensity, s),
    sunOffset,
    hemiSky: mix(k0.hemiSky, k1.hemiSky, s),
    hemiGround: mix(k0.hemiGround, k1.hemiGround, s),
    hemiIntensity: lerpNum(k0.hemiIntensity, k1.hemiIntensity, s),
    fillColor: mix(k0.fillColor, k1.fillColor, s),
    fillIntensity: lerpNum(k0.fillIntensity, k1.fillIntensity, s),
    fillOffset,
    ambColor: mix(k0.ambColor, k1.ambColor, s),
    ambIntensity: lerpNum(k0.ambIntensity, k1.ambIntensity, s),
    envIntensity: lerpNum(k0.envIntensity, k1.envIntensity, s),
    pointColor: '#ffcc98',
    pointIntensity,
    skyTop,
    skyMid,
    skyBottom,
    horizonColor: skyBottom,
    exposure: lerpNum(k0.exposure, k1.exposure, s),
    isNight: t >= 18.75 || t <= 5.75,
  };
}

function rgba(s) {
  const str = String(s || '').trim();
  if (!str) return [0, 0, 0, 1];
  if (str[0] === '#') {
    let h = str.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length >= 6) {
      return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0).concat(1);
    }
  }
  const n = (str.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
  return [n[0] || 0, n[1] || 0, n[2] || 0, n[3] == null ? 1 : n[3]];
}

const hexOf = c =>
  '#' +
  c
    .slice(0, 3)
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');

function mix(a, b, k) {
  const A = rgba(a);
  const B = rgba(b);
  return hexOf([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * k));
}

function cssColors() {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return {
      paper: '#ffffff',
      floor: '#ffffff',
      raise: '#efefef',
      ink: '#111111',
      mid: '#666666',
      lo: '#a3a3a3',
      faint: '#e5e5e5',
      line: '#cfcfcf',
      grid: 'rgba(0,0,0,0.075)',
      lit: '#000000',
    };
  }
  const s = getComputedStyle(document.documentElement);
  const g = k => s.getPropertyValue(k).trim();
  return {
    paper: g('--paper') || '#ffffff',
    floor: g('--floor') || '#ffffff',
    raise: g('--raise') || '#efefef',
    ink: g('--ink') || '#111111',
    mid: g('--mid') || '#666666',
    lo: g('--lo') || '#a3a3a3',
    faint: g('--faint') || '#e5e5e5',
    line: g('--line') || '#cfcfcf',
    grid: g('--grid') || 'rgba(0,0,0,0.075)',
    lit: g('--lit') || '#000000',
  };
}

const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function isObjectVisible(obj) {
  let cur = obj;
  while (cur) {
    if (cur.visible === false) return false;
    cur = cur.parent;
  }
  return true;
}

function resolveHitSelection(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData?.id) return { kind: 'furniture', id: cur.userData.id };
    if (cur.userData?.opId) return { kind: 'opening', id: cur.userData.opId };
    if (cur.userData?.room) return { kind: 'room', id: cur.userData.room };
    cur = cur.parent;
  }
  return null;
}

function getDaylightApertures(openings, rooms, wallThickness = DEFAULT_SCENE_STYLE.wallThickness) {
  const inset = wallThickness / 2 + 0.016;
  return openings.flatMap(op => {
    if (!op || (op.kind !== 'window' && op.kind !== 'sliding')) return [];
    const side = inSide(op, rooms);
    if (!side) return [];
    const mid = (op.a1 + op.a2) / 2;
    const outside = roomAt(rooms, ...P(op.o, mid, op.c - side * 0.2));
    if (outside && outside.kind !== 'terrace') return [];
    const [insideX, insideZ] = P(op.o, mid, op.c + side * 0.2);
    const room = roomAt(rooms, insideX, insideZ);
    const rect = getRoomRects(room).find(([x, z, w, d]) =>
      insideX >= x && insideX <= x + w && insideZ >= z && insideZ <= z + d,
    );
    if (!rect) return [];

    const height = op.kind === 'window' ? H3.head - H3.sill : H3.door;
    const y = (op.kind === 'window' ? H3.sill : 0) + height / 2;
    const [x, z] = P(op.o, mid, op.c + side * inset);
    const depth = op.o === 'h' ? rect[3] : rect[2];
    const [aimX, aimZ] = P(op.o, mid, op.c + side * Math.min(depth * 0.6, 2.8));
    return [{
      roomId: room.id,
      position: [x, y, z],
      target: [aimX, Math.max(0.45, y - 0.55), aimZ],
      outward: [op.o === 'v' ? -side : 0, op.o === 'h' ? -side : 0],
      area: Math.abs(op.a2 - op.a1) * height,
      range: clampNum(Math.hypot(depth, H3.head) + 0.45, 2.8, 7.2),
    }];
  });
}

/**
 * Creates and manages the Three.js 3D viewport controller.
 */
export function useThreeScene({
  containerRef,
  mapCanvasRef,
  labelsContainerRef,
  getState,
  uiStore,
  planStore,
  t,
  isAr,
  onDragChange,
}) {
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let texManager = null;
  let M = null;
  let wallMats = null;
  let lightsGroup = null;
  let sceneLights = null;
  let daylightApertures = [];
  let walkLightRoomId = null;
  let groundGroup = null;
  let groundMesh = null;
  let floorsGroup = null;
  let wallsGroup = null;
  let gridGroup = null;
  let furnGroup = null;
  let compassGroup = null;
  let envRT = null;
  let walkCtrl = null;
  let resizeObserver = null;
  let loadPromise = null;

  let floors = [];
  let floorHits = [];
  let wallHits = [];
  let openingHits = [];
  let openingGroup = null;
  let interactEl = null;
  let labels = [];
  let C = null;
  let MC = null;

  let anim = null;
  let need = true;
  let running = false;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let hadRooms = false;
  let down = null;
  let walkLook = null;
  let detachPointerListeners = null;
  let lastStyleSig = null;

  const layerVisibility = {
    showLabels: uiStore?.showLabels?.value ?? true,
    showFurniture: uiStore?.showFurniture?.value ?? true,
    showOpenings: uiStore?.showOpenings?.value ?? true,
    showCompass: uiStore?.showCompass?.value ?? true,
  };

  const getIsAr = () =>
    typeof isAr === 'function' ? Boolean(isAr()) : Boolean(isAr?.value ?? isAr);

  const tr = (key, ...args) => (typeof t === 'function' ? t(key, ...args) : key);

  const readState = () => {
    const s = typeof getState === 'function' ? getState() : {};
    const rooms = s.rooms ?? planStore?.rooms?.value ?? [];
    const openEdges = s.openEdges ?? planStore?.openEdges?.value ?? [];
    const openings = s.openings ?? planStore?.openings?.value ?? [];
    const furniture = s.furniture ?? planStore?.furniture?.value ?? [];
    const geometry = s.geometry ?? computePlanGeometry(rooms, openEdges);
    const sceneStyle = s.sceneStyle ?? planStore?.sceneStyle?.value ?? DEFAULT_SCENE_STYLE;
    const selId =
      s.selId !== undefined
        ? s.selId
        : uiStore?.selection?.value?.kind === 'furniture'
          ? uiStore.selection.value.id
          : null;
    const selOpId =
      s.selOpId !== undefined
        ? s.selOpId
        : uiStore?.selection?.value?.kind === 'opening'
          ? uiStore.selection.value.id
          : null;
    const selRoomId =
      s.selRoomId !== undefined
        ? s.selRoomId
        : uiStore?.selection?.value?.kind === 'room'
          ? uiStore.selection.value.id
          : null;
    const hotRoomId = s.hotRoomId !== undefined ? s.hotRoomId : uiStore?.hotRoomId?.value ?? null;
    const gridOn = s.gridOn !== undefined ? s.gridOn : uiStore?.gridOn?.value ?? true;
    const themeLook =
      s.look ??
      uiStore?.look?.value ??
      (typeof document !== 'undefined' ? document.documentElement?.getAttribute?.('data-look') : null) ??
      'white';
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      rooms,
      openEdges,
      openings,
      furniture,
      geometry,
      sceneStyle,
      selId,
      selOpId,
      selRoomId,
      hotRoomId,
      gridOn,
      themeLook: themeLook === 'black' ? 'black' : 'white',
      reducedMotion,
    };
  };

  function getBoundsMetrics() {
    const { geometry } = readState();
    const b = geometry?.bounds || {
      minX: 0,
      minY: 0,
      maxX: 14,
      maxY: 11,
      width: 14,
      height: 11,
      centerX: 7,
      centerY: 5.5,
    };
    const span = Math.max(8, b.width || 0, b.height || 0);
    const scale = Math.max(0.65, span / 13.5);
    return { bounds: b, span, scale };
  }

  function fitFactor() {
    return Math.max(1, 1.25 / (camera?.aspect || 1.2));
  }

  function getHomePose() {
    const { bounds, scale } = getBoundsMetrics();
    const center = new THREE.Vector3(bounds.centerX, 0, bounds.centerY);
    if (readState().sceneStyle?.renderMode === 'realistic') {
      // Frame the occupied volume, including the wall tops on small plans.
      const view = new THREE.Vector3(-0.4, 1.65, 1).normalize();
      const right = new THREE.Vector3(view.z, 0, -view.x).normalize();
      const up = new THREE.Vector3().crossVectors(view, right);
      const target = center.clone().setY(H3.wall * 0.42);
      const tanV = Math.tan(THREE.MathUtils.degToRad(40 / 2));
      const tanH = tanV * (camera?.aspect || 1.2);
      let distance = 5;
      for (const x of [bounds.minX - 0.5, bounds.maxX + 0.5]) {
        for (const z of [bounds.minY - 0.5, bounds.maxY + 0.5]) {
          for (const y of [-0.34, H3.wall]) {
            const corner = new THREE.Vector3(x, y, z).sub(target);
            const fit = Math.max(Math.abs(corner.dot(right)) / tanH, Math.abs(corner.dot(up)) / tanV);
            distance = Math.max(distance, corner.dot(view) + fit * 1.10);
          }
        }
      }
      return { target, pos: target.clone().addScaledVector(view, distance) };
    }
    const f = fitFactor();
    return {
      pos: center.clone().add(new THREE.Vector3(-3 * scale, 13.2 * scale, 15 * scale).multiplyScalar(f)),
      target: center.clone().add(new THREE.Vector3(0, 0, 0.6 * scale)),
    };
  }

  function getTopPose() {
    const { bounds, scale } = getBoundsMetrics();
    const center = new THREE.Vector3(bounds.centerX, 0, bounds.centerY);
    const f = fitFactor();
    return {
      pos: center.clone().add(new THREE.Vector3(0, 19 * scale * f, 0.001)),
      target: center.clone(),
    };
  }

  function fly(to, ms = 450) {
    if (!camera || !controls) return;
    const { reducedMotion } = readState();
    anim = {
      p0: camera.position.clone(),
      t0: controls.target.clone(),
      p1: to.pos,
      t1: to.target,
      s: performance.now(),
      ms: reducedMotion ? 1 : ms,
    };
    need = true;
  }

  function resolveActiveLighting(sceneStyle, themeLook = 'white') {
    const preset = sceneStyle?.lightingPreset || DEFAULT_SCENE_STYLE.lightingPreset || 'daylight';
    const fallbackTime = preset === 'golden' ? 17.75 : preset === 'evening' ? 20.5 : 11.5;
    const timeOfDay = sceneStyle?.timeOfDay ?? fallbackTime;
    const northDeg = sceneStyle?.northDeg ?? 0;
    return computeTimeOfDayLighting(timeOfDay, themeLook, preset, northDeg);
  }

  function getSkyGradient() {
    const { sceneStyle, themeLook } = readState();
    const renderMode = sceneStyle?.renderMode === 'blueprint' ? 'blueprint' : 'realistic';
    if (renderMode === 'blueprint') {
      const c = cssColors();
      const paperHex = hexOf(rgba(c.paper));
      return {
        renderMode: 'blueprint',
        skyTop: paperHex,
        skyMid: paperHex,
        skyBottom: paperHex,
        css: paperHex,
        isNight: themeLook === 'black',
      };
    }
    const cfg = resolveActiveLighting(sceneStyle, themeLook);
    const skyMid = cfg.skyMid || mix(cfg.skyTop, cfg.skyBottom, 0.55);
    return {
      renderMode: 'realistic',
      skyTop: cfg.skyTop,
      skyMid,
      skyBottom: cfg.skyBottom,
      css: `linear-gradient(180deg, ${cfg.skyTop} 0%, ${skyMid} 54%, ${cfg.skyBottom} 100%)`,
      isNight: Boolean(cfg.isNight),
    };
  }

  function createLights() {
    const sun = new THREE.DirectionalLight();
    const hemi = new THREE.HemisphereLight();
    const fill = new THREE.DirectionalLight();
    const ambient = new THREE.AmbientLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00011;
    const fixtures = Array.from({ length: 6 }, () => {
      const light = new THREE.PointLight();
      light.visible = false;
      return light;
    });
    // Broad inward cones approximate diffuse skylight with a room-sized cutoff.
    const glazing = Array.from({ length: 4 }, () => {
      const light = new THREE.SpotLight();
      light.angle = 1.24;
      light.penumbra = 0.82;
      light.visible = false;
      lightsGroup.add(light, light.target);
      return light;
    });
    lightsGroup.add(sun, sun.target, hemi, fill, fill.target, ambient, ...fixtures);
    return { sun, hemi, fill, ambient, fixtures, glazing };
  }

  function fitSunShadow(sun, bounds) {
    const { camera: shadowCamera, mapSize } = sun.shadow;
    // Fit the projected plan, slab and wall tops instead of a fixed square in light space.
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const padding = 0.9;
    const casterBounds = new THREE.Box3(
      new THREE.Vector3(bounds.minX - padding, -0.5, bounds.minY - padding),
      new THREE.Vector3(bounds.maxX + padding, H3.wall + 0.15, bounds.maxY + padding),
    ).applyMatrix4(shadowCamera.matrixWorldInverse);
    const border = 0.08;
    shadowCamera.left = casterBounds.min.x - border;
    shadowCamera.right = casterBounds.max.x + border;
    shadowCamera.bottom = casterBounds.min.y - border;
    shadowCamera.top = casterBounds.max.y + border;
    shadowCamera.near = Math.max(0.05, -casterBounds.max.z - border);
    // A low sun can cast onto the ground well past the plan's footprint.
    const sunHeightRatio = (sun.position.y - sun.target.position.y) /
      sun.position.distanceTo(sun.target.position);
    shadowCamera.far = -casterBounds.min.z + H3.wall / sunHeightRatio + 1;
    shadowCamera.updateProjectionMatrix();
    const texel = Math.max(
      (shadowCamera.right - shadowCamera.left) / mapSize.x,
      (shadowCamera.top - shadowCamera.bottom) / mapSize.y,
    );
    sun.shadow.normalBias = clampNum(texel * 1.25, 0.003, 0.022);
  }

  function updateLights(cfg, bounds, span, rooms) {
    sceneLights ??= createLights();
    const { sun, hemi, fill, ambient, fixtures } = sceneLights;
    sun.color.set(cfg.sunColor);
    sun.intensity = cfg.sunIntensity;
    sun.target.position.set(bounds.centerX, H3.wall / 2, bounds.centerY);
    sun.position.fromArray(cfg.sunOffset).multiplyScalar(span).add(sun.target.position);
    fitSunShadow(sun, bounds);

    hemi.color.set(cfg.hemiSky);
    hemi.groundColor.set(cfg.hemiGround);
    hemi.intensity = cfg.hemiIntensity;
    fill.color.set(cfg.fillColor);
    fill.intensity = cfg.fillIntensity;
    fill.target.position.copy(sun.target.position);
    fill.position.fromArray(cfg.fillOffset).multiplyScalar(span).add(fill.target.position);
    ambient.color.set(cfg.ambColor);
    ambient.intensity = cfg.ambIntensity;

    const indoorRooms = cfg.pointIntensity > 0
      ? rooms.flatMap(room => {
        if (!room || (room.kind !== 'room' && room.kind !== 'hall')) return [];
        const rects = getRoomRects(room);
        if (!rects.length) return [];
        const rectArea = rect => rect[2] * rect[3];
        const rect = rects.reduce((best, cur) => rectArea(cur) > rectArea(best) ? cur : best);
        const area = rects.reduce((sum, cur) => sum + rectArea(cur), 0);
        const entrance = ENTRANCE_ROOM_PATTERN.test(`${room.en || ''} ${room.ar || ''}`);
        return [{ rect, area, entrance }];
      }).sort((a, b) => Number(b.entrance) - Number(a.entrance) || b.area - a.area)
      : [];

    fixtures.forEach((light, index) => {
      const entry = indoorRooms[index];
      light.visible = Boolean(entry);
      if (!entry) return;
      const [x, z, w, d] = entry.rect;
      light.color.set(cfg.pointColor);
      light.intensity = cfg.pointIntensity;
      light.distance = clampNum(Math.hypot(w / 2, d / 2, H3.wall) + 0.45, 3.2, 6.75);
      light.position.set(x + w / 2, H3.wall - 0.25, z + d / 2);
    });
  }

  function updateExposure(cfg, walking) {
    renderer.toneMappingExposure = cfg.exposure * (walking ? 1.14 : 1);
  }

  function updateWalkDaylight(cfg, walking) {
    if (!sceneLights) return;
    walkLightRoomId = walking ? walkCtrl?.currentRoomId() : null;
    const skyLevel = cfg.preset === 'studio' ? 0.85 : smoothstep01((cfg.sunIntensity - 0.45) / 2.55);
    const apertures = walking && skyLevel > 0
      ? daylightApertures.map(aperture => {
        const [x, , z] = aperture.position;
        const distanceSq = (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2;
        const inRoom = aperture.roomId === walkLightRoomId;
        return { aperture, score: aperture.area / (2 + distanceSq) + (inRoom ? 1 : 0) };
      }).sort((a, b) => b.score - a.score)
      : [];
    const [sunX, , sunZ] = cfg.sunOffset;
    const sunColor = new THREE.Color(cfg.sunColor);

    sceneLights.glazing.forEach((light, index) => {
      const entry = apertures[index];
      light.visible = Boolean(entry);
      if (!entry) return;
      const { area, range, position, target, outward } = entry.aperture;
      const facingSun = Math.max(0, (outward[0] * sunX + outward[1] * sunZ) / Math.hypot(...cfg.sunOffset));
      light.color.set(cfg.hemiSky).lerp(sunColor, 0.15 + 0.55 * facingSun);
      light.intensity = skyLevel * (4.5 + Math.min(area, 6) * 2.4) * (0.8 + facingSun * 0.7);
      light.distance = range;
      light.position.fromArray(position);
      light.target.position.fromArray(target);
    });
  }

  function invalidateShadows() {
    if (renderer?.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  }

  function applyEnvIntensityToGroup(root, envMult) {
    if (!root) return;
    const updatedMats = new Set();
    root.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || updatedMats.has(mat)) continue;
        updatedMats.add(mat);
        if (typeof mat.envMapIntensity === 'number') {
          if (!mat.userData) mat.userData = {};
          if (mat.userData.baseEnvIntensity === undefined) {
            mat.userData.baseEnvIntensity = mat.userData.baseEnvMapIntensity ?? mat.envMapIntensity ?? 1;
          }
          mat.envMapIntensity = mat.userData.baseEnvIntensity * envMult;
        }
      }
    });
  }

  function applyRenderStyleAndLighting() {
    if (!THREE || !renderer || !lightsGroup || !groundGroup) return;
    const { rooms, sceneStyle, themeLook } = readState();
    const { bounds, span } = getBoundsMetrics();
    const c = cssColors();
    const renderMode = sceneStyle?.renderMode === 'blueprint' ? 'blueprint' : 'realistic';
    const viewEl = containerRef?.value?.parentElement;

    if (renderMode === 'blueprint') {
      if (scene) {
        scene.environment = null;
      }
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.0;
      lightsGroup.visible = false;
      groundGroup.visible = false;
      renderer.setClearColor(hexOf(rgba(c.paper)), 1);
      if (viewEl?.style) {
        viewEl.style.background = '';
      }

      if (M) {
        const g = rgba(c.grid);
        M.gridMinor.color.set(hexOf(g));
        M.gridMinor.opacity = g[3];
        M.gridMajor.color.set(hexOf(g));
        M.gridMajor.opacity = Math.min(1, g[3] * 2);
      }
    } else {
      const cfg = resolveActiveLighting(sceneStyle, themeLook);
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
      updateExposure(cfg, walkCtrl?.isWalking());
      lightsGroup.visible = true;
      groundGroup.visible = true;

      if (scene) {
        scene.environment = envRT?.texture || null;
        applyEnvIntensityToGroup(scene, cfg.envIntensity);
      }

      if (compassGroup) {
        const rawNorth = Number(sceneStyle?.northDeg);
        const safeNorth = Number.isFinite(rawNorth) ? rawNorth : 0;
        compassGroup.rotation.y = -(safeNorth * Math.PI) / 180;
      }

      // Transparent canvas lets the CSS sky-to-horizon gradient on .view3d shine behind the diorama
      renderer.setClearColor(0x000000, 0);
      if (viewEl?.style) {
        const skyMid = cfg.skyMid || mix(cfg.skyTop, cfg.skyBottom, 0.55);
        viewEl.style.background = `linear-gradient(180deg, ${cfg.skyTop} 0%, ${skyMid} 54%, ${cfg.skyBottom} 100%)`;
      }

      if (M) {
        M.gridMinor.color.set('#111111');
        M.gridMinor.opacity = 0.045;
        M.gridMajor.color.set('#111111');
        M.gridMajor.opacity = 0.09;
      }

      if (!groundMesh) {
        const geo = new THREE.PlaneGeometry(160, 160);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.ShadowMaterial({
          color: '#14171c',
          opacity: 0.25,
          transparent: true,
        });
        groundMesh = new THREE.Mesh(geo, mat);
        groundMesh.receiveShadow = true;
        groundMesh.castShadow = false;
        groundGroup.add(groundMesh);
      }
      groundMesh.material.opacity = cfg.isNight ? 0.34 : 0.25;
      groundMesh.visible = rooms.length > 0;
      groundMesh.position.set(bounds.centerX ?? 7, -0.344, bounds.centerY ?? 5.5);

      updateLights(cfg, bounds, span, rooms);
      updateWalkDaylight(cfg, walkCtrl?.isWalking());
      invalidateShadows();
    }

    need = true;
  }

  function paintHot() {
    const { hotRoomId, selRoomId, selOpId, sceneStyle } = readState();
    const walking = walkCtrl ? walkCtrl.isWalking() : false;
    const activeId = hotRoomId || selRoomId;
    const realistic = sceneStyle?.renderMode !== 'blueprint';

    for (const f of floors) {
      if (f.isRealistic || f.mesh?.material?.isMeshStandardMaterial) {
        const mat = f.mesh.material;
        if (mat?.emissive) {
          const base = f.mesh.userData?.baseEmissive ?? 0x000000;
          mat.emissive.setHex(f.id === activeId && !walking ? 0x262118 : base);
        }
      } else if (C) {
        if (f.kind === 'void') {
          f.mesh.material.color.set(f.id === activeId && !walking ? C.raise : C.faint);
        } else if (f.kind === 'terrace') {
          f.mesh.material.color.set(f.id === activeId && !walking ? C.faint : C.raise);
        } else {
          f.mesh.material.color.set(f.id === activeId && !walking ? C.raise : C.floor);
        }
      }
    }

    if (realistic && openingHits.length) {
      for (const mesh of openingHits) {
        if (!mesh?.userData?.opId) continue;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat && mat.emissive && !mat.transparent && !mat.userData?._shared) {
            const base = mesh.userData.baseEmissive ?? 0x000000;
            mat.emissive.setHex(mesh.userData.opId === selOpId && !walking ? 0x262118 : base);
          }
        }
      }
    }

    for (const l of labels) {
      if (!l.roomId) continue;
      l.el.classList.toggle('hot', !walking && l.roomId === hotRoomId);
      l.el.classList.toggle('sel', !walking && l.roomId === selRoomId);
    }

    need = true;
  }

  function applyLayerVisibility() {
    if (furnGroup) {
      furnGroup.visible = Boolean(layerVisibility.showFurniture);
    }
    if (openingGroup) {
      openingGroup.visible = Boolean(layerVisibility.showOpenings);
    }
    if (compassGroup) {
      compassGroup.visible = Boolean(layerVisibility.showCompass);
    }
    const labelsHost = labelsContainerRef?.value;
    if (labelsHost) {
      const show = Boolean(layerVisibility.showLabels);
      labelsHost.style.opacity = show ? '1' : '0';
      labelsHost.style.visibility = show ? '' : 'hidden';
      labelsHost.style.pointerEvents = show ? '' : 'none';
      labelsHost.setAttribute('aria-hidden', String(!show));
    }
    need = true;
  }

  function setLayersVisibility({ showLabels, showFurniture, showOpenings, showCompass } = {}) {
    if (showLabels !== undefined) layerVisibility.showLabels = Boolean(showLabels);
    if (showFurniture !== undefined && layerVisibility.showFurniture !== Boolean(showFurniture)) {
      layerVisibility.showFurniture = Boolean(showFurniture);
      invalidateShadows();
    }
    if (showOpenings !== undefined && layerVisibility.showOpenings !== Boolean(showOpenings)) {
      layerVisibility.showOpenings = Boolean(showOpenings);
      invalidateShadows();
    }
    if (showCompass !== undefined) layerVisibility.showCompass = Boolean(showCompass);
    applyLayerVisibility();
  }

  function selectAndFocusRoom(roomId) {
    if (!roomId) return;
    uiStore?.select?.('room', roomId);
    if (typeof uiStore?.focusRoom === 'function') {
      uiStore.focusRoom(roomId);
    } else {
      focusOnRoom(roomId);
    }
  }

  function recolor() {
    if (!renderer || !M) return;
    const c = cssColors();
    C = {
      floor: hexOf(rgba(c.floor)),
      raise: hexOf(rgba(c.raise)),
      faint: hexOf(rgba(c.faint)),
    };
    M.faceX.color.set(mix(c.paper, c.ink, 0.075));
    M.faceZ.color.set(mix(c.paper, c.ink, 0.035));
    M.top.color.set(hexOf(rgba(c.ink)));
    M.edge.color.set(hexOf(rgba(c.ink)));
    M.fine.color.set(hexOf(rgba(c.lo)));
    M.dash.color.set(hexOf(rgba(c.lo)));

    M.fTop.color.set(hexOf(rgba(c.raise)));
    M.fSide.color.set(mix(c.paper, c.ink, 0.05));
    M.selTop.color.set(hexOf(rgba(c.line)));
    M.selEdge.color.set(hexOf(rgba(c.lit)));

    const ink = rgba(c.ink);
    MC = {
      floor: hexOf(rgba(c.floor)),
      raise: hexOf(rgba(c.raise)),
      faint: hexOf(rgba(c.faint)),
      ink: hexOf(ink),
      mid: hexOf(rgba(c.mid)),
      lo: hexOf(rgba(c.lo)),
      piece: mix(c.paper, c.ink, 0.22),
      cone: `rgba(${ink[0]},${ink[1]},${ink[2]},0.14)`,
    };

    applyRenderStyleAndLighting();
    paintHot();
  }

  function roomDisplayName(room) {
    if (!room) return '';
    return getIsAr() ? room.ar || room.en || '' : room.en || room.ar || '';
  }

  function relabel() {
    const labelsHost = labelsContainerRef?.value;
    if (!THREE) return;
    const { rooms, openings } = readState();
    const ar = getIsAr();

    if (labelsHost) {
      labelsHost.replaceChildren();
      labels = [];

      const addLabel = (x, y, title, sub, cls = '', roomId = null) => {
        const d = document.createElement('div');
        d.className = `l3${cls ? ` ${cls}` : ''}`;
        d.dir = ar ? 'rtl' : 'ltr';
        if (roomId) {
          d.dataset.roomId = roomId;
          d.setAttribute('role', 'button');
          let dDown = null;
          d.addEventListener('pointerdown', e => {
            if (e.button !== 0 || (interactEl && interactEl.contains(d))) return;
            dDown = { x: e.clientX, y: e.clientY, pid: e.pointerId };
          });
          d.addEventListener('pointerup', e => {
            if (!dDown || e.pointerId !== dDown.pid || (interactEl && interactEl.contains(d))) return;
            const dist = Math.hypot(e.clientX - dDown.x, e.clientY - dDown.y);
            dDown = null;
            if (dist < 5) {
              selectAndFocusRoom(roomId);
            }
          });
          d.addEventListener('pointercancel', () => {
            dDown = null;
          });
        }
        if (title) {
          const b = document.createElement('b');
          b.textContent = title;
          d.appendChild(b);
        }
        if (sub) {
          const span = document.createElement('span');
          span.dir = 'ltr';
          span.textContent = sub;
          d.appendChild(span);
        }
        labelsHost.appendChild(d);
        labels.push({ el: d, v: new THREE.Vector3(x, 0.02, y), roomId });
      };

      for (const room of rooms) {
        if (!room) continue;
        const rects = getRoomRects(room);
        if (!rects.length) continue;
        const [x, y, w, h] = rects[0];
        const area = rects.reduce((sum, r) => sum + r[2] * r[3], 0);
        const name = roomDisplayName(room);
        const sub =
          rects.length === 1 && room.kind !== 'void'
            ? `${fmt(w)} × ${fmt(h)} ${tr('m')}`
            : `${fmt(area)} ${tr('m2')}`;

        if (room.kind === 'void') {
          addLabel(x + w / 2, y + h / 2, name, sub, 'note sm', room.id);
        } else {
          const isSmall = Math.min(w, h) < 2.2 || area < 4.5;
          addLabel(x + w / 2, y + h / 2, name, sub, isSmall ? 'sm' : '', room.id);
        }
      }

      // Add entrance tag outside the primary exterior door if present
      const extDoors = (openings || []).filter(op => op && op.kind === 'door' && isExteriorDoor(op, rooms));
      if (extDoors.length) {
        const preferredDoor =
          extDoors.find(op => {
            const mid = (op.a1 + op.a2) / 2;
            const sd = inSide(op, rooms) || 1;
            const r = roomAt(rooms, ...P(op.o, mid, op.c + sd * 0.2));
            return r && ENTRANCE_ROOM_PATTERN.test(`${r.en || ''} ${r.ar || ''}`);
          }) || extDoors[0];
        const mid = (preferredDoor.a1 + preferredDoor.a2) / 2;
        const sd = inSide(preferredDoor, rooms) || 1;
        const [ex, ey] = P(preferredDoor.o, mid, preferredDoor.c - sd * 0.43);
        addLabel(ex, ey, tr('entrance'), '', 'tag', null);
      }
    }

    if (walkCtrl && walkCtrl.isWalking()) {
      const id = walkCtrl.currentRoomId();
      const activeRoom = id ? rooms.find(r => r.id === id) : null;
      uiStore?.setWalkRoomName?.(roomDisplayName(activeRoom));
    }
    paintHot();
    applyLayerVisibility();
    need = true;
  }

  function placeLabels() {
    const labelsHost = labelsContainerRef?.value;
    const host = containerRef?.value;
    if (!labelsHost || !host || !camera || !controls || !THREE) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    const dist = Math.max(0.1, camera.position.distanceTo(controls.target));
    const k = Math.min(1.3, Math.max(0.72, 17 / dist));
    labelsHost.style.setProperty('--k', k.toFixed(3));

    const tmp = new THREE.Vector3();
    for (const l of labels) {
      tmp.copy(l.v).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      l.el.style.display = vis ? '' : 'none';
      if (vis) {
        const px = ((tmp.x + 1) / 2) * w;
        const py = ((1 - tmp.y) / 2) * h;
        l.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
      }
    }
  }

  function styleGeometrySig(sceneStyle) {
    const s = sceneStyle || DEFAULT_SCENE_STYLE;
    return JSON.stringify({
      renderMode: s.renderMode || 'realistic',
      wallThickness: s.wallThickness,
      outerGroundColor: s.outerGroundColor,
      globalWall: s.globalWall,
      globalFloor: s.globalFloor,
      globalKitchenBathFloor: s.globalKitchenBathFloor,
      globalTerraceFloor: s.globalTerraceFloor,
      globalDoor: s.globalDoor,
      floorUniform: s.floorUniform,
    });
  }

  function syncGeometry() {
    if (!THREE || !floorsGroup || !wallsGroup || !gridGroup) return;
    const { rooms, openEdges, openings, geometry, sceneStyle } = readState();
    const walking = walkCtrl ? walkCtrl.isWalking() : false;
    const res = buildWallsAndFloors3D({
      THREE,
      M,
      wallMats,
      floorsGroup,
      wallsGroup,
      gridGroup,
      rooms,
      openEdges,
      openings,
      geometry,
      walking,
      sceneStyle,
      texManager,
    });
    floors = res.floors;
    floorHits = res.floorHits;
    wallHits = res.wallHits;
    openingHits = res.openingHits || [];
    openingGroup = res.openingGroup || null;
    compassGroup = res.compassGroup || null;
    daylightApertures = getDaylightApertures(openings, rooms, sceneStyle?.wallThickness);
    lastStyleSig = styleGeometrySig(sceneStyle);

    if (controls) {
      const { span } = getBoundsMetrics();
      controls.maxDistance = Math.max(45, span * 3.5);
    }

    const hasRooms = rooms.length > 0;
    if (!hadRooms && hasRooms && !walking && camera && controls) {
      const h0 = getHomePose();
      camera.position.copy(h0.pos);
      controls.target.copy(h0.target);
      controls.update();
    }
    hadRooms = hasRooms;

    applyRenderStyleAndLighting();
    applyLayerVisibility();
    paintHot();
    if (walkCtrl) walkCtrl.rebuildCollisions();
    need = true;
  }

  function syncOpenings() {
    if (!THREE || !wallsGroup) return;
    const { rooms, openEdges, openings, geometry, sceneStyle, themeLook } = readState();
    const walking = walkCtrl ? walkCtrl.isWalking() : false;
    const res = buildWallsAndFloors3D({
      THREE,
      M,
      wallMats,
      floorsGroup: null,
      wallsGroup,
      gridGroup: null,
      rooms,
      openEdges,
      openings,
      geometry,
      walking,
      sceneStyle,
      texManager,
    });
    wallHits = res.wallHits;
    openingHits = res.openingHits || [];
    openingGroup = res.openingGroup || null;
    if (sceneStyle?.renderMode !== 'blueprint') {
      const cfg = resolveActiveLighting(sceneStyle, themeLook);
      daylightApertures = getDaylightApertures(openings, rooms, sceneStyle?.wallThickness);
      updateWalkDaylight(cfg, walking);
      applyEnvIntensityToGroup(wallsGroup, cfg.envIntensity);
      invalidateShadows();
    }
    applyLayerVisibility();
    paintHot();
    if (walkCtrl) walkCtrl.rebuildCollisions();
    need = true;
  }

  function syncFurniture() {
    if (!THREE || !furnGroup) return;
    const { furniture, selId, sceneStyle, themeLook } = readState();
    buildFurniture3D({
      THREE,
      furnGroup,
      furniture,
      selId,
      M,
      renderMode: sceneStyle?.renderMode || 'realistic',
      sceneStyle,
      texManager,
    });
    if (sceneStyle?.renderMode !== 'blueprint') {
      const cfg = resolveActiveLighting(sceneStyle, themeLook);
      applyEnvIntensityToGroup(furnGroup, cfg.envIntensity);
      invalidateShadows();
    }
    applyLayerVisibility();
    if (walkCtrl) walkCtrl.rebuildCollisions();
    need = true;
  }

  function syncStyle() {
    const { sceneStyle } = readState();
    const nextSig = styleGeometrySig(sceneStyle);
    const geomChanged = lastStyleSig !== null && nextSig !== lastStyleSig;
    lastStyleSig = nextSig;

    applyRenderStyleAndLighting();
    if (geomChanged) {
      syncGeometry();
      syncFurniture();
      paintHot();
    }
  }

  function focusOnRoom(roomId) {
    if (!THREE || !camera || !controls) return false;
    if (walkCtrl && walkCtrl.isWalking()) {
      walkCtrl.setWalk(false, true);
    }
    if (!roomId) {
      fly(getHomePose());
      return true;
    }
    const { rooms } = readState();
    const room = (rooms || []).find(r => r && r.id === roomId);
    if (!room) return false;
    const rects = getRoomRects(room);
    if (!rects.length) return false;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [rx, ry, rw, rh] of rects) {
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx + rw);
      maxY = Math.max(maxY, ry + rh);
    }
    const rw = maxX - minX;
    const rh = maxY - minY;
    const rcx = (minX + maxX) / 2;
    const rcy = (minY + maxY) / 2;
    const rSpan = Math.max(2.6, rw, rh);

    fly({
      pos: new THREE.Vector3(rcx - rSpan * 0.7, rSpan * 1.45, rcy + rSpan * 1.55),
      target: new THREE.Vector3(rcx, 0.4, rcy),
    });
    return true;
  }

  function setGrid(on) {
    if (gridGroup) {
      gridGroup.visible = Boolean(on);
      need = true;
    }
  }

  function zoom(factor) {
    if (!camera || !controls) return;
    if (walkCtrl && walkCtrl.isWalking()) {
      walkCtrl.adjustFov(factor);
      return;
    }
    const off = camera.position.clone().sub(controls.target);
    const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * factor));
    fly({ pos: controls.target.clone().add(off.setLength(d)), target: controls.target.clone() }, 250);
  }

  function reset() {
    if (!camera || !controls) return;
    if (walkCtrl && walkCtrl.isWalking()) {
      walkCtrl.resetToEntrance(false);
    } else {
      fly(getHomePose());
    }
  }

  function top() {
    if (!camera || !controls) return;
    if (walkCtrl && walkCtrl.isWalking()) {
      walkCtrl.setWalk(false, true);
    }
    fly(getTopPose());
  }

  function walk(on, instant = false) {
    if (!walkCtrl) return;
    anim = null;
    walkCtrl.setWalk(on, instant);
  }

  function walkKey(e, isDown) {
    return walkCtrl ? walkCtrl.handleWalkKey(e, isDown) : false;
  }

  function setPadHeld(dir, isDown) {
    walkCtrl?.setPadHeld(dir, isDown);
  }

  function floorPoint(e) {
    if (!THREE || !renderer || !camera) return null;
    const cv = renderer.domElement;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, p) ? { x: p.x, y: p.z } : null;
  }

  function center() {
    if (walkCtrl && walkCtrl.isWalking()) {
      return walkCtrl.forwardCenter(1.2);
    }
    if (controls) {
      return { x: controls.target.x, y: controls.target.z };
    }
    const { bounds } = getBoundsMetrics();
    return { x: bounds.centerX, y: bounds.centerY };
  }

  function resize() {
    const host = containerRef?.value;
    if (!host || !renderer || !camera) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    need = true;
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    if (walkCtrl && walkCtrl.isAnimating()) {
      if (walkCtrl.stepTransition(now)) need = true;
    } else if (walkCtrl && walkCtrl.isWalking()) {
      if (walkCtrl.stepWalk(dt)) need = true;
    } else {
      if (anim) {
        const k = Math.min(1, Math.max(0, (now - anim.s) / anim.ms));
        const e = ease(k);
        camera.position.lerpVectors(anim.p0, anim.p1, e);
        controls.target.lerpVectors(anim.t0, anim.t1, e);
        if (k >= 1) anim = null;
        need = true;
      }
      if (controls && controls.update()) need = true;
    }

    if (need) {
      need = false;
      renderer.render(scene, camera);
      if (walkCtrl && walkCtrl.isWalking()) {
        walkCtrl.drawMinimap(MC);
      } else {
        placeLabels();
      }
    }
  }

  function start() {
    if (disposed || !renderer || running) return;
    running = true;
    resize();
    need = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    walkCtrl?.clearInputs();
  }

  function setupScene(ThreeMod, OrbitControls, RoomEnvironment) {
    const host = containerRef?.value;
    if (!host || disposed) return;

    THREE = ThreeMod;
    texManager = createTextureManager(THREE);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const cv = renderer.domElement;
    host.replaceChildren(cv);

    const viewEl = host.parentElement?.classList?.contains('view3d') ? host.parentElement : null;
    interactEl = viewEl || cv;

    scene = new THREE.Scene();
    if (RoomEnvironment && THREE.PMREMGenerator) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const roomEnv = new RoomEnvironment(renderer);
        envRT = pmrem.fromScene(roomEnv, 0.04);
        roomEnv.dispose();
        pmrem.dispose();
      } catch (_) {
        envRT = null;
      }
    }
    camera = new THREE.PerspectiveCamera(40, 1.2, 0.14, 150);
    controls = new OrbitControls(camera, interactEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 2.5;
    controls.maxDistance = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;

    const solid = () =>
      new THREE.MeshBasicMaterial({
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

    M = {
      faceX: solid(),
      faceZ: solid(),
      top: solid(),
      edge: new THREE.LineBasicMaterial(),
      fine: new THREE.LineBasicMaterial(),
      dash: new THREE.LineDashedMaterial({ dashSize: 0.09, gapSize: 0.07 }),
      gridMinor: new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
      gridMajor: new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
      fTop: solid(),
      fSide: solid(),
      selTop: solid(),
      selEdge: new THREE.LineBasicMaterial(),
    };
    wallMats = [M.faceX, M.faceX, M.top, M.faceZ, M.faceZ, M.faceZ];

    lightsGroup = new THREE.Group();
    groundGroup = new THREE.Group();
    floorsGroup = new THREE.Group();
    wallsGroup = new THREE.Group();
    gridGroup = new THREE.Group();
    furnGroup = new THREE.Group();
    scene.add(lightsGroup, groundGroup, floorsGroup, wallsGroup, gridGroup, furnGroup);

    walkCtrl = createWalkController({
      THREE,
      camera,
      controls,
      mapCanvasRef,
      getState: () => ({
        ...readState(),
        getHomePose,
      }),
      onNeedRender: () => {
        need = true;
      },
      onRoomChange: (roomId, pos) => {
        const { rooms, sceneStyle, themeLook } = readState();
        if (walkCtrl?.isWalking() && roomId !== walkLightRoomId && sceneStyle?.renderMode !== 'blueprint') {
          updateWalkDaylight(resolveActiveLighting(sceneStyle, themeLook), true);
        }
        const r = roomId ? rooms.find(item => item.id === roomId) : null;
        uiStore?.setWalkRoomName?.(roomDisplayName(r));
        uiStore?.setCoord?.(pos);
        if (uiStore?.hotRoomId?.value !== roomId) {
          uiStore?.setHotRoom?.(roomId);
        } else {
          paintHot();
        }
      },
      onWalkingChange: isWalking => {
        const ceilings = floorsGroup?.getObjectByName('walk-ceilings');
        if (ceilings) ceilings.visible = isWalking;
        const shut = wallsGroup?.getObjectByName('shut');
        if (shut) shut.visible = isWalking;
        const extOpen = wallsGroup?.getObjectByName('extOpen');
        if (extOpen) extOpen.visible = !isWalking;
        const { sceneStyle, themeLook } = readState();
        if (sceneStyle?.renderMode !== 'blueprint') {
          const cfg = resolveActiveLighting(sceneStyle, themeLook);
          updateExposure(cfg, isWalking);
          updateWalkDaylight(cfg, isWalking);
          invalidateShadows();
        }
        if (uiStore && uiStore.walking.value !== isWalking) {
          uiStore.setWalking(isWalking);
        }
        paintHot();
        if (!isWalking) {
          uiStore?.setWalkRoomName?.('');
          uiStore?.setCoord?.(null);
          uiStore?.setHotRoom?.(null);
        }
        need = true;
      },
      onHint: hit => {
        if (!uiStore?.setHint) return;
        if (!hit) {
          uiStore.setHint(null);
          return;
        }
        let msg;
        if (hit.kind === 'item') {
          const def = FURNITURE_BY_TYPE[hit.type];
          const typeName = def ? (getIsAr() ? def.ar : def.en) : hit.type;
          msg = tr('itemAhead', typeName);
        } else if (hit.kind === 'door') {
          msg = tr('doorOut');
        } else if (hit.kind === 'rail') {
          msg = tr('railAhead');
        } else {
          msg = tr('wallAhead');
        }
        uiStore.setHint(msg, 1400);
      },
    });

    controls.addEventListener('change', () => {
      need = true;
    });
    controls.addEventListener('start', () => {
      anim = null;
    });

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    // Raycast hover and selection on 3D canvas
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const aim = e => {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      ndc.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      return true;
    };

    const onPointerDown = e => {
      if (e.target?.closest?.('.v3-pad, .v3-map, button, a, input')) return;
      const labelEl = e.target?.closest?.('.l3[data-room-id]');
      down = {
        x: e.clientX,
        y: e.clientY,
        b: e.button,
        labelRoomId: labelEl?.dataset?.roomId || null,
      };
      onDragChange?.(true);
      if (walkCtrl.isWalking()) {
        walkLook = { x: e.clientX, y: e.clientY };
        try {
          interactEl.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    const onPointerUp = e => {
      onDragChange?.(false);
      walkLook = null;
      if (down && down.b === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        if (down.labelRoomId) {
          selectAndFocusRoom(down.labelRoomId);
        } else if (aim(e)) {
          const furnMeshes = [];
          furnGroup.traverse(o => {
            if (o.isMesh) furnMeshes.push(o);
          });
          const hits = ray
            .intersectObjects([...floorHits, ...wallHits, ...furnMeshes], false)
            .filter(h => isObjectVisible(h.object));
          const sel = hits[0] ? resolveHitSelection(hits[0].object) : null;
          if (sel) {
            uiStore?.select?.(sel.kind, sel.id);
          } else {
            uiStore?.clearSelection?.();
          }
        }
      }
      down = null;
    };

    const onPointerCancel = () => {
      onDragChange?.(false);
      walkLook = null;
      down = null;
    };

    const onPointerMove = e => {
      if (walkCtrl.isWalking()) {
        if (walkLook && e.buttons && !walkCtrl.isAnimating()) {
          walkCtrl.handleWalkLookDrag(e.clientX - walkLook.x, e.clientY - walkLook.y);
          walkLook = { x: e.clientX, y: e.clientY };
        }
        return;
      }
      if (e.buttons) return;

      const labelEl = e.target?.closest?.('.l3[data-room-id]');
      if (labelEl?.dataset?.roomId) {
        const lid = labelEl.dataset.roomId;
        const prevHot = uiStore?.hotRoomId?.value ?? null;
        if (lid !== prevHot) {
          uiStore?.setHotRoom?.(lid);
        } else {
          paintHot();
        }
        return;
      }

      if (!aim(e)) return;

      const hits = ray
        .intersectObjects([...floorHits, ...wallHits], false)
        .filter(h => isObjectVisible(h.object));
      const hit = hits[0];
      const id = hit?.object?.userData?.room || null;
      const p = floorPoint(e);
      const { bounds } = getBoundsMetrics();
      const inBounds =
        p &&
        p.x >= Math.min(-1, bounds.minX - 1) &&
        p.x <= Math.max(15, bounds.maxX + 1) &&
        p.y >= Math.min(-1, bounds.minY - 1) &&
        p.y <= Math.max(12, bounds.maxY + 1);
      uiStore?.setCoord?.(inBounds ? p : null);

      const prevHot = uiStore?.hotRoomId?.value ?? null;
      if (id !== prevHot) {
        uiStore?.setHotRoom?.(id);
      } else {
        paintHot();
      }
    };

    const onPointerLeave = () => {
      onDragChange?.(false);
      if (walkCtrl.isWalking()) return;
      uiStore?.setCoord?.(null);
      if (uiStore?.hotRoomId?.value) {
        uiStore?.setHotRoom?.(null);
      }
    };

    const onWheel = e => {
      if (!walkCtrl.isWalking()) return;
      e.preventDefault();
      walkCtrl.adjustFov(e.deltaY > 0 ? 1.08 : 1 / 1.08);
    };

    interactEl.addEventListener('pointerdown', onPointerDown);
    interactEl.addEventListener('pointerup', onPointerUp);
    interactEl.addEventListener('pointercancel', onPointerCancel);
    interactEl.addEventListener('pointermove', onPointerMove);
    interactEl.addEventListener('pointerleave', onPointerLeave);
    interactEl.addEventListener('wheel', onWheel, { passive: false });

    detachPointerListeners = () => {
      interactEl?.removeEventListener('pointerdown', onPointerDown);
      interactEl?.removeEventListener('pointerup', onPointerUp);
      interactEl?.removeEventListener('pointercancel', onPointerCancel);
      interactEl?.removeEventListener('pointermove', onPointerMove);
      interactEl?.removeEventListener('pointerleave', onPointerLeave);
      interactEl?.removeEventListener('wheel', onWheel);
    };

    // Initial scene population
    const state = readState();
    hadRooms = state.rooms.length > 0;
    recolor();
    syncGeometry();
    syncFurniture();
    relabel();
    setGrid(state.gridOn);
    applyLayerVisibility();
    resize();

    const h0 = getHomePose();
    camera.position.copy(h0.pos);
    controls.target.copy(h0.target);
    controls.update();

    if (uiStore?.walking?.value) {
      walkCtrl.setWalk(true, true);
    }
  }

  function init() {
    if (disposed) return Promise.resolve(false);
    if (renderer) return Promise.resolve(true);
    if (loadPromise) return loadPromise;

    uiStore?.setThreeStatus?.('loading');
    loadPromise = Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ])
      .then(([ThreeMod, oc, re]) => {
        if (disposed) return false;
        setupScene(ThreeMod, oc.OrbitControls, re.RoomEnvironment);
        uiStore?.setThreeStatus?.('ready');
        return true;
      })
      .catch(err => {
        loadPromise = null;
        if (!disposed) {
          uiStore?.setThreeStatus?.('error');
        }
        console.error(err);
        return false;
      });

    return loadPromise;
  }

  function dispose() {
    disposed = true;
    stop();
    detachPointerListeners?.();
    detachPointerListeners = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    walkCtrl?.dispose();
    walkCtrl = null;
    controls?.dispose();
    controls = null;

    sceneLights?.sun.dispose();
    sceneLights = null;
    daylightApertures = [];
    lightsGroup?.clear();
    lightsGroup = null;

    if (scene) {
      scene.environment = null;
    }
    if (envRT) {
      envRT.dispose?.();
      envRT = null;
    }

    if (groundMesh) {
      groundMesh.geometry?.dispose?.();
      groundMesh.material?.dispose?.();
      groundMesh = null;
    }
    groundGroup?.clear();
    groundGroup = null;

    const sharedMats = new Set(Object.values(M || {}));
    const disposedMats = new Set();
    [floorsGroup, wallsGroup, gridGroup, furnGroup].forEach(grp => {
      if (!grp) return;
      if (Array.isArray(grp.userData?.ownedMaterials)) {
        for (const mat of grp.userData.ownedMaterials) {
          if (mat && !sharedMats.has(mat) && !disposedMats.has(mat)) {
            disposedMats.add(mat);
            mat.dispose?.();
          }
        }
        grp.userData.ownedMaterials = [];
      }
      grp.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (mat && !sharedMats.has(mat) && !disposedMats.has(mat)) {
              disposedMats.add(mat);
              mat.dispose?.();
            }
          }
        }
      });
      grp.clear();
    });

    if (M) {
      Object.values(M).forEach(mat => mat && mat.dispose());
      M = null;
    }

    texManager?.dispose?.();
    texManager = null;

    if (renderer) {
      renderer.dispose();
      renderer.domElement?.remove();
      renderer = null;
    }

    if (containerRef?.value?.parentElement?.style) {
      containerRef.value.parentElement.style.background = '';
    }

    labelsContainerRef?.value?.replaceChildren();
    labels = [];
    floors = [];
    floorHits = [];
    wallHits = [];
    openingHits = [];
    openingGroup = null;
    compassGroup = null;
    interactEl = null;
    lastStyleSig = null;
  }

  return {
    init,
    start,
    stop,
    syncGeometry,
    syncOpenings,
    syncFurniture,
    syncStyle,
    syncLighting: applyRenderStyleAndLighting,
    applyRenderStyleAndLighting,
    getSkyGradient,
    recolor,
    relabel,
    paintHot,
    setGrid,
    setLayersVisibility,
    focusOnRoom,
    zoom,
    reset,
    top,
    walk,
    walkKey,
    setPadHeld,
    floorPoint,
    center,
    dispose,
  };
}
