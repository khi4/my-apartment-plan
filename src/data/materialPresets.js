/**
 * Procedural PBR material presets, architectural color swatches, default scene
 * & furniture styles, and style resolution helpers.
 */

export const RENDER_MODES = ['realistic', 'blueprint'];

export const LIGHTING_PRESETS = ['daylight', 'golden', 'evening', 'studio'];

export const FLOOR_TEXTURES = [
  { id: 'oak-parquet', labelKey: 'tex_oak_parquet', repeatMeters: [1.08, 2.5], roughness: 0.51, metalness: 0.0, bumpScale: 0.014, normalScale: 0.62, envIntensity: 0.82 },
  { id: 'walnut-wood', labelKey: 'tex_walnut_wood', repeatMeters: [1.05, 2.25], roughness: 0.48, metalness: 0.0, bumpScale: 0.015, normalScale: 0.64, envIntensity: 0.84 },
  { id: 'weathered-wood', labelKey: 'tex_weathered_wood', repeatMeters: [1.4, 1.4], roughness: 0.78, metalness: 0.0, bumpScale: 0.024, normalScale: 1.65, envIntensity: 0.38 },
  { id: 'ceramic-tile', labelKey: 'tex_ceramic_tile', repeatMeters: [1.0, 1.0], roughness: 0.26, metalness: 0.04, bumpScale: 0.012, normalScale: 1.30, envIntensity: 1.15 },
  { id: 'marble-tile', labelKey: 'tex_marble_tile', repeatMeters: [1.6, 1.6], roughness: 0.23, metalness: 0.0, bumpScale: 0.008, normalScale: 0.48, envIntensity: 1.14 },
  { id: 'slate-stone', labelKey: 'tex_slate_stone', repeatMeters: [1.2, 1.2], roughness: 0.84, metalness: 0.02, bumpScale: 0.028, normalScale: 1.80, envIntensity: 0.48 },
  { id: 'carpet-weave', labelKey: 'tex_carpet_weave', repeatMeters: [0.18, 0.18], roughness: 0.95, metalness: 0.0, bumpScale: 0.018, normalScale: 0.58, envIntensity: 0.35 },
  { id: 'polished-concrete', labelKey: 'tex_polished_concrete', repeatMeters: [2.0, 2.0], roughness: 0.45, metalness: 0.03, bumpScale: 0.01, normalScale: 0.55, envIntensity: 0.85 },
];

export const WALL_TEXTURES = [
  { id: 'plaster', labelKey: 'tex_plaster', repeatMeters: [2.0, 2.0], roughness: 0.86, metalness: 0.0, bumpScale: 0.009, normalScale: 0.38, envIntensity: 0.42 },
  { id: 'painted-brick', labelKey: 'tex_painted_brick', repeatMeters: [1.2, 0.8], roughness: 0.82, metalness: 0.0, bumpScale: 0.032, normalScale: 1.85, envIntensity: 0.38 },
  { id: 'wainscot-wood', labelKey: 'tex_wainscot_wood', repeatMeters: [1.0, 2.8], roughness: 0.58, metalness: 0.02, bumpScale: 0.018, normalScale: 1.45, envIntensity: 0.68 },
  { id: 'wall-tile', labelKey: 'tex_wall_tile', repeatMeters: [0.8, 0.8], roughness: 0.24, metalness: 0.04, bumpScale: 0.014, normalScale: 1.35, envIntensity: 1.12 },
  { id: 'wallpaper-linen', labelKey: 'tex_wallpaper_linen', repeatMeters: [0.35, 0.35], roughness: 0.91, metalness: 0.0, bumpScale: 0.012, normalScale: 0.45, envIntensity: 0.36 },
  { id: 'stucco-stone', labelKey: 'tex_stucco_stone', repeatMeters: [1.5, 1.5], roughness: 0.9, metalness: 0.0, bumpScale: 0.026, normalScale: 0.68, envIntensity: 0.38 },
];

