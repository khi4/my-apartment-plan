import { ref, reactive, computed } from 'vue';
import {
  SPACE_KINDS,
  ROOM_PRESETS,
  ROOM_MIN_SIZE,
  ROOM_MAX_SIZE,
} from '../data/roomPresets.js';
import { OPK, OP_KINDS } from '../data/openingSpecs.js';
import {
  FURN_MIN,
  FURN_MAX,
  FURNITURE_CATALOG,
  FURNITURE_BY_TYPE,
} from '../data/furnitureCatalog.js';
import {
  createBlankPlan,
  createStudioPlan,
  createApartmentPlan,
  SAMPLE_PLANS,
} from '../data/samplePlans.js';
import { DEFAULT_SCENE_STYLE } from '../data/materialPresets.js';

const LS_PLAN_KEY = 'fpb-plan-v1';
const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY = 60;

const VALID_RENDER_MODES = new Set(['realistic', 'blueprint']);
const VALID_LIGHTING_PRESETS = new Set(['daylight', 'golden', 'evening', 'studio']);
const ROOM_STYLE_COLOR_KEYS = ['wallColor', 'floorColor'];
const ROOM_STYLE_TEX_KEYS = ['wallTexture', 'floorTexture'];
const OPENING_STYLE_COLOR_KEYS = ['color', 'frameColor'];
const OPENING_STYLE_TEX_KEYS = ['texture'];
const FURN_STYLE_COLOR_KEYS = ['color', 'accentColor'];
const FURN_STYLE_TEX_KEYS = ['texture'];

const r2 = v => Math.round(Number(v) * 100) / 100;
const clampRoomDim = v => Math.min(ROOM_MAX_SIZE, Math.max(ROOM_MIN_SIZE, r2(v)));
const clampFurnDim = v => Math.min(FURN_MAX, Math.max(FURN_MIN, r2(v)));
const newId = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Validate a CSS hex color string (`#rgb` or `#rrggbb`).
 * Returns normalized lowercase hex string or `undefined`.
 */
export function sanitizeColor(val) {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return undefined;
}

/**
 * Validate a material/texture preset key (non-empty string up to 40 chars).
 * Returns trimmed key or `undefined`.
 */
export function sanitizeTex(val) {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 40) return undefined;
  return trimmed;
}

function sanitizeSurfaceStyle(rawSurf, fallback) {
  if (!rawSurf || typeof rawSurf !== 'object') {
    return { color: fallback.color, texture: fallback.texture };
  }
  return {
    color: sanitizeColor(rawSurf.color) || fallback.color,
    texture: sanitizeTex(rawSurf.texture) || fallback.texture,
  };
}

function sanitizeDoorStyle(rawDoor, fallback) {
  if (!rawDoor || typeof rawDoor !== 'object') {
    return {
      color: fallback.color,
      frameColor: fallback.frameColor,
      texture: fallback.texture,
    };
  }
  return {
    color: sanitizeColor(rawDoor.color) || fallback.color,
    frameColor: sanitizeColor(rawDoor.frameColor) || fallback.frameColor,
    texture: sanitizeTex(rawDoor.texture) || fallback.texture,
  };
}

/**
 * Normalize a solar North azimuth angle in degrees clockwise from top of plan (`0..359`).
 */
export function normalizeNorthDeg(val, fallback = DEFAULT_SCENE_STYLE.northDeg ?? 0) {
  const hasNorth =
    val !== null &&
    val !== undefined &&
    val !== '' &&
    typeof val !== 'boolean';
  const rawNorth = hasNorth ? Number(val) : NaN;
  return Number.isFinite(rawNorth)
    ? ((Math.round(rawNorth) % 360) + 360) % 360
    : fallback;
}

/**
 * Merge raw scene style safely onto `DEFAULT_SCENE_STYLE`.
 */
export function sanitizeSceneStyle(raw) {
  const base = DEFAULT_SCENE_STYLE;
  const fallbackTod = 11.5;
  const fallbackNorth = base.northDeg ?? 0;
  if (!raw || typeof raw !== 'object') {
    return {
      ...clone(base),
      timeOfDay: fallbackTod,
      northDeg: fallbackNorth,
    };
  }

  const hasWt =
    raw.wallThickness !== null &&
    raw.wallThickness !== undefined &&
    raw.wallThickness !== '' &&
    typeof raw.wallThickness !== 'boolean';
  const rawWt = hasWt ? Number(raw.wallThickness) : NaN;
  const wallThickness = Number.isFinite(rawWt)
    ? Math.round(Math.min(0.35, Math.max(0.04, rawWt)) * 1000) / 1000
    : base.wallThickness;

  const hasTod =
    raw.timeOfDay !== null &&
    raw.timeOfDay !== undefined &&
    raw.timeOfDay !== '' &&
    typeof raw.timeOfDay !== 'boolean';
  const rawTod = hasTod ? Number(raw.timeOfDay) : NaN;
  const timeOfDay = Number.isFinite(rawTod)
    ? Math.round(Math.min(21.5, Math.max(5.5, rawTod)) * 100) / 100
    : fallbackTod;

  const northDeg = normalizeNorthDeg(raw.northDeg, fallbackNorth);

  return {
    renderMode: VALID_RENDER_MODES.has(raw.renderMode) ? raw.renderMode : base.renderMode,
    lightingPreset: VALID_LIGHTING_PRESETS.has(raw.lightingPreset)
      ? raw.lightingPreset
      : base.lightingPreset,
    timeOfDay,
    wallThickness,
    northDeg,
    outerGroundColor: sanitizeColor(raw.outerGroundColor) || base.outerGroundColor,
    globalWall: sanitizeSurfaceStyle(raw.globalWall, base.globalWall),
    globalFloor: sanitizeSurfaceStyle(raw.globalFloor, base.globalFloor),
    globalKitchenBathFloor: sanitizeSurfaceStyle(
      raw.globalKitchenBathFloor,
      base.globalKitchenBathFloor,
    ),
    globalTerraceFloor: sanitizeSurfaceStyle(raw.globalTerraceFloor, base.globalTerraceFloor),
    globalDoor: sanitizeDoorStyle(raw.globalDoor, base.globalDoor),
    floorUniform:
      raw.floorUniform === undefined || raw.floorUniform === null
        ? Boolean(base.floorUniform)
        : Boolean(raw.floorUniform),
  };
}

function clearObjectKeys(obj, keys) {
  for (const k of keys) {
    delete obj[k];
  }
}

function applyOptionalStylePatch(target, patch, colorKeys, texKeys) {
  const applyGroup = (keys, sanitizer) => {
    for (const key of keys) {
      if (!(key in patch)) continue;
      const raw = patch[key];
      if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
        delete target[key];
      } else {
        const clean = sanitizer(raw);
        if (clean !== undefined) target[key] = clean;
      }
    }
  };
  applyGroup(colorKeys, sanitizeColor);
  applyGroup(texKeys, sanitizeTex);
}

function mergeStyledPatch(current, patch, colorKeys, texKeys, sanitizer) {
  const nextRaw = { ...current, ...patch, id: current.id };
  for (const k of [...colorKeys, ...texKeys]) {
    if (current[k] !== undefined) nextRaw[k] = current[k];
    else delete nextRaw[k];
  }
  applyOptionalStylePatch(nextRaw, patch, colorKeys, texKeys);
  return sanitizer(nextRaw);
}

function sanitizeRect(rect) {
  if (!Array.isArray(rect) || rect.length < 4) return null;
  const x = Number(rect[0]);
  const y = Number(rect[1]);
  const w = Number(rect[2]);
  const h = Number(rect[3]);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  return [r2(x), r2(y), clampRoomDim(w), clampRoomDim(h)];
}

function sanitizeRoom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawRects = Array.isArray(raw.rects) ? raw.rects : Array.isArray(raw.rect) ? raw.rect : [];
  const rects = rawRects.map(sanitizeRect).filter(Boolean);
  if (!rects.length) return null;

  let kind = SPACE_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) {
    kind = raw.outdoor ? 'terrace' : 'room';
  }

  const en = typeof raw.en === 'string' && raw.en.trim() ? raw.en.trim() : 'Space';
  const arSource = typeof raw.arName === 'string' && raw.arName.trim()
    ? raw.arName.trim()
    : typeof raw.ar === 'string' && raw.ar.trim()
      ? raw.ar.trim()
      : en;

  const out = {
    id: String(raw.id || newId('rm')).slice(0, 32),
    kind,
    en,
    ar: arSource,
    rects,
  };
  if (typeof raw.note === 'string' && raw.note.trim()) out.note = raw.note.trim();
  if (typeof raw.noteAr === 'string' && raw.noteAr.trim()) out.noteAr = raw.noteAr.trim();

  const wallColor = sanitizeColor(raw.wallColor);
  if (wallColor) out.wallColor = wallColor;
  const wallTexture = sanitizeTex(raw.wallTexture);
  if (wallTexture) out.wallTexture = wallTexture;
  const floorColor = sanitizeColor(raw.floorColor);
  if (floorColor) out.floorColor = floorColor;
  const floorTexture = sanitizeTex(raw.floorTexture);
  if (floorTexture) out.floorTexture = floorTexture;

  return out;
}

function sanitizeOpenEdge(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let o = raw.o;
  let c = Number(raw.c);
  let a1 = Number(raw.a1);
  let a2 = Number(raw.a2);

  // Support legacy format { line: [x1, y1, x2, y2] }
  if ((!o || !Number.isFinite(c)) && Array.isArray(raw.line) && raw.line.length === 4) {
    const [x1, y1, x2, y2] = raw.line.map(Number);
    if (Math.abs(y1 - y2) < 1e-4) {
      o = 'h';
      c = y1;
      a1 = x1;
      a2 = x2;
    } else if (Math.abs(x1 - x2) < 1e-4) {
      o = 'v';
      c = x1;
      a1 = y1;
      a2 = y2;
    }
  }

  if (o !== 'h' && o !== 'v') return null;
  if (![c, a1, a2].every(Number.isFinite)) return null;
  const lo = r2(Math.min(a1, a2));
  const hi = r2(Math.max(a1, a2));
  if (hi - lo <= 1e-4) return null;

  return {
    id: String(raw.id || newId('oe')).slice(0, 32),
    o,
    c: r2(c),
    a1: lo,
    a2: hi,
  };
}