export const DOOR_TEXTURES = [
  { id: 'painted-wood', labelKey: 'tex_painted_wood', repeatMeters: [0.9, 2.1], roughness: 0.46, metalness: 0.0, bumpScale: 0.012, normalScale: 0.42, envIntensity: 0.72 },
  { id: 'oak-wood', labelKey: 'tex_oak_wood', repeatMeters: [0.9, 2.1], roughness: 0.52, metalness: 0.0, bumpScale: 0.016, normalScale: 0.58, envIntensity: 0.74 },
  { id: 'walnut-wood', labelKey: 'tex_walnut_wood', repeatMeters: [0.9, 2.1], roughness: 0.45, metalness: 0.0, bumpScale: 0.016, normalScale: 0.54, envIntensity: 0.82 },
  { id: 'matte-metal', labelKey: 'tex_matte_metal', repeatMeters: [0.85, 0.85], roughness: 0.52, metalness: 0.82, bumpScale: 0.008, normalScale: 0.42, envIntensity: 1.05 },
];

export const FURNITURE_TEXTURES = [
  { id: 'fabric-linen', labelKey: 'tex_fabric_linen', repeatMeters: [0.24, 0.22], roughness: 0.94, metalness: 0.0, bumpScale: 0.014, normalScale: 0.52, envIntensity: 0.36, sheen: 0.35, sheenRoughness: 0.72 },
  { id: 'velvet', labelKey: 'tex_velvet', repeatMeters: [0.46, 0.48], roughness: 0.82, metalness: 0.0, bumpScale: 0.01, normalScale: 0.40, envIntensity: 0.52, sheen: 0.68, sheenRoughness: 0.43 },
  { id: 'leather', labelKey: 'tex_leather', repeatMeters: [0.27, 0.30], roughness: 0.52, metalness: 0.0, bumpScale: 0.016, normalScale: 0.53, envIntensity: 0.96 },
  { id: 'oak-wood', labelKey: 'tex_oak_wood', repeatMeters: [0.8, 1.4], roughness: 0.52, metalness: 0.0, bumpScale: 0.014, normalScale: 0.58, envIntensity: 0.74 },
  { id: 'walnut-wood', labelKey: 'tex_walnut_wood', repeatMeters: [0.95, 1.65], roughness: 0.45, metalness: 0.0, bumpScale: 0.015, normalScale: 0.54, envIntensity: 0.82 },
  { id: 'painted-wood', labelKey: 'tex_painted_wood', repeatMeters: [1.0, 1.0], roughness: 0.46, metalness: 0.0, bumpScale: 0.008, normalScale: 0.42, envIntensity: 0.74 },
  { id: 'marble', labelKey: 'tex_marble', repeatMeters: [1.2, 1.2], roughness: 0.23, metalness: 0.0, bumpScale: 0.007, normalScale: 0.27, envIntensity: 1.16 },
  { id: 'metal-brushed', labelKey: 'tex_metal_brushed', repeatMeters: [0.6, 0.36], roughness: 0.33, metalness: 0.90, bumpScale: 0.008, normalScale: 0.45, envIntensity: 1.18, anisotropy: 0.36 },
];

export const WALL_COLOR_SWATCHES = [
  '#f2ede2', // Warm plaster cream
  '#faf8f5', // Gallery white
  '#e6dfd3', // Limestone sand
  '#d9d2c5', // Putty taupe
  '#cfd8ce', // Soft sage
  '#b8c4bc', // Eucalyptus slate
  '#c9d1d9', // Nordic blue-grey
  '#d6b29a', // Terracotta clay
  '#5b646d', // Architectural slate
  '#2f353b', // Deep charcoal
];

export const FLOOR_COLOR_SWATCHES = [
  '#c89b68', // Natural honey oak
  '#d8be98', // Bleached birch
  '#a4774b', // Smoked amber oak
  '#734c30', // Rich walnut
  '#918170', // Weathered driftwood
  '#dcdad4', // Porcelain tile
  '#eceae4', // Carrara marble white
  '#b9aea0', // Travertine stone
  '#7d8084', // Slate charcoal
  '#a9a49b', // Polished concrete
];

export const DOOR_COLOR_SWATCHES = [
  '#e6dfd1', // Warm ivory wood
  '#d4ccb8', // Sandstone trim
  '#f5f3ee', // Satin white
  '#c29867', // Natural oak
  '#6e492e', // Deep walnut
  '#8b968a', // Sage lacquer
  '#4a5868', // Steel slate
  '#36393f', // Matte charcoal metal
  '#1e2024', // Black anodized iron
];