function sanitizeOpening(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!OPK[raw.kind]) return null;
  if (raw.o !== 'h' && raw.o !== 'v') return null;
  const c = Number(raw.c);
  const a1 = Number(raw.a1);
  const a2 = Number(raw.a2);
  if (![c, a1, a2].every(Number.isFinite)) return null;
  const lo = r2(Math.min(a1, a2));
  const hi = r2(Math.max(a1, a2));
  if (hi - lo < OPK[raw.kind].min - 1e-3) return null;

  const out = {
    id: String(raw.id || newId('op')).slice(0, 32),
    kind: raw.kind,
    o: raw.o,
    c: r2(c),
    a1: lo,
    a2: hi,
    hs: raw.hs !== false,
    side: raw.side === -1 ? -1 : 1,
  };
  const color = sanitizeColor(raw.color);
  if (color) out.color = color;
  const frameColor = sanitizeColor(raw.frameColor);
  if (frameColor) out.frameColor = frameColor;
  const texture = sanitizeTex(raw.texture);
  if (texture) out.texture = texture;
  return out;
}

function sanitizeFurniture(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!FURNITURE_BY_TYPE[raw.type]) return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const L = Number(raw.L);
  const W = Number(raw.W);
  if (![x, y, L, W].every(Number.isFinite)) return null;

  const out = {
    id: String(raw.id || newId('fn')).slice(0, 32),
    type: raw.type,
    L: clampFurnDim(L),
    W: clampFurnDim(W),
    x: r2(x),
    y: r2(y),
    rot: ((Number(raw.rot) || 0) % 360 + 360) % 360,
    flip: Boolean(raw.flip),
  };
  const color = sanitizeColor(raw.color);
  if (color) out.color = color;
  const accentColor = sanitizeColor(raw.accentColor);
  if (accentColor) out.accentColor = accentColor;
  const texture = sanitizeTex(raw.texture);
  if (texture) out.texture = texture;
  return out;
}

function sanitizeTitle(rawTitle) {
  if (typeof rawTitle === 'string' && rawTitle.trim()) {
    return { en: rawTitle.trim(), ar: rawTitle.trim() };
  }
  if (rawTitle && typeof rawTitle === 'object') {
    const en = typeof rawTitle.en === 'string' && rawTitle.en.trim() ? rawTitle.en.trim() : 'My Floor Plan';
    const ar = typeof rawTitle.ar === 'string' && rawTitle.ar.trim() ? rawTitle.ar.trim() : en;
    return { en, ar };
  }
  return { en: 'My Floor Plan', ar: 'مسقطي الأفقي' };
}

function normalizePlanObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.rooms)) return null;

  const rooms = raw.rooms.map(sanitizeRoom).filter(Boolean);
  if (Array.isArray(raw.outsideTheApartment)) {
    raw.outsideTheApartment.forEach((o, idx) => {
      const rect = sanitizeRect(o?.rect);
      if (rect) {
        rooms.push({
          id: `void_${idx}`,
          kind: 'void',
          en: o.name || 'Void',
          ar: o.ar || o.name || 'فراغ',
          rects: [rect],
        });
      }
    });
  }

  const openEdges = Array.isArray(raw.openEdges)
    ? raw.openEdges.map(sanitizeOpenEdge).filter(Boolean)
    : [];

  let openings = [];
  if (Array.isArray(raw.openings)) {
    openings = raw.openings.map(sanitizeOpening).filter(Boolean);
  } else if (Array.isArray(raw.doors) || Array.isArray(raw.windows)) {
    const doors = (raw.doors || []).map((d, i) => ({
      id: `d${i}`,
      kind: d.type === 'sliding' ? 'sliding' : 'door',
      o: d.geom?.[0],
      c: d.geom?.[1],
      a1: d.geom?.[3],
      a2: d.geom?.[4],
      hs: d.geom?.[5] !== false,
      side: d.geom?.[6] === 1 ? 1 : -1,
    }));
    const windows = (raw.windows || []).map((w, i) => ({
      id: `d${doors.length + i}`,
      kind: 'window',
      o: w.geom?.[0],
      c: w.geom?.[1],
      a1: w.geom?.[3],
      a2: w.geom?.[4],
      hs: true,
      side: 1,
    }));
    openings = [...doors, ...windows].map(sanitizeOpening).filter(Boolean);
  }

  const rawFurn = Array.isArray(raw.furniture)
    ? raw.furniture
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  const furniture = rawFurn.map(sanitizeFurniture).filter(Boolean);

  return {
    title: sanitizeTitle(raw.title),
    rooms,
    openEdges,
    openings,
    furniture,
    sceneStyle: sanitizeSceneStyle(raw.sceneStyle),
  };
}

// Singleton state
const planTitle = ref({ en: 'My Floor Plan', ar: 'مسقطي الأفقي' });
const rooms = ref([]);
const openEdges = ref([]);
const openings = ref([]);
const furniture = ref([]);
const sceneStyle = ref(sanitizeSceneStyle(null));

const roomPaletteSizes = reactive(
  Object.fromEntries(ROOM_PRESETS.map(p => [p.id, [p.across, p.deep]])),
);
const opPaletteWidths = reactive(
  Object.fromEntries(OP_KINDS.map(k => [k, OPK[k].w])),
);
const furnPaletteSizes = reactive(
  Object.fromEntries(FURNITURE_CATALOG.map(f => [f.type, [f.length, f.width]])),
);

const saveStatus = ref('localEmpty');
const past = ref([]);
const future = ref([]);
let saveTimer = null;

function applyNormalizedPlan(plan) {
  planTitle.value = clone(plan.title);
  rooms.value = clone(plan.rooms);
  openEdges.value = clone(plan.openEdges);
  openings.value = clone(plan.openings);
  furniture.value = clone(plan.furniture);
  sceneStyle.value = sanitizeSceneStyle(plan.sceneStyle);
}