export const FURNITURE_COLOR_SWATCHES = [
  '#b98b56', // Warm oak
  '#69462b', // Deep walnut
  '#e6dec8', // Warm cream
  '#cfc7b8', // Oatmeal sand
  '#8c4a27', // Cognac leather
  '#2e3035', // Charcoal slate
  '#6f8274', // Muted sage
  '#1f3b2c', // Forest green
  '#233b63', // Midnight navy
  '#b56345', // Baked terracotta
];

export const GROUND_COLOR_SWATCHES = [
  '#dfd9cc', // Courtyard sand
  '#ece8df', // Studio paper
  '#c8c2b4', // Travertine gravel
  '#aeb7a2', // Garden turf
  '#8f9c82', // Olive lawn
  '#9ca1a6', // Concrete plaza
  '#5e646c', // Evening slate
  '#272b30', // Night charcoal
];

export const DEFAULT_SCENE_STYLE = {
  renderMode: 'realistic',
  lightingPreset: 'daylight',
  timeOfDay: 13.5,
  wallThickness: 0.08,
  northDeg: 0,
  outerGroundColor: '#dfd9cc',
  globalWall: { color: '#f2ede2', texture: 'plaster' },
  globalFloor: { color: '#c89b68', texture: 'oak-parquet' },
  globalKitchenBathFloor: { color: '#dcdad4', texture: 'ceramic-tile' },
  globalTerraceFloor: { color: '#b9aea0', texture: 'slate-stone' },
  globalDoor: { color: '#e6dfd1', frameColor: '#d4ccb8', texture: 'painted-wood' },
  floorUniform: false,
};

export const DEFAULT_FURNITURE_STYLES = {
  bed: { color: '#b98b56', accentColor: '#c5b295', texture: 'oak-wood' },
  sbed: { color: '#b98b56', accentColor: '#233b63', texture: 'oak-wood' },
  nightstand: { color: '#b98b56', accentColor: '#7a5838', texture: 'oak-wood' },
  wardrobe: { color: '#e6dec8', accentColor: '#8c6d4c', texture: 'painted-wood' },
  dresser: { color: '#8b623e', accentColor: '#5c3f26', texture: 'walnut-wood' },
  vanity: { color: '#e6dfd3', accentColor: '#b98b56', texture: 'painted-wood' },
  sofa: { color: '#9a9387', accentColor: '#c9c2b6', texture: 'fabric-linen' },
  lsofa: { color: '#2e3035', accentColor: '#3d4047', texture: 'leather' },
  armchair: { color: '#8c4a27', accentColor: '#a85f37', texture: 'leather' },
  coffee: { color: '#69462b', accentColor: '#dfd9ce', texture: 'walnut-wood' },
  tv: { color: '#5c412c', accentColor: '#22252a', texture: 'walnut-wood' },
  rug: { color: '#cfc7b8', accentColor: '#8e8371', texture: 'fabric-linen' },
  bookcase: { color: '#a87c4f', accentColor: '#69462b', texture: 'oak-wood' },
  dining: { color: '#69462b', accentColor: '#6f8274', texture: 'walnut-wood' },
  rtable: { color: '#ece9e2', accentColor: '#7c6552', texture: 'marble' },
  chair: { color: '#6f8274', accentColor: '#8e6b4a', texture: 'velvet' },
  sideboard: { color: '#785032', accentColor: '#c2a67d', texture: 'walnut-wood' },
  counter: { color: '#1f3b2c', accentColor: '#f2f0eb', texture: 'painted-wood' },
  fridge: { color: '#bfc5cb', accentColor: '#8d949c', texture: 'metal-brushed' },
  washer: { color: '#eceef0', accentColor: '#adb5bd', texture: 'metal-brushed' },
  shower: { color: '#e6e4de', accentColor: '#b7c7cf', texture: 'marble' },
  bathtub: { color: '#f4f2ec', accentColor: '#c5c9ce', texture: 'marble' },
  toilet: { color: '#f5f4f0', accentColor: '#d0d2d6', texture: 'marble' },
  basin: { color: '#f2f0ea', accentColor: '#b8bcc2', texture: 'marble' },
  desk: { color: '#b48754', accentColor: '#36393f', texture: 'oak-wood' },
  table: { color: '#b98b56', accentColor: '#7a5939', texture: 'oak-wood' },
  plant: { color: '#b56345', accentColor: '#3e6b48', texture: 'fabric-linen' },
};