function applyPalettes(palettes) {
  if (!palettes || typeof palettes !== 'object') return;
  if (palettes.rooms && typeof palettes.rooms === 'object') {
    ROOM_PRESETS.forEach(p => {
      const v = palettes.rooms[p.id];
      if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n))) {
        roomPaletteSizes[p.id] = [clampRoomDim(v[0]), clampRoomDim(v[1])];
      }
    });
  }
  if (palettes.ops && typeof palettes.ops === 'object') {
    OP_KINDS.forEach(k => {
      const v = palettes.ops[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        opPaletteWidths[k] = Math.min(OPK[k].max, Math.max(OPK[k].min, r2(v)));
      }
    });
  }
  if (palettes.furniture && typeof palettes.furniture === 'object') {
    FURNITURE_CATALOG.forEach(f => {
      const v = palettes.furniture[f.type];
      if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n))) {
        furnPaletteSizes[f.type] = [clampFurnDim(v[0]), clampFurnDim(v[1])];
      }
    });
  }
}

function captureStateString() {
  return JSON.stringify({
    title: planTitle.value,
    rooms: rooms.value,
    openEdges: openEdges.value,
    openings: openings.value,
    furniture: furniture.value,
    sceneStyle: sceneStyle.value,
  });
}

function applySnapshotString(str) {
  try {
    const parsed = JSON.parse(str);
    const norm = normalizePlanObject(parsed);
    if (norm) applyNormalizedPlan(norm);
  } catch (_) {}
}

function flushSave() {
  try {
    const payload = {
      v: 1,
      title: planTitle.value,
      rooms: rooms.value,
      openEdges: openEdges.value,
      openings: openings.value,
      furniture: furniture.value,
      sceneStyle: sceneStyle.value,
      palettes: {
        rooms: clone(roomPaletteSizes),
        ops: clone(opPaletteWidths),
        furniture: clone(furnPaletteSizes),
      },
    };
    localStorage.setItem(LS_PLAN_KEY, JSON.stringify(payload));
    saveStatus.value = 'local';
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      saveStatus.value = 'full';
    } else {
      saveStatus.value = 'localFail';
    }
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveStatus.value = 'saving';
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, SAVE_DEBOUNCE_MS);
}

// Initialize from localStorage or default to the pre-furnished apartment demo
(function initStore() {
  let loaded = false;
  try {
    const rawStr = localStorage.getItem(LS_PLAN_KEY);
    if (rawStr) {
      const parsed = JSON.parse(rawStr);
      const norm = normalizePlanObject(parsed);
      if (norm) {
        const titleEn = String(norm.title?.en || '').trim();
        const titleAr = String(norm.title?.ar || '').trim();
        const isDefault3BrTitle =
          /^3-Bedroom/i.test(titleEn) ||
          /^(?:مسقط\s+)?شقة/.test(titleAr) ||
          titleEn === 'My Floor Plan' ||
          titleAr === 'مسقطي الأفقي';
        const shouldHydrateLegacyFurniture =
          Array.isArray(norm.rooms) &&
          norm.rooms.length === 15 &&
          (!Array.isArray(norm.furniture) || norm.furniture.length === 0) &&
          isDefault3BrTitle;

        let hydrated = false;
        if (shouldHydrateLegacyFurniture) {
          const demoNorm = normalizePlanObject(createApartmentPlan());
          const showcaseFurniture = demoNorm?.furniture?.length
            ? demoNorm.furniture
            : (createApartmentPlan().furniture || []).map(sanitizeFurniture).filter(Boolean);
          if (showcaseFurniture.length > 0) {
            norm.furniture = clone(showcaseFurniture);
            hydrated = true;
          }
        }

        applyNormalizedPlan(norm);
        applyPalettes(parsed.palettes);
        if (hydrated) {
          flushSave();
        } else {
          saveStatus.value = 'local';
        }
        loaded = true;
      }
    }
  } catch (_) {}
  if (!loaded) {
    applyNormalizedPlan(normalizePlanObject(createApartmentPlan()) || createApartmentPlan());
    saveStatus.value = 'localEmpty';
  }
})();

// History (Undo / Redo)
const canUndo = computed(() => past.value.length > 0);
const canRedo = computed(() => future.value.length > 0);

function snapshot() {
  const snap = captureStateString();
  if (past.value.length && past.value[past.value.length - 1] === snap) {
    return;
  }
  past.value.push(snap);
  if (past.value.length > MAX_HISTORY) {
    past.value.shift();
  }
  future.value = [];
}

function undo() {
  if (!past.value.length) return false;
  future.value.push(captureStateString());
  const prev = past.value.pop();
  applySnapshotString(prev);
  scheduleSave();
  return true;
}

function redo() {
  if (!future.value.length) return false;
  past.value.push(captureStateString());
  const next = future.value.pop();
  applySnapshotString(next);
  scheduleSave();
  return true;
}

// Computed stats
function roomArea(room) {
  if (!room || !Array.isArray(room.rects)) return 0;
  return room.rects.reduce((sum, r) => sum + r[2] * r[3], 0);
}

const isEmpty = computed(() => rooms.value.length === 0);

const stats = computed(() => {
  let roomsCount = 0;
  let hallsCount = 0;
  let terracesCount = 0;
  let voidsCount = 0;
  let indoorArea = 0;
  let terraceArea = 0;

  for (const r of rooms.value) {
    const a = roomArea(r);
    if (r.kind === 'room') {
      roomsCount += 1;
      indoorArea += a;
    } else if (r.kind === 'hall') {
      hallsCount += 1;
      indoorArea += a;
    } else if (r.kind === 'terrace') {
      terracesCount += 1;
      terraceArea += a;
    } else if (r.kind === 'void') {
      voidsCount += 1;
    }
  }

  const indoorRounded = r2(indoorArea);
  const terraceRounded = r2(terraceArea);
  return {
    totalSpaces: roomsCount + hallsCount + terracesCount,
    roomsCount,
    hallsCount,
    terracesCount,
    voidsCount,
    indoorArea: indoorRounded,
    terraceArea: terraceRounded,
    totalArea: r2(indoorRounded + terraceRounded),
  };
});

// Plan Title
function setPlanTitle(langOrObj, value) {
  snapshot();
  if (typeof langOrObj === 'object' && langOrObj !== null) {
    planTitle.value = sanitizeTitle(langOrObj);
  } else if (langOrObj === 'en' || langOrObj === 'ar') {
    planTitle.value = {
      ...planTitle.value,
      [langOrObj]: String(value ?? ''),
    };
  }
  scheduleSave();
}

// Room CRUD
function addRoom(roomData, opts = {}) {
  const { record = true, save = true } = opts;
  const candidate = sanitizeRoom({
    id: roomData?.id || newId('rm'),
    kind: roomData?.kind || 'room',
    en: roomData?.en || 'Room',
    ar: roomData?.ar || roomData?.en || 'غرفة',
    rects: roomData?.rects || [[roomData?.x ?? 0, roomData?.y ?? 0, roomData?.across ?? 3.5, roomData?.deep ?? 3.5]],
    note: roomData?.note,
    noteAr: roomData?.noteAr,
    wallColor: roomData?.wallColor,
    wallTexture: roomData?.wallTexture,
    floorColor: roomData?.floorColor,
    floorTexture: roomData?.floorTexture,
  });
  if (!candidate) return null;
  if (record) snapshot();
  rooms.value.push(candidate);
  if (save) scheduleSave();
  return candidate;
}

function updateRoom(id, patch, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === id);
  if (!room || !patch) return null;
  if (record) snapshot();
  if (typeof patch.en === 'string') room.en = patch.en;
  if (typeof patch.ar === 'string') room.ar = patch.ar;
  if (SPACE_KINDS.includes(patch.kind)) room.kind = patch.kind;
  if (Array.isArray(patch.rects)) {
    const valid = patch.rects.map(sanitizeRect).filter(Boolean);
    if (valid.length) room.rects = valid;
  }
  if ('note' in patch) room.note = patch.note || undefined;
  if ('noteAr' in patch) room.noteAr = patch.noteAr || undefined;
  applyOptionalStylePatch(room, patch, ROOM_STYLE_COLOR_KEYS, ROOM_STYLE_TEX_KEYS);
  if (save) scheduleSave();
  return room;
}

function updateRoomRect(id, rectIndex, rect, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === id);
  if (!room) return null;
  const valid = sanitizeRect(rect);
  if (!valid) return null;
  if (record) snapshot();
  if (rectIndex >= 0 && rectIndex < room.rects.length) {
    room.rects[rectIndex] = valid;
  } else {
    room.rects[0] = valid;
  }
  if (save) scheduleSave();
  return room;
}

function addRoomRect(id, rect, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === id);
  const valid = sanitizeRect(rect);
  if (!room || !valid) return null;
  if (record) snapshot();
  room.rects.push(valid);
  if (save) scheduleSave();
  return room;
}

function removeRoomRect(id, rectIndex, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === id);
  if (!room || room.rects.length <= 1) return false;
  if (rectIndex < 0 || rectIndex >= room.rects.length) return false;
  if (record) snapshot();
  room.rects.splice(rectIndex, 1);
  if (save) scheduleSave();
  return true;
}

function swapRoomDims(id, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === id);
  if (!room || !room.rects.length) return null;
  if (record) snapshot();
  room.rects = room.rects.map(([x, y, w, h]) => [x, y, h, w]);
  if (save) scheduleSave();
  return room;
}

function duplicateRoom(id, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === id);
  if (!room) return null;
  if (record) snapshot();
  const copy = clone(room);
  copy.id = newId('rm');
  copy.rects = copy.rects.map(([x, y, w, h]) => [r2(x + 0.5), r2(y + 0.5), w, h]);
  rooms.value.push(copy);
  if (save) scheduleSave();
  return copy;
}

function removeRoom(id, opts = {}) {
  const { record = true, save = true } = opts;
  const idx = rooms.value.findIndex(r => r.id === id);
  if (idx === -1) return false;
  if (record) snapshot();
  rooms.value.splice(idx, 1);
  if (save) scheduleSave();
  return true;
}

function clearRooms(opts = {}) {
  const { record = true, save = true } = opts;
  if (!rooms.value.length && !openEdges.value.length && !openings.value.length) return;
  if (record) snapshot();
  rooms.value = [];
  openEdges.value = [];
  openings.value = [];
  if (save) scheduleSave();
}

// Open Edge CRUD
function addOpenEdge(edgeData, opts = {}) {
  const { record = true, save = true } = opts;
  const edge = sanitizeOpenEdge({ id: edgeData?.id || newId('oe'), ...edgeData });
  if (!edge) return null;
  if (record) snapshot();
  openEdges.value.push(edge);
  if (save) scheduleSave();
  return edge;
}