const toIdMap = list => Object.fromEntries(list.map(entry => [entry.id, entry]));

export const TEXTURES_BY_CATEGORY = {
  floor: toIdMap(FLOOR_TEXTURES),
  wall: toIdMap(WALL_TEXTURES),
  door: toIdMap(DOOR_TEXTURES),
  furniture: toIdMap(FURNITURE_TEXTURES),
};

export const ALL_TEXTURES_BY_ID = Object.fromEntries(
  [...FLOOR_TEXTURES, ...WALL_TEXTURES, ...DOOR_TEXTURES, ...FURNITURE_TEXTURES].map(t => [t.id, t]),
);

const WET_ROOM_PATTERN = /kitchen|bath|wc|shower|مطبخ|حمام|دورة/i;
const VOID_DEFAULT_FLOOR = { color: '#d2cec6', texture: 'polished-concrete' };
const FALLBACK_FURNITURE_STYLE = { color: '#c8b89f', accentColor: '#8d7b68', texture: 'oak-wood' };

/**
 * Looks up a texture preset by id, checking category-specific repeat & roughness first.
 */
export function getTexturePreset(textureId, category) {
  const categoryPresets = Object.hasOwn(TEXTURES_BY_CATEGORY, category)
    ? TEXTURES_BY_CATEGORY[category]
    : null;
  if (categoryPresets && Object.hasOwn(categoryPresets, textureId)) {
    return categoryPresets[textureId];
  }
  return Object.hasOwn(ALL_TEXTURES_BY_ID, textureId) ? ALL_TEXTURES_BY_ID[textureId] : null;
}

/**
 * Resolves the effective floor color and texture id for a room.
 */
export function resolveRoomFloorStyle(room, sceneStyle) {
  const style = sceneStyle || DEFAULT_SCENE_STYLE;
  let base;

  if (room?.kind === 'void') {
    base = VOID_DEFAULT_FLOOR;
  } else if (room?.kind === 'terrace') {
    base = style.globalTerraceFloor || DEFAULT_SCENE_STYLE.globalTerraceFloor;
  } else if (
    !style.floorUniform &&
    room &&
    WET_ROOM_PATTERN.test(`${room.id || ''} ${room.en || ''} ${room.ar || ''}`)
  ) {
    base = style.globalKitchenBathFloor || DEFAULT_SCENE_STYLE.globalKitchenBathFloor;
  } else {
    base = style.globalFloor || DEFAULT_SCENE_STYLE.globalFloor;
  }

  return {
    color: room?.floorColor || base.color,
    texture: room?.floorTexture || base.texture,
  };
}

/**
 * Resolves the effective wall color and texture id for a room.
 */
export function resolveRoomWallStyle(room, sceneStyle) {
  const style = sceneStyle || DEFAULT_SCENE_STYLE;
  const base = style.globalWall || DEFAULT_SCENE_STYLE.globalWall;
  return {
    color: room?.wallColor || base.color,
    texture: room?.wallTexture || base.texture,
  };
}

/**
 * Resolves the effective door/opening panel color, frame color, and texture id.
 */
export function resolveDoorStyle(op, sceneStyle) {
  const style = sceneStyle || DEFAULT_SCENE_STYLE;
  const base = style.globalDoor || DEFAULT_SCENE_STYLE.globalDoor;
  return {
    color: op?.color || base.color,
    frameColor: op?.frameColor || base.frameColor,
    texture: op?.texture || base.texture,
  };
}

/**
 * Resolves the effective primary color, accent color, and texture id for a furniture item.
 */
export function resolveFurnitureStyle(item) {
  const type = typeof item === 'string' ? item : item?.type;
  const base = DEFAULT_FURNITURE_STYLES[type] || FALLBACK_FURNITURE_STYLE;
  return {
    color: (typeof item === 'object' && item?.color) || base.color,
    accentColor: (typeof item === 'object' && item?.accentColor) || base.accentColor,
    texture: (typeof item === 'object' && item?.texture) || base.texture,
  };
}