function removeOpenEdge(id, opts = {}) {
  const { record = true, save = true } = opts;
  const idx = openEdges.value.findIndex(e => e.id === id);
  if (idx === -1) return false;
  if (record) snapshot();
  openEdges.value.splice(idx, 1);
  if (save) scheduleSave();
  return true;
}

function setOpenEdges(nextEdges, opts = {}) {
  const { record = true, save = true } = opts;
  const clean = Array.isArray(nextEdges) ? nextEdges.map(sanitizeOpenEdge).filter(Boolean) : [];
  if (record) snapshot();
  openEdges.value = clean;
  if (save) scheduleSave();
}

function toggleOpenEdge(o, c, a1, a2, opts = {}) {
  const { record = true, save = true } = opts;
  const lo = r2(Math.min(a1, a2));
  const hi = r2(Math.max(a1, a2));
  if (hi - lo <= 1e-4) return false;

  if (record) snapshot();
  const sameLine = e => e.o === o && Math.abs(e.c - c) < 1e-3;
  const overlapping = openEdges.value.filter(e => sameLine(e) && e.a1 < hi - 1e-3 && e.a2 > lo + 1e-3);

  if (overlapping.length > 0) {
    // Turn open passage back into a wall along [lo, hi] (splitting any wider openEdge if needed)
    const next = [];
    for (const e of openEdges.value) {
      if (!sameLine(e) || e.a2 <= lo + 1e-3 || e.a1 >= hi - 1e-3) {
        next.push(e);
        continue;
      }
      if (e.a1 < lo - 1e-3) {
        next.push({ id: newId('oe'), o: e.o, c: e.c, a1: e.a1, a2: lo });
      }
      if (e.a2 > hi + 1e-3) {
        next.push({ id: newId('oe'), o: e.o, c: e.c, a1: hi, a2: e.a2 });
      }
    }
    openEdges.value = next;
    if (save) scheduleSave();
    return false;
  }

  openEdges.value.push({ id: newId('oe'), o, c: r2(c), a1: lo, a2: hi });
  if (save) scheduleSave();
  return true;
}

// Opening CRUD
function addOpening(opData, opts = {}) {
  const { record = true, save = true } = opts;
  const op = sanitizeOpening({ id: opData?.id || newId('op'), ...opData });
  if (!op) return null;
  if (record) snapshot();
  openings.value.push(op);
  if (save) scheduleSave();
  return op;
}

function updateOpening(id, patch, opts = {}) {
  const { record = true, save = true } = opts;
  const op = openings.value.find(o => o.id === id);
  if (!op || !patch) return null;
  const merged = mergeStyledPatch(
    op,
    patch,
    OPENING_STYLE_COLOR_KEYS,
    OPENING_STYLE_TEX_KEYS,
    sanitizeOpening,
  );
  if (!merged) return null;
  if (record) snapshot();
  Object.assign(op, merged);
  for (const k of [...OPENING_STYLE_COLOR_KEYS, ...OPENING_STYLE_TEX_KEYS]) {
    if (merged[k] === undefined) delete op[k];
  }
  if (save) scheduleSave();
  return op;
}

function removeOpening(id, opts = {}) {
  const { record = true, save = true } = opts;
  const idx = openings.value.findIndex(o => o.id === id);
  if (idx === -1) return false;
  if (record) snapshot();
  openings.value.splice(idx, 1);
  if (save) scheduleSave();
  return true;
}

function setOpenings(nextOpenings, opts = {}) {
  const { record = true, save = true } = opts;
  const clean = Array.isArray(nextOpenings) ? nextOpenings.map(sanitizeOpening).filter(Boolean) : [];
  if (record) snapshot();
  openings.value = clean;
  if (save) scheduleSave();
}

function clearOpenings(opts = {}) {
  const { record = true, save = true } = opts;
  if (!openings.value.length) return;
  if (record) snapshot();
  openings.value = [];
  if (save) scheduleSave();
}

// Furniture CRUD
function addFurniture(itemData, opts = {}) {
  const { record = true, save = true } = opts;
  const def = FURNITURE_BY_TYPE[itemData?.type];
  if (!def) return null;
  const item = sanitizeFurniture({
    id: itemData?.id || newId('fn'),
    type: itemData.type,
    L: itemData.L ?? def.length,
    W: itemData.W ?? def.width,
    x: itemData.x ?? 0,
    y: itemData.y ?? 0,
    rot: itemData.rot ?? 0,
    flip: itemData.flip ?? false,
    color: itemData?.color,
    accentColor: itemData?.accentColor,
    texture: itemData?.texture,
  });
  if (!item) return null;
  if (record) snapshot();
  furniture.value.push(item);
  if (save) scheduleSave();
  return item;
}

function updateFurniture(id, patch, opts = {}) {
  const { record = true, save = true } = opts;
  const item = furniture.value.find(i => i.id === id);
  if (!item || !patch) return null;
  const merged = mergeStyledPatch(
    item,
    patch,
    FURN_STYLE_COLOR_KEYS,
    FURN_STYLE_TEX_KEYS,
    sanitizeFurniture,
  );
  if (!merged) return null;
  if (record) snapshot();
  Object.assign(item, merged);
  for (const k of [...FURN_STYLE_COLOR_KEYS, ...FURN_STYLE_TEX_KEYS]) {
    if (merged[k] === undefined) delete item[k];
  }
  if (save) scheduleSave();
  return item;
}

function rotateFurniture(id, deg = 90, opts = {}) {
  const { record = true, save = true } = opts;
  const item = furniture.value.find(i => i.id === id);
  if (!item) return null;
  if (record) snapshot();
  item.rot = ((item.rot + deg) % 360 + 360) % 360;
  if (save) scheduleSave();
  return item;
}

function flipFurniture(id, opts = {}) {
  const { record = true, save = true } = opts;
  const item = furniture.value.find(i => i.id === id);
  if (!item) return null;
  if (record) snapshot();
  item.flip = !item.flip;
  if (save) scheduleSave();
  return item;
}

function duplicateFurniture(id, opts = {}) {
  const { record = true, save = true } = opts;
  const item = furniture.value.find(i => i.id === id);
  if (!item) return null;
  if (record) snapshot();
  const copy = {
    ...item,
    id: newId('fn'),
    x: r2(item.x + 0.3),
    y: r2(item.y + 0.3),
  };
  furniture.value.push(copy);
  if (save) scheduleSave();
  return copy;
}

function removeFurniture(id, opts = {}) {
  const { record = true, save = true } = opts;
  const idx = furniture.value.findIndex(i => i.id === id);
  if (idx === -1) return false;
  if (record) snapshot();
  furniture.value.splice(idx, 1);
  if (save) scheduleSave();
  return true;
}

function clearFurniture(opts = {}) {
  const { record = true, save = true } = opts;
  if (!furniture.value.length) return;
  if (record) snapshot();
  furniture.value = [];
  if (save) scheduleSave();
}

// 3D Scene Style & Finishes
function updateSceneStyle(patch, opts = {}) {
  const { record = true, save = true } = opts;
  if (!patch || typeof patch !== 'object') return sceneStyle.value;
  if (record) snapshot();
  const cur = sceneStyle.value;
  const merged = {
    ...cur,
    ...patch,
    globalWall: patch.globalWall ? { ...cur.globalWall, ...patch.globalWall } : cur.globalWall,
    globalFloor: patch.globalFloor ? { ...cur.globalFloor, ...patch.globalFloor } : cur.globalFloor,
    globalKitchenBathFloor: patch.globalKitchenBathFloor
      ? { ...cur.globalKitchenBathFloor, ...patch.globalKitchenBathFloor }
      : cur.globalKitchenBathFloor,
    globalTerraceFloor: patch.globalTerraceFloor
      ? { ...cur.globalTerraceFloor, ...patch.globalTerraceFloor }
      : cur.globalTerraceFloor,
    globalDoor: patch.globalDoor ? { ...cur.globalDoor, ...patch.globalDoor } : cur.globalDoor,
  };
  sceneStyle.value = sanitizeSceneStyle(merged);
  if (save) scheduleSave();
  return sceneStyle.value;
}

function applyWallStyleToAllRooms(style = {}, opts = {}) {
  const { record = true, save = true } = opts;
  const { color, texture } = style || {};
  if (record) snapshot();
  const cur = sceneStyle.value.globalWall || DEFAULT_SCENE_STYLE.globalWall;
  sceneStyle.value = sanitizeSceneStyle({
    ...sceneStyle.value,
    globalWall: {
      color: sanitizeColor(color) || cur.color,
      texture: sanitizeTex(texture) || cur.texture,
    },
  });
  for (const room of rooms.value) {
    clearObjectKeys(room, ['wallColor', 'wallTexture']);
  }
  if (save) scheduleSave();
  return sceneStyle.value.globalWall;
}

function applyFloorStyleToAllRooms(style = {}, opts = {}) {
  const { record = true, save = true } = opts;
  const { color, texture, includeTerraces = false } = style || {};
  if (record) snapshot();
  const curFloor = sceneStyle.value.globalFloor || DEFAULT_SCENE_STYLE.globalFloor;
  const nextFloor = {
    color: sanitizeColor(color) || curFloor.color,
    texture: sanitizeTex(texture) || curFloor.texture,
  };
  const nextStyle = {
    ...sceneStyle.value,
    globalFloor: nextFloor,
    floorUniform: true,
  };
  if (includeTerraces) {
    nextStyle.globalTerraceFloor = { ...nextFloor };
  }
  sceneStyle.value = sanitizeSceneStyle(nextStyle);
  for (const room of rooms.value) {
    if (includeTerraces || room.kind !== 'terrace') {
      clearObjectKeys(room, ['floorColor', 'floorTexture']);
    }
  }
  if (save) scheduleSave();
  return sceneStyle.value.globalFloor;
}

function applyDoorStyleToAllOpenings(style = {}, opts = {}) {
  const { record = true, save = true } = opts;
  const { color, frameColor, texture } = style || {};
  if (record) snapshot();
  const curDoor = sceneStyle.value.globalDoor || DEFAULT_SCENE_STYLE.globalDoor;
  sceneStyle.value = sanitizeSceneStyle({
    ...sceneStyle.value,
    globalDoor: {
      color: sanitizeColor(color) || curDoor.color,
      frameColor: sanitizeColor(frameColor) || curDoor.frameColor,
      texture: sanitizeTex(texture) || curDoor.texture,
    },
  });
  for (const op of openings.value) {
    clearObjectKeys(op, [...OPENING_STYLE_COLOR_KEYS, ...OPENING_STYLE_TEX_KEYS]);
  }
  if (save) scheduleSave();
  return sceneStyle.value.globalDoor;
}

function resetRoomStyle(roomId, opts = {}) {
  const { record = true, save = true } = opts;
  const room = rooms.value.find(r => r.id === roomId);
  if (!room) return null;
  if (record) snapshot();
  clearObjectKeys(room, [...ROOM_STYLE_COLOR_KEYS, ...ROOM_STYLE_TEX_KEYS]);
  if (save) scheduleSave();
  return room;
}

function resetFurnitureStyle(itemId, opts = {}) {
  const { record = true, save = true } = opts;
  const item = furniture.value.find(i => i.id === itemId);
  if (!item) return null;
  if (record) snapshot();
  clearObjectKeys(item, [...FURN_STYLE_COLOR_KEYS, ...FURN_STYLE_TEX_KEYS]);
  if (save) scheduleSave();
  return item;
}

function resetAllStylesToDefault(opts = {}) {
  const { record = true, save = true } = opts;
  if (record) snapshot();
  sceneStyle.value = sanitizeSceneStyle(null);
  for (const room of rooms.value) {
    clearObjectKeys(room, [...ROOM_STYLE_COLOR_KEYS, ...ROOM_STYLE_TEX_KEYS]);
  }
  for (const op of openings.value) {
    clearObjectKeys(op, [...OPENING_STYLE_COLOR_KEYS, ...OPENING_STYLE_TEX_KEYS]);
  }
  for (const item of furniture.value) {
    clearObjectKeys(item, [...FURN_STYLE_COLOR_KEYS, ...FURN_STYLE_TEX_KEYS]);
  }
  if (save) scheduleSave();
  return sceneStyle.value;
}

// Palette size updaters
function setRoomPaletteSize(presetId, across, deep) {
  if (!roomPaletteSizes[presetId]) return;
  const cur = roomPaletteSizes[presetId];
  roomPaletteSizes[presetId] = [
    across != null && Number.isFinite(Number(across)) ? clampRoomDim(across) : cur[0],
    deep != null && Number.isFinite(Number(deep)) ? clampRoomDim(deep) : cur[1],
  ];
  scheduleSave();
}

function setOpPaletteWidth(kind, width) {
  if (!OPK[kind]) return;
  const num = Number(width);
  if (!Number.isFinite(num)) return;
  opPaletteWidths[kind] = Math.min(OPK[kind].max, Math.max(OPK[kind].min, r2(num)));
  scheduleSave();
}

function setFurnPaletteSize(type, L, W) {
  if (!furnPaletteSizes[type]) return;
  const cur = furnPaletteSizes[type];
  furnPaletteSizes[type] = [
    L != null && Number.isFinite(Number(L)) ? clampFurnDim(L) : cur[0],
    W != null && Number.isFinite(Number(W)) ? clampFurnDim(W) : cur[1],
  ];
  scheduleSave();
}

// Templates & JSON Import / Export
function loadTemplate(templateId) {
  let factory = SAMPLE_PLANS[templateId]?.create;
  if (!factory) {
    if (templateId === 'blank') factory = createBlankPlan;
    else if (templateId === 'studio') factory = createStudioPlan;
    else if (templateId === 'apartment') factory = createApartmentPlan;
  }
  if (!factory) return false;

  const norm = normalizePlanObject(factory());
  if (!norm) return false;
  snapshot();
  applyNormalizedPlan(norm);
  scheduleSave();
  return true;
}

function exportPlanJson() {
  return JSON.stringify(
    {
      v: 1,
      title: planTitle.value,
      rooms: rooms.value,
      openEdges: openEdges.value,
      openings: openings.value,
      furniture: furniture.value,
      sceneStyle: sceneStyle.value,
    },
    null,
    2,
  );
}

function importPlanJson(jsonString) {
  try {
    const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    const norm = normalizePlanObject(parsed);
    if (!norm) {
      return { ok: false, error: 'Invalid floor plan JSON format.' };
    }
    snapshot();
    applyNormalizedPlan(norm);
    if (parsed.palettes) applyPalettes(parsed.palettes);
    scheduleSave();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Malformed JSON.' };
  }
}

export function usePlanStore() {
  return {
    planTitle,
    rooms,
    openEdges,
    openings,
    furniture,
    sceneStyle,
    roomPaletteSizes,
    opPaletteWidths,
    furnPaletteSizes,
    saveStatus,
    isEmpty,
    stats,
    canUndo,
    canRedo,

    roomArea,
    snapshot,
    undo,
    redo,
    scheduleSave,
    flushSave,

    setPlanTitle,
    addRoom,
    updateRoom,
    updateRoomRect,
    addRoomRect,
    removeRoomRect,
    swapRoomDims,
    duplicateRoom,
    removeRoom,
    clearRooms,

    addOpenEdge,
    removeOpenEdge,
    setOpenEdges,
    toggleOpenEdge,

    addOpening,
    updateOpening,
    removeOpening,
    setOpenings,
    clearOpenings,

    addFurniture,
    updateFurniture,
    rotateFurniture,
    flipFurniture,
    duplicateFurniture,
    removeFurniture,
    clearFurniture,

    updateSceneStyle,
    applyWallStyleToAllRooms,
    applyFloorStyleToAllRooms,
    applyDoorStyleToAllOpenings,
    resetRoomStyle,
    resetFurnitureStyle,
    resetAllStylesToDefault,

    setRoomPaletteSize,
    setOpPaletteWidth,
    setFurnPaletteSize,

    loadTemplate,
    exportPlanJson,
    importPlanJson,
  };
}
