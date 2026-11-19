/**
 * Seamless 512x512 procedural CanvasTexture PBR generator & material factory.
 * Synthesizes multi-channel sRGB diffuse maps, Sobel tangent-space normal maps,
 * and physical roughness maps with zero external texture dependencies.
 */

import { getTexturePreset } from '../data/materialPresets.js';

const TEX_SIZE = 512;
const TEX_ANISOTROPY = 8;
const SOBEL_STRENGTH = 3.8;

const TEXTURE_SEEDS = {
  'oak-parquet': 1013,
  'walnut-wood': 2027,
  'walnut-veneer': 19583,
  'weathered-wood': 3037,
  'ceramic-tile': 4049,
  'marble-tile': 5051,
  'slate-stone': 6067,
  'carpet-weave': 7079,
  'polished-concrete': 8081,
  plaster: 9091,
  'painted-brick': 10103,
  'wainscot-wood': 11113,
  'wall-tile': 12119,
  'wallpaper-linen': 13127,
  'stucco-stone': 14143,
  'painted-wood': 15149,
  'oak-wood': 16183,
  'matte-metal': 17189,
  'fabric-linen': 18191,
  velvet: 19207,
  leather: 20219,
  marble: 21227,
  'metal-brushed': 22247,
};

/**
 * Deterministic 32-bit seeded PRNG.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function modPos(n, m) {
  const remainder = n % m;
  return remainder < 0 ? remainder + m : remainder;
}

function mod1(x) {
  const f = x - Math.floor(x);
  return f < 0 ? f + 1 : f;
}

function clampByte(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function clamp01(v) {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function smoothRange(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2(ix, iy, seed = 1337) {
  let h =
    Math.imul(ix | 0, 374761393) +
    Math.imul(iy | 0, 668265263) +
    Math.imul(seed | 0, 1442695041);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Tileable periodic 2D value noise on [0, 1) x [0, 1).
 */
function periodicNoise2D(u, v, px, py, seed = 1) {
  const x = u * px;
  const y = v * py;
  const ix0 = Math.floor(x);
  const iy0 = Math.floor(y);
  const fx = smoothstep(x - ix0);
  const fy = smoothstep(y - iy0);

  const x0 = modPos(ix0, px);
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y0 = modPos(iy0, py);
  const y1 = y0 + 1 === py ? 0 : y0 + 1;

  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x1, y0, seed);
  const v01 = hash2(x0, y1, seed);
  const v11 = hash2(x1, y1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

/**
 * Tileable periodic multi-octave fractional Brownian motion.
 */
function fbmPeriodic(u, v, basePx, basePy, octaves = 4, seed = 1) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = basePx;
  let py = basePy;
  for (let i = 0; i < octaves; i++) {
    sum += amp * periodicNoise2D(u, v, px, py, seed + i * 97);
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

/**
 * Tileable toroidal Voronoi distance field on [0, 1) x [0, 1).
 */
function voronoiPeriodic(u, v, cellsX, cellsY, jitter = 0.85, seed = 1) {
  const x = u * cellsX;
  const y = v * cellsY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  let d1 = 1e9;
  let d2 = 1e9;
  let cellId = 0;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const wx = modPos(cx, cellsX);
      const wy = modPos(cy, cellsY);
      const rx = 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const ry = 0.5 + (hash2(wx, wy, seed + 53) - 0.5) * jitter;
      const dx = cx + rx - x;
      const dy = cy + ry - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < d1) {
        d2 = d1;
        d1 = distSq;
        cellId = hash2(wx, wy, seed + 131);
      } else if (distSq < d2) {
        d2 = distSq;
      }
    }
  }

  d1 = Math.sqrt(d1);
  d2 = Math.sqrt(d2);
  return { d1, d2, edge: d2 - d1, cellId };
}

/**
 * Applies a subtle white-balanced warm (+delta) or cool (-delta) shift
 * while keeping average channel luminance closely anchored to `lum`.
 */
function tintWarmCool(lum, delta) {
  return [
    lum + delta * 0.65,
    lum + delta * 0.15,
    lum - delta * 0.8,
  ];
}

/**
 * Rich architectural wood grain with cathedral arches, fine fibers, and elongated open vessel pores.
 * `across` runs perpendicular to grain, `along` runs parallel to grain (both in [0, 1)).
 */
function sampleWoodGrain(across, along, seed, ringScale = 4.5, warpAmp = 1.5, fiberScale = 36, poreX = 48, poreY = 16) {
  const warp1 = fbmPeriodic(across, along, 2, 3, 3, seed);
  const warp2 = fbmPeriodic(mod1(across + 0.31), mod1(along + 0.57), 4, 6, 2, seed + 19);
  const warp = warp1 * 0.72 + warp2 * 0.28;

  const fine = smoothRange(0.24, 0.76, fbmPeriodic(across, along, fiberScale, 5, 2, seed + 29));
  const poreField = periodicNoise2D(across, along, poreX, poreY, seed + 71);
  let pores = 0;
  if (poreField > 0.835) {
    const poreSub = periodicNoise2D(across, along, Math.min(256, poreX * 2), Math.min(256, poreY * 2), seed + 113);
    pores = ((poreField - 0.835) / 0.165) * (0.45 + 0.55 * poreSub);
  }

  const ringPhase = across * ringScale + (warp - 0.5) * warpAmp * 2.0 + Math.sin(along * Math.PI * 2) * 0.32;
  const wave = 0.5 + 0.5 * Math.sin(ringPhase * Math.PI * 2);
  const rings = Math.pow(wave, 1.5);
  return { rings, fine, pores, warp };
}

function sampleOakParquet(u, v, seed) {
  // The 1.08 × 2.50 m repeat holds 180 mm wide, 1.25 m long boards.
  const cols = 6;
  const rows = 2;
  const col = modPos(Math.floor(u * cols), cols);
  const lu = mod1(u * cols);

  const colShift = col / 3 + (hash2(col, 9, seed + 11) - 0.5) * 0.16;
  const vShifted = v * rows + colShift;
  const row = modPos(Math.floor(vShifted), rows);
  const lv = mod1(vShifted);

  const edgeAcross = Math.min(lu, 1 - lu) * 180;
  const edgeAlong = Math.min(lv, 1 - lv) * 1250;
  const seam = Math.max(
    1 - smoothRange(0.4, 2.0, edgeAcross),
    1 - smoothRange(0.4, 3.8, edgeAlong),
  );
  const bevel = Math.min(
    smoothRange(0.8, 3.8, edgeAcross),
    smoothRange(0.8, 5.4, edgeAlong),
  );

  const plankRand = hash2(col, row, seed + 17);
  const plankWarmth = hash2(col, row, seed + 53) - 0.5;
  const phaseU = hash2(col, row, seed + 41);
  const phaseV = hash2(col, row, seed + 67);
  const plankSeed = seed + (col + row * cols) * 31;
  const knotX = 0.2 + hash2(col, row, seed + 89) * 0.6;
  const knotY = 0.12 + hash2(col, row, seed + 113) * 0.76;
  const dx = (lu - knotX) * 6;
  const dy = (lv - knotY) * 18;
  const knotDistSq = dx * dx + dy * dy;
  const knot = plankRand > 0.48 ? Math.exp(-knotDistSq * 3) : 0;
  const grainDeflection = knot * dx * 0.16;

  const grain = sampleWoodGrain(
    mod1(lu + phaseU + grainDeflection),
    mod1(lv + phaseV),
    plankSeed,
    6,
    1.25,
    20,
    34,
    21,
  );

  const latewood = grain.rings * grain.rings;
  const tone =
    247 - plankRand * 25 -
    latewood * 14 -
    (1 - grain.fine) * 8 -
    grain.pores * 18 -
    knot * 34 -
    (1 - bevel) * 12;
  const warmth = plankWarmth * 15 + (0.5 - latewood) * 6 - grain.pores * 4;
  const [fr, fg, fb] = tintWarmCool(tone, warmth);

  const r = lerp(fr, 153, seam);
  const g = lerp(fg, 143, seam);
  const b = lerp(fb, 130, seam);
  const faceHeight = 146 + bevel * 27 - latewood * 6 - (1 - grain.fine) * 4 - grain.pores * 17 - knot * 10;
  const height = lerp(faceHeight, 107, seam);
  const faceRough = 117 + plankRand * 20 + latewood * 12 + grain.pores * 22 + knot * 9;
  const rough = lerp(faceRough, 183, seam);
  return [r, g, b, height, rough];
}

function sampleWalnutWood(u, v, seed) {
  const cols = 5;
  const rows = 2;
  const col = modPos(Math.floor(u * cols), cols);
  const lu = mod1(u * cols);

  const colShift = ((col & 1) * 0.5) + (hash2(col, 3, seed + 17) - 0.5) * 0.28;
  const vShifted = v * rows + colShift;
  const row = modPos(Math.floor(vShifted), rows);
  const lv = mod1(vShifted);

  const edgeU = Math.min(lu, 1 - lu) * (TEX_SIZE / cols);
  const edgeV = Math.min(lv, 1 - lv) * (TEX_SIZE / rows);
  const edgePx = Math.min(edgeU, edgeV);

  const seam = 1 - smoothRange(0.9, 1.6, edgePx);
  const bevel = smoothRange(1.5, 4.1, edgePx);

  const plankTone = hash2(col, row, seed + 31);
  const plankTint = hash2(col, row, seed + 83) - 0.5;
  const plankSeed = seed + (col + row * cols) * 23;
  const phaseU = hash2(col, row, seed + 47);
  const phaseV = hash2(col, row, seed + 71);

  const knotCx = 0.28 + hash2(col, row, seed + 97) * 0.44;
  const knotCy = 0.24 + hash2(col, row, seed + 109) * 0.52;
  const dxk = (lu - knotCx) * 1.4;
  const dyk = (lv - knotCy) * 2.8;
  const knotDist = Math.hypot(dxk, dyk);
  const hasKnot = plankTone > 0.42;
  const knot = hasKnot ? Math.exp(-knotDist * knotDist * 26) * 0.65 : 0;
  const knotSwirl = hasKnot ? Math.sin(knotDist * 28) * Math.exp(-knotDist * knotDist * 14) * 0.14 : 0;

  const grain = sampleWoodGrain(
    mod1(lu + phaseU + knotSwirl),
    mod1(lv + phaseV),
    plankSeed,
    4.0,
    1.8,
    36,
    48,
    16,
  );

  const tone =
    250 -
    plankTone * 27 -
    grain.rings * 17 -
    (1 - grain.fine) * 9 -
    grain.pores * 16 -
    knot * 28 -
    (1 - bevel) * 13;
  const warmth = plankTint * 16 + (0.5 - grain.rings) * 6 - knot * 7 - grain.pores * 5;
  const [fr, fg, fb] = tintWarmCool(tone, warmth);

  const r = lerp(fr, 153, seam);
  const g = lerp(fg, 147, seam);
  const b = lerp(fb, 140, seam);

  const faceHeight = 154 + bevel * 26 - grain.rings * 8 - (1 - grain.fine) * 5 - grain.pores * 20 - knot * 12;
  const height = lerp(faceHeight, 104, seam);

  const faceRough = 104 + plankTone * 18 + grain.rings * 12 + (1 - grain.fine) * 7 + grain.pores * 22 + knot * 10;
  const rough = lerp(faceRough, 173, seam);

  return [r, g, b, height, rough];
}

function sampleWalnutVeneer(u, v, seed) {
  const figure = periodicNoise2D(u, v, 4, 2, seed + 31);
  const grain = sampleWoodGrain(u + (figure - 0.5) * 0.07, v, seed, 8, 1.8, 72, 124, 20);
  const colorBand = periodicNoise2D(u, v, 9, 3, seed + 73);
  const latewood = grain.rings * grain.rings;
  const tone = 234 + figure * 12 + colorBand * 8 - latewood * 18 - grain.pores * 13 - (1 - grain.fine) * 7;
  const [r, g, b] = tintWarmCool(tone, 4 + (figure - 0.5) * 10 - latewood * 5);
  const height = 128 + figure * 7 - latewood * 5 - (1 - grain.fine) * 3 - grain.pores * 10;
  const rough = 105 + (1 - figure) * 11 + latewood * 13 + grain.pores * 9;
  return [r, g, b, height, rough];
}

function sampleWeatheredWood(u, v, seed) {
  const rows = 4;
  const ry = modPos(Math.floor(v * rows), rows);
  const lv = mod1(v * rows);
  const rowShift = (ry & 1) * 0.48 + (hash2(ry, 1, seed + 23) - 0.5) * 0.24;
  const pu = mod1(u + rowShift);
  const col = modPos(Math.floor(pu * 2), 2);
  const lu = mod1(pu * 2);

  const edgeU = Math.min(lu, 1 - lu) * (TEX_SIZE / 2);
  const edgeV = Math.min(lv, 1 - lv) * (TEX_SIZE / rows);
  const edgePx = Math.min(edgeU, edgeV);
  const seam = 1 - smoothRange(0.95, 2.0, edgePx);
  const bevel = smoothRange(1.8, 4.8, edgePx);

  const plankTone = hash2(ry, col, seed + 59);
  const plankWarm = hash2(ry, col, seed + 107) - 0.5;
  const plankSeed = seed + (ry * 2 + col) * 43;
  const grain = sampleWoodGrain(lv, lu, plankSeed, 4.5, 2.1, 44, 52, 16);

  const splitNoise = periodicNoise2D(lu, lv, 12, 48, plankSeed + 91);
  const split = smoothRange(0.81, 0.93, splitNoise);

  const tone =
    250 -
    plankTone * 42 -
    grain.rings * 20 -
    (1 - grain.fine) * 12 -
    grain.pores * 18 -
    split * 44 -
    (1 - bevel) * 14;
  const silverMix = (1 - grain.rings) * 0.65;
  const warmth = plankWarm * 24 - silverMix * 12 + split * -6;
  const [fr, fg, fb] = tintWarmCool(tone, warmth);

  const r = lerp(fr, 78, seam);
  const g = lerp(fg, 76, seam);
  const b = lerp(fb, 74, seam);

  const faceHeight = 148 + bevel * 96 - grain.rings * 66 - (1 - grain.fine) * 34 - split * 125;
  const height = lerp(clamp01(faceHeight / 255) * 255, 12, seam);

  const faceRough = 154 + plankTone * 38 + grain.rings * 28 + (1 - grain.fine) * 18 + split * 44;
  const rough = lerp(Math.min(242, faceRough), 243, seam);

  return [r, g, b, height, rough];
}

function sampleOakWood(u, v, seed) {
  const cols = 4;
  const col = modPos(Math.floor(u * cols), cols);
  const lu = mod1(u * cols);
  const edgePx = Math.min(lu, 1 - lu) * (TEX_SIZE / cols);
  const seam = 1 - smoothRange(0.65, 1.35, edgePx);
  const bevel = smoothRange(1.2, 3.2, edgePx);

  const boardTone = hash2(col, 2, seed + 13);
  const boardWarm = hash2(col, 5, seed + 41) - 0.5;
  const phaseU = hash2(col, 7, seed + 61);
  const phaseV = hash2(col, 11, seed + 79);

  const knotCx = 0.26 + hash2(col, 13, seed + 101) * 0.48;
  const knotCy = 0.18 + hash2(col, 17, seed + 113) * 0.64;
  const knotDist = Math.hypot((lu - knotCx) * 1.4, (v - knotCy) * 3.8);
  const hasKnot = boardTone > 0.52;
  const knot = hasKnot ? Math.exp(-knotDist * knotDist * 28) * 0.52 : 0;
  const knotSwirl = hasKnot ? Math.sin(knotDist * 24) * Math.exp(-knotDist * knotDist * 14) * 0.12 : 0;

  const grain = sampleWoodGrain(
    mod1(lu + phaseU + knotSwirl),
    mod1(v + phaseV),
    seed + col * 29,
    4,
    1.6,
    40,
    56,
    24,
  );
  const ray = smoothRange(0.74, 0.91, periodicNoise2D(lu, v, 24, 10, seed + 109));

  const tone =
    249 -
    boardTone * 17 -
    grain.rings * 18 -
    (1 - grain.fine) * 8 -
    grain.pores * 18 +
    ray * 6 -
    knot * 25 -
    (1 - bevel) * 6;
  const warmth = boardWarm * 20 + ray * 9 + (1 - grain.rings) * 5 - grain.pores * 6 - knot * 10;
  const [fr, fg, fb] = tintWarmCool(tone, warmth);

  const r = lerp(fr, 187, seam);
  const g = lerp(fg, 181, seam);
  const b = lerp(fb, 174, seam);

  const faceHeight = 148 + bevel * 17 - grain.rings * 7 - (1 - grain.fine) * 4 - grain.pores * 18 - knot * 10;
  const height = lerp(faceHeight, 131, seam);

  const faceRough = 114 + boardTone * 20 + grain.rings * 12 + (1 - grain.fine) * 6 + grain.pores * 24 + knot * 10;
  const rough = lerp(faceRough, 168, seam);

  return [r, g, b, height, rough];
}

function sampleWainscotWood(u, v, seed) {
  const slats = 8;
  const sx = modPos(Math.floor(u * slats), slats);
  const lu = mod1(u * slats);
  const edgePx = Math.min(lu, 1 - lu) * (TEX_SIZE / slats);

  const groove = 1 - smoothRange(1.1, 2.5, edgePx);
  const chamfer = smoothRange(2.2, 5.8, edgePx);
  const shoulder = Math.exp(-Math.pow((edgePx - 4.8) / 1.1, 2));

  const slatTone = hash2(sx, 0, seed + 17);
  const slatWarm = hash2(sx, 3, seed + 43) - 0.5;
  const grain = sampleWoodGrain(mod1(lu + slatTone * 0.45), v, seed + sx * 19, 3, 1.15, 32, 40, 24);
  const brush = periodicNoise2D(u, v, 128, 6, seed + 97);

  const tone =
    247 -
    slatTone * 24 -
    grain.rings * 14 -
    (1 - grain.fine) * 8 -
    (1 - brush) * 7 -
    (1 - chamfer) * 24 +
    shoulder * 5;
  const [fr, fg, fb] = tintWarmCool(tone, slatWarm * 12 + (1 - grain.rings) * 4);

  const r = lerp(fr, 96, groove);
  const g = lerp(fg, 94, groove);
  const b = lerp(fb, 92, groove);

  const faceHeight = 164 + chamfer * 76 + shoulder * 10 - grain.rings * 34 - (1 - grain.fine) * 18 - grain.pores * 44;
  const height = lerp(clamp01(faceHeight / 255) * 255, 15, groove);

  const faceRough = 82 + slatTone * 18 + grain.rings * 20 + (1 - brush) * 16 + grain.pores * 38;
  const rough = lerp(Math.min(148, faceRough), 235, groove);

  return [r, g, b, height, rough];
}

function samplePaintedWood(u, v, seed) {
  const brush = periodicNoise2D(u, v, 88, 5, seed + 37);
  const microBrush = periodicNoise2D(u, v, 165, 12, seed + 79);
  const coat = fbmPeriodic(u, v, 4, 6, 3, seed + 113);

  const tone = 244 + brush * 5 + coat * 5;
  const [r, g, b] = tintWarmCool(tone, (coat - 0.5) * 4);
  const height = 128 + brush * 6 + microBrush * 3 + coat * 9;
  const rough = 102 + brush * 13 + coat * 17;

  return [r, g, b, height, rough];
}

function sampleCeramicTile(u, v, seed) {
  const cols = 4;
  const tx = modPos(Math.floor(u * cols), cols);
  const ty = modPos(Math.floor(v * cols), cols);
  const gx = mod1(u * cols);
  const gy = mod1(v * cols);
  const edgePx = Math.min(Math.min(gx, 1 - gx), Math.min(gy, 1 - gy)) * (TEX_SIZE / cols);

  const grout = 1 - smoothRange(1.4, 2.1, edgePx);
  const bevel = smoothRange(1.9, 4.6, edgePx);
  const bevelLip = Math.exp(-Math.pow((edgePx - 3.9) / 0.9, 2));

  const tileRand = hash2(tx, ty, seed);
  const tileTemp = hash2(tx, ty, seed + 31) - 0.5;
  const glaze = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 6, 6, 3, seed + 47));
  const speck = periodicNoise2D(u, v, 192, 192, seed + 89);
  const mineralSpeck = speck > 0.87 ? (speck - 0.87) * 120 : 0;

  const face =
    248 -
    tileRand * 22 -
    (1 - glaze) * 14 -
    mineralSpeck -
    (1 - bevel) * 16 +
    bevelLip * 6;
  const warmth = tileTemp * 14 + (glaze - 0.5) * 7 - mineralSpeck * 0.25;
  const [fr, fg, fb] = tintWarmCool(face, warmth);

  const mortarSand = periodicNoise2D(u, v, 160, 160, seed + 131);
  const groutLum = 102 + mortarSand * 18;
  const r = lerp(fr, groutLum + 3, grout);
  const g = lerp(fg, groutLum + 1, grout);
  const b = lerp(fb, groutLum - 3, grout);

  const faceHeight = 165 + bevel * 78 + bevelLip * 8 - (1 - glaze) * 16 - mineralSpeck * 0.8;
  const height = lerp(clamp01(faceHeight / 255) * 255, 14 + mortarSand * 8, grout);

  const faceRough = 28 + (1 - glaze) * 20 + tileRand * 10 + (1 - bevel) * 16 + (mineralSpeck > 0 ? 12 : 0);
  const rough = lerp(Math.min(72, faceRough), 241 + mortarSand * 7, grout);

  return [r, g, b, height, rough];
}

function sampleWallTile(u, v, seed) {
  const rows = 8;
  const cols = 4;
  const ry = modPos(Math.floor(v * rows), rows);
  const gy = mod1(v * rows);
  const shift = (ry & 1) === 1 ? 0.5 : 0;
  const shiftedCol = u * cols + shift;
  const tx = modPos(Math.floor(shiftedCol), cols);
  const gx = mod1(shiftedCol);

  const edgePx = Math.min(Math.min(gx, 1 - gx) * (TEX_SIZE / cols), Math.min(gy, 1 - gy) * (TEX_SIZE / rows));
  const grout = 1 - smoothRange(1.2, 1.9, edgePx);
  const pillow = smoothRange(1.7, 5.2, edgePx);
  const lip = Math.exp(-Math.pow((edgePx - 4.0) / 1.0, 2));

  const tileRand = hash2(tx, ry, seed);
  const tileTemp = hash2(tx, ry, seed + 29) - 0.5;
  const glaze = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 8, 16, 3, seed + 61));
  const speck = periodicNoise2D(u, v, 192, 192, seed + 101);
  const mineral = speck > 0.89 ? (speck - 0.89) * 100 : 0;

  const face =
    249 -
    tileRand * 20 -
    (1 - glaze) * 13 -
    mineral -
    (1 - pillow) * 16 +
    lip * 6;
  const [fr, fg, fb] = tintWarmCool(face, tileTemp * 12 + (glaze - 0.5) * 6);

  const mortarSand = periodicNoise2D(u, v, 160, 160, seed + 137);
  const groutLum = 104 + mortarSand * 16;
  const r = lerp(fr, groutLum + 3, grout);
  const g = lerp(fg, groutLum + 1, grout);
  const b = lerp(fb, groutLum - 3, grout);

  const faceHeight = 144 + pillow * 98 + lip * 8 - (1 - glaze) * 14;
  const height = lerp(clamp01(faceHeight / 255) * 255, 15 + mortarSand * 8, grout);

  const faceRough = 29 + (1 - glaze) * 20 + tileRand * 10 + (1 - pillow) * 14;
  const rough = lerp(Math.min(68, faceRough), 241 + mortarSand * 7, grout);

  return [r, g, b, height, rough];
}

function samplePaintedBrick(u, v, seed) {
  const rows = 8;
  const cols = 4;
  const ry = modPos(Math.floor(v * rows), rows);
  const gy = mod1(v * rows);
  const shift = (ry & 1) === 1 ? 0.5 : 0;
  const shiftedCol = u * cols + shift;
  const tx = modPos(Math.floor(shiftedCol), cols);
  const gx = mod1(shiftedCol);

  const edgeJitter = (fbmPeriodic(u, v, 16, 16, 3, seed + 19) - 0.5) * 4.2;
  const edgePx = Math.min(Math.min(gx, 1 - gx) * (TEX_SIZE / cols), Math.min(gy, 1 - gy) * (TEX_SIZE / rows)) + edgeJitter;
  const mortar = 1 - smoothRange(2.4, 4.6, edgePx);
  const brickEdge = smoothRange(4.0, 7.6, edgePx);

  const brickRand = hash2(tx, ry, seed + 37);
  const brickTemp = hash2(tx, ry, seed + 61) - 0.5;
  const coarse = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 12, 16, 3, seed + 73));
  const pit = periodicNoise2D(u, v, 112, 112, seed + 113);
  const pits = pit > 0.76 ? Math.pow((pit - 0.76) / 0.24, 1.2) : 0;

  const face =
    248 -
    brickRand * 24 -
    (1 - coarse) * 18 -
    pits * 28 -
    (1 - brickEdge) * 14;
  const [fr, fg, fb] = tintWarmCool(face, brickTemp * 14 + (coarse - 0.5) * 8);

  const mortarSand = periodicNoise2D(u, v, 160, 160, seed + 149);
  const mortarBase = 140 + mortarSand * 22 - (1 - coarse) * 8;
  const r = lerp(fr, mortarBase + 4, mortar);
  const g = lerp(fg, mortarBase + 1, mortar);
  const b = lerp(fb, mortarBase - 5, mortar);

  const faceHeight = 166 + brickEdge * 76 - (1 - coarse) * 62 - pits * 110;
  const height = lerp(clamp01(faceHeight / 255) * 255, 14 + mortarSand * 10, mortar);

  const faceRough = 154 + (1 - coarse) * 46 + pits * 36 + (1 - brickEdge) * 24;
  const rough = lerp(Math.min(235, faceRough), 244, mortar);

  return [r, g, b, height, rough];
}

function sampleMarbleSurface(u, v, seed, tileGrouts = false) {
  let tx = 0;
  let ty = 0;
  let seam = 0;
  let bevel = 1;

  if (tileGrouts) {
    tx = modPos(Math.floor(u * 2), 2);
    ty = modPos(Math.floor(v * 2), 2);
    const gx = mod1(u * 2);
    const gy = mod1(v * 2);
    const edgePx = Math.min(Math.min(gx, 1 - gx), Math.min(gy, 1 - gy)) * (TEX_SIZE / 2);
    seam = 1 - smoothRange(1.2, 1.9, edgePx);
    bevel = smoothRange(1.8, 4.3, edgePx);
  }

  const slabShiftU = tileGrouts ? hash2(tx, ty, seed + 13) * 0.45 : 0;
  const slabShiftV = tileGrouts ? hash2(tx, ty, seed + 29) * 0.45 : 0;
  const slabTone = tileGrouts ? hash2(tx, ty, seed + 59) * 8 : 0;
  const su = mod1(u + slabShiftU);
  const sv = mod1(v + slabShiftV);

  const warp1 = fbmPeriodic(su, sv, 3, 3, 3, seed);
  const warp2 = fbmPeriodic(su + 0.41, sv + 0.67, 6, 6, 3, seed + 43);
  const fineWarp = fbmPeriodic(su, sv, 12, 12, 3, seed + 79);

  const coord1 = su + sv + (warp1 - 0.5) * 0.96 + (warp2 - 0.5) * 0.28 + (fineWarp - 0.5) * 0.11;
  const coord2 = su * 2 + sv + (warp1 - 0.5) * 0.65 + (warp2 - 0.5) * 0.74;

  const d1 = Math.abs(Math.sin(coord1 * Math.PI * 2));
  const d2 = Math.abs(Math.sin(coord2 * Math.PI * 2));

  const primaryVein = Math.pow(Math.max(0, 1 - d1 * 1.8), 2.3);
  const branchVein = Math.pow(Math.max(0, 1 - d2 * 3.3), 2.2) * (0.24 + 0.76 * (1 - d1));
  const veinIntensity = clamp01(primaryVein + branchVein * 0.65);

  const cloud = smoothRange(0.24, 0.76, fbmPeriodic(su, sv, 2, 2, 3, seed + 89));
  const mineralWash = smoothRange(0.24, 0.76, fbmPeriodic(su, sv, 5, 5, 3, seed + 137));

  const baseIvory =
    251 -
    slabTone -
    (1 - cloud) * 10 -
    (1 - mineralWash) * 8 -
    (1 - bevel) * 9;
  const veinDark = primaryVein * (32 + mineralWash * 27) + branchVein * 19;
  const veinWarmth = primaryVein * 5 - branchVein * 5 + (cloud - 0.5) * 5;
  const [fr, fg, fb] = tintWarmCool(baseIvory - veinDark, veinWarmth);

  const mortarSand = tileGrouts ? periodicNoise2D(u, v, 160, 160, seed + 151) : 0;
  const groutLum = 142 + mortarSand * 14;
  const r = lerp(fr, groutLum + 2, seam);
  const g = lerp(fg, groutLum + 1, seam);
  const b = lerp(fb, groutLum - 2, seam);

  const crystal = periodicNoise2D(su, sv, 128, 128, seed + 173);
  // Mineral colors lie beneath an even, honed surface. Only tile joints need relief.
  const faceHeight = 132 + bevel * 19 + cloud * 3 + crystal * 0.8;
  const height = lerp(faceHeight, 103 + mortarSand * 4, seam);

  const faceRough = 48 + (1 - cloud) * 12 + (1 - mineralWash) * 5 + veinIntensity * 7;
  const rough = lerp(faceRough, 193, seam);

  return [r, g, b, height, rough];
}

function sampleSlateStone(u, v, seed) {
  const vor = voronoiPeriodic(u, v, 3, 3, 0.72, seed);
  const edgePerturb = (fbmPeriodic(u, v, 12, 12, 3, seed + 31) - 0.5) * 0.03;
  const edgeDist = vor.edge + edgePerturb;
  const crevice = 1 - smoothRange(0.013, 0.032, edgeDist);
  const edgeSlope = smoothRange(0.024, 0.065, edgeDist);

  const cleftBase = smoothRange(0.22, 0.78, fbmPeriodic(u, v, 3, 8, 4, seed + 61));
  const stepLayer = cleftBase * 4.0;
  const layerFrac = stepLayer - Math.floor(stepLayer);
  const terrace = (Math.floor(stepLayer) + smoothstep(smoothstep(layerFrac))) / 4.0;
  const cleftDetail = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 14, 14, 3, seed + 89));
  const cleft = terrace * 0.65 + cleftDetail * 0.35;
  const grit = periodicNoise2D(u, v, 128, 128, seed + 101);

  const slabTint = hash2(Math.floor(vor.cellId * 100), 7, seed + 19) - 0.5;
  const stoneTone =
    246 -
    vor.cellId * 44 -
    (1 - cleft) * 32 -
    (1 - grit) * 10 -
    (1 - edgeSlope) * 12;
  const oxid = slabTint * 26 + (cleft - 0.5) * 10;
  const [fr, fg, fb] = tintWarmCool(stoneTone, oxid);

  const mortarSand = periodicNoise2D(u, v, 160, 160, seed + 137);
  const creviceLum = 72 + mortarSand * 18;
  const r = lerp(fr, creviceLum + 2, crevice);
  const g = lerp(fg, creviceLum, crevice);
  const b = lerp(fb, creviceLum - 3, crevice);

  const faceHeight = 64 + edgeSlope * 44 + cleft * 142 - (1 - grit) * 24;
  const height = lerp(clamp01(faceHeight / 255) * 255, 13, crevice);

  const faceRough = 122 + (1 - cleft) * 86 + vor.cellId * 22 + (1 - grit) * 12;
  const rough = lerp(Math.min(232, faceRough), 245, crevice);

  return [r, g, b, height, rough];
}

function sampleStuccoStone(u, v, seed) {
  const macro = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 3, 3, 4, seed));
  const medium = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 10, 10, 3, seed + 41));
  const silica = periodicNoise2D(u, v, 36, 36, seed + 97);
  const grain = periodicNoise2D(u, v, 72, 72, seed + 137);

  const tone = 234 + macro * 10 + medium * 7 + silica * 3;
  const [r, g, b] = tintWarmCool(tone, (macro - 0.5) * 5 + (medium - 0.5) * 3);

  const height = 124 + macro * 28 + medium * 17 + silica * 7 + grain * 4;
  const rough = 217 + (1 - macro) * 14 + (1 - medium) * 9 + (1 - silica) * 6;

  return [r, g, b, height, rough];
}

function samplePolishedConcrete(u, v, seed) {
  const warp = fbmPeriodic(u, v, 2, 2, 3, seed);
  const cloud = smoothRange(0.22, 0.78, fbmPeriodic(mod1(u + warp * 0.14), mod1(v + warp * 0.14), 3, 3, 4, seed + 23));
  const swirl = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 7, 7, 3, seed + 53));
  const agg = periodicNoise2D(u, v, 160, 160, seed + 89);
  const microAgg = periodicNoise2D(u, v, 256, 256, seed + 131);

  const darkSpeck = agg > 0.87 ? (agg - 0.87) * 160 : 0;
  const lightSpeck = agg < 0.11 ? (0.11 - agg) * 110 : 0;
  const pinhole = microAgg > 0.94 ? (microAgg - 0.94) * 320 : 0;

  const jointPx = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v)) * TEX_SIZE;
  const joint = 1 - smoothRange(0.7, 1.4, jointPx);

  const baseTone =
    244 -
    (1 - cloud) * 38 -
    (1 - swirl) * 16 -
    darkSpeck +
    lightSpeck -
    pinhole * 0.8;
  const [fr, fg, fb] = tintWarmCool(baseTone, (swirl - 0.5) * 9 - (cloud - 0.5) * 6);

  const r = lerp(fr, 148, joint);
  const g = lerp(fg, 146, joint);
  const b = lerp(fb, 142, joint);

  const faceHeight = 236 - (1 - cloud) * 86 - (1 - swirl) * 42 - pinhole * 1.2;
  const height = lerp(clamp01(faceHeight / 255) * 255, 44, joint);

  const faceRough = 66 + (1 - cloud) * 76 + (1 - swirl) * 24 + (pinhole > 0 ? 35 : 0);
  const rough = lerp(Math.min(174, faceRough), 224, joint);

  return [r, g, b, height, rough];
}

function samplePlaster(u, v, seed) {
  const warp = fbmPeriodic(u, v, 2, 2, 3, seed);
  const arc1 = fbmPeriodic(u + warp * 0.27, v - warp * 0.16, 3, 6, 3, seed + 31);
  const arc2 = fbmPeriodic(u - warp * 0.13, v + warp * 0.12, 7, 3, 3, seed + 67);
  const trowel = smoothRange(0.24, 0.78, arc1 * 0.65 + arc2 * 0.35);
  const sweep = periodicNoise2D(u + warp * 0.13, v, 13, 17, seed + 97);
  const coat = periodicNoise2D(u, v, 36, 36, seed + 149);

  const burnish = smoothRange(0.53, 0.92, trowel);
  const tone = 241 + trowel * 9 + sweep * 3 + burnish * 2;
  const [r, g, b] = tintWarmCool(tone, (trowel - 0.5) * 5);
  const height = 118 + trowel * 47 + sweep * 9 + coat * 2;
  const rough = 227 - burnish * 29 + (1 - sweep) * 7;

  return [r, g, b, height, rough];
}

function sampleCarpetWeave(u, v, seed) {
  const freq = 24;
  const gx = Math.floor(u * freq);
  const gy = Math.floor(v * freq);
  const wx = Math.pow(0.5 + 0.5 * Math.sin(u * freq * Math.PI * 2), 0.72);
  const wy = Math.pow(0.5 + 0.5 * Math.sin(v * freq * Math.PI * 2), 0.72);
  const over = ((gx + gy) & 1) === 0;
  const loop = over ? wx * 0.76 + wy * 0.24 : wy * 0.76 + wx * 0.24;

  const heather = periodicNoise2D(u, v, 48, 48, seed + 19);
  const tuft = periodicNoise2D(u, v, 192, 192, seed + 53);
  const cloud = smoothRange(0.25, 0.75, fbmPeriodic(u, v, 6, 6, 3, seed + 89));

  const tone = 235 + loop * 11 + tuft * 5 + heather * 6 - (1 - cloud) * 12;
  const [r, g, b] = tintWarmCool(tone, (heather - 0.5) * 7);

  const height = 128 + loop * 16 + tuft * 4 + cloud * 7;
  const rough = 233 + (1 - loop) * 13 + (1 - tuft) * 7;

  return [r, g, b, height, rough];
}

function sampleWovenThreads(u, v, seed, freqX, freqY) {
  const warpPos = u * freqX;
  const weftPos = v * freqY;
  const cx = Math.floor(warpPos);
  const cy = Math.floor(weftPos);
  const warpProfile = Math.sin((warpPos - cx) * Math.PI);
  const weftProfile = Math.sin((weftPos - cy) * Math.PI);
  const warpSlub = periodicNoise2D(u, v, freqX, 7, seed);
  const weftSlub = periodicNoise2D(u, v, 9, freqY, seed + 43);
  const warp = warpProfile * warpProfile * (0.82 + warpSlub * 0.18);
  const weft = weftProfile * weftProfile * (0.82 + weftSlub * 0.18);
  const crossing = ((cx + cy) & 1) === 0 ? 0.22 : -0.22;
  // Alternate the raised yarn at crossings. Both corrections taper to zero
  // between crossings so neighboring cells do not produce abrupt edges.
  return Math.max(warp * (0.76 + crossing * weft), weft * (0.76 - crossing * warp));
}

function sampleFabricLinen(u, v, seed) {
  const thread = sampleWovenThreads(u, v, seed, 96, 88);
  const heather = fbmPeriodic(u, v, 7, 5, 3, seed + 71);
  const fiber = periodicNoise2D(u, v, 192, 176, seed + 97);

  const tone = 226 + thread * 12 + heather * 12 + fiber * 6;
  const [r, g, b] = tintWarmCool(tone, (heather - 0.5) * 7);

  const height = 128 + thread * 11 + fiber * 2;
  const rough = 229 + (1 - thread) * 12 + (1 - fiber) * 6;

  return [r, g, b, height, rough];
}

function sampleWallpaperLinen(u, v, seed) {
  const thread = sampleWovenThreads(u, v, seed, 112, 96);
  const band = fbmPeriodic(u, v, 24, 2, 3, seed + 17);

  const tone = 230 + thread * 16 + band * 11;
  const [r, g, b] = tintWarmCool(tone, (band - 0.5) * 7);
  const height = 128 + thread * 13 + band * 10;
  const rough = 221 + (1 - thread) * 12 + (1 - band) * 8;

  return [r, g, b, height, rough];
}

function sampleVelvet(u, v, seed) {
  const brush = smoothRange(0.22, 0.78, fbmPeriodic(u, v, 3, 6, 4, seed));
  const pile = fbmPeriodic(u + brush * 0.12, v + brush * 0.18, 8, 12, 3, seed + 37);
  const nap = periodicNoise2D(u + brush * 0.03, v, 64, 8, seed + 51);
  const micro = periodicNoise2D(u, v, 192, 192, seed + 61);

  const tone = 224 + brush * 17 + pile * 8 + nap * 4;
  const [r, g, b] = tintWarmCool(tone, (brush - 0.5) * 7 + (pile - 0.5) * 4);

  const height = 128 + brush * 12 + pile * 8 + micro * 3;
  const rough = 193 + (1 - brush) * 27 + (1 - nap) * 5;

  return [r, g, b, height, rough];
}

function sampleLeather(u, v, seed) {
  const vor = voronoiPeriodic(u, v, 68, 76, 0.9, seed);
  const crease = 1 - smoothRange(0.015, 0.16, vor.edge);
  const dome = smoothRange(0.02, 0.33, vor.edge);
  const patina = smoothRange(0.24, 0.76, fbmPeriodic(u, v, 3, 3, 3, seed + 53));
  const pore = periodicNoise2D(u, v, 128, 128, seed + 97);

  const crown = 237 + dome * 5 + patina * 9 + pore * 4 - vor.cellId * 5;
  const [fr, fg, fb] = tintWarmCool(crown, (patina - 0.5) * 8);

  const r = fr - crease * 13;
  const g = fg - crease * 14;
  const b = fb - crease * 15;
  const height = 130 + dome * 9 + pore * 3 - crease * 11;
  const rough = 104 + (1 - dome) * 17 + (1 - patina) * 19 + crease * 31;

  return [r, g, b, height, rough];
}

function sampleBrushedMetal(u, v, seed) {
  const s1 = periodicNoise2D(u, v, 3, 160, seed);
  const s2 = periodicNoise2D(u, v, 7, 220, seed + 37);
  const streak = s1 * 0.6 + s2 * 0.4;
  const roll = periodicNoise2D(u, v, 2, 11, seed + 71);

  const tone = 240 + streak * 10 + roll * 5;
  const [r, g, b] = tintWarmCool(tone, (roll - 0.5) * -3);
  const height = 128 + streak * 7 + roll * 5;
  const rough = 65 + (1 - streak) * 27 + (1 - roll) * 13;

  return [r, g, b, height, rough];
}

function sampleMatteMetal(u, v, seed) {
  const grain = smoothRange(0.24, 0.76, periodicNoise2D(u, v, 64, 64, seed));
  const roll = fbmPeriodic(u, v, 4, 3, 3, seed + 41);

  const tone = 236 + grain * 6 + roll * 7;
  const [r, g, b] = tintWarmCool(tone, (roll - 0.5) * -3);
  const height = 128 + grain * 7 + roll * 8;
  const rough = 117 + (1 - grain) * 17 + (1 - roll) * 12;

  return [r, g, b, height, rough];
}

const SAMPLERS = {
  'oak-parquet': sampleOakParquet,
  'walnut-wood': sampleWalnutWood,
  'walnut-veneer': sampleWalnutVeneer,
  'weathered-wood': sampleWeatheredWood,
  'oak-wood': sampleOakWood,
  'wainscot-wood': sampleWainscotWood,
  'painted-wood': samplePaintedWood,
  'ceramic-tile': sampleCeramicTile,
  'wall-tile': sampleWallTile,
  'painted-brick': samplePaintedBrick,
  'marble-tile': (u, v, seed) => sampleMarbleSurface(u, v, seed, true),
  marble: (u, v, seed) => sampleMarbleSurface(u, v, seed, false),
  'slate-stone': sampleSlateStone,
  'stucco-stone': sampleStuccoStone,
  'polished-concrete': samplePolishedConcrete,
  plaster: samplePlaster,
  'carpet-weave': sampleCarpetWeave,
  'fabric-linen': sampleFabricLinen,
  'wallpaper-linen': sampleWallpaperLinen,
  velvet: sampleVelvet,
  leather: sampleLeather,
  'metal-brushed': sampleBrushedMetal,
  'matte-metal': sampleMatteMetal,
};

function getSamplerKey(textureId, category) {
  if (textureId === 'walnut-wood' && (category === 'door' || category === 'furniture')) {
    return 'walnut-veneer';
  }
  return Object.hasOwn(SAMPLERS, textureId) ? textureId : 'plaster';
}

function canDrawCanvas() {
  if (typeof document === 'undefined') return false;
  try {
    const cv = document.createElement('canvas');
    return Boolean(cv && typeof cv.getContext === 'function' && cv.getContext('2d'));
  } catch (_) {
    return false;
  }
}

function makeCanvas() {
  const cv = document.createElement('canvas');
  cv.width = TEX_SIZE;
  cv.height = TEX_SIZE;
  return cv;
}

/**
 * Generates raw 512x512 RGBA buffers `{ mapData, normalData, roughData }` using
 * the procedural samplers and a toroidal 3x3 Sobel normal-map pass.
 */
export function sampleTextureBuffers(textureId, category) {
  const key = getSamplerKey(textureId, category);
  const sampler = SAMPLERS[key];
  const baseSeed = TEXTURE_SEEDS[key];
  const rng = mulberry32(baseSeed);
  const seed = (baseSeed + Math.floor(rng() * 1000)) | 0;

  const pixelCount = TEX_SIZE * TEX_SIZE;
  const mapData = new Uint8ClampedArray(pixelCount * 4);
  const normalData = new Uint8ClampedArray(pixelCount * 4);
  const roughData = new Uint8ClampedArray(pixelCount * 4);
  const heightBuf = new Float32Array(pixelCount);

  for (let y = 0; y < TEX_SIZE; y++) {
    const v = (y + 0.5) / TEX_SIZE;
    for (let x = 0; x < TEX_SIZE; x++) {
      const u = (x + 0.5) / TEX_SIZE;
      const [rVal, gVal, bVal, heightVal, roughVal] = sampler(u, v, seed);

      const pIdx = y * TEX_SIZE + x;
      const idx = pIdx * 4;

      mapData[idx] = clampByte(rVal);
      mapData[idx + 1] = clampByte(gVal);
      mapData[idx + 2] = clampByte(bVal);
      mapData[idx + 3] = 255;

      heightBuf[pIdx] = clamp01(heightVal / 255);

      const rByte = clampByte(roughVal);
      roughData[idx] = rByte;
      roughData[idx + 1] = rByte;
      roughData[idx + 2] = rByte;
      roughData[idx + 3] = 255;
    }
  }

  // Toroidal 3x3 Sobel filter over continuous height field for tangent-space normals.
  // +u corresponds to +x, +v corresponds to -y (matching Three.js CanvasTexture flipY = true).
  for (let y = 0; y < TEX_SIZE; y++) {
    const ym = (y - 1 + TEX_SIZE) % TEX_SIZE;
    const yp = (y + 1) % TEX_SIZE;
    const rowM = ym * TEX_SIZE;
    const row0 = y * TEX_SIZE;
    const rowP = yp * TEX_SIZE;

    for (let x = 0; x < TEX_SIZE; x++) {
      const xm = (x - 1 + TEX_SIZE) % TEX_SIZE;
      const xp = (x + 1) % TEX_SIZE;

      const tl = heightBuf[rowM + xm];
      const t = heightBuf[rowM + x];
      const tr = heightBuf[rowM + xp];
      const l = heightBuf[row0 + xm];
      const r = heightBuf[row0 + xp];
      const bl = heightBuf[rowP + xm];
      const b = heightBuf[rowP + x];
      const br = heightBuf[rowP + xp];

      const dhdx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dhdy = (tl + 2 * t + tr) - (bl + 2 * b + br);

      const gx = -dhdx * SOBEL_STRENGTH;
      const gy = -dhdy * SOBEL_STRENGTH;
      const invLen = 1 / Math.sqrt(gx * gx + gy * gy + 1);

      const nx = gx * invLen;
      const ny = gy * invLen;
      const nz = invLen;

      const idx = (row0 + x) * 4;
      normalData[idx] = clampByte((nx + 1) * 127.5);
      normalData[idx + 1] = clampByte((ny + 1) * 127.5);
      normalData[idx + 2] = clampByte((nz + 1) * 127.5);
      normalData[idx + 3] = 255;
    }
  }

  return { mapData, normalData, roughData };
}

function writeBufferToCanvas(ctx, buffer) {
  const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  img.data.set(buffer);
  ctx.putImageData(img, 0, 0);
}

function buildTextureMaps(THREE, textureId) {
  const mapCv = makeCanvas();
  const normalCv = makeCanvas();
  const roughCv = makeCanvas();

  const mapCtx = mapCv.getContext('2d');
  const normalCtx = normalCv.getContext('2d');
  const roughCtx = roughCv.getContext('2d');
  if (!mapCtx || !normalCtx || !roughCtx) return null;

  const { mapData, normalData, roughData } = sampleTextureBuffers(textureId);
  writeBufferToCanvas(mapCtx, mapData);
  writeBufferToCanvas(normalCtx, normalData);
  writeBufferToCanvas(roughCtx, roughData);

  const configureTex = (cv, colorSpace) => {
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = TEX_ANISOTROPY;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = colorSpace;
    return tex;
  };

  const map = configureTex(mapCv, THREE.SRGBColorSpace);
  const normalMap = configureTex(normalCv, THREE.NoColorSpace);
  const roughnessMap = configureTex(roughCv, THREE.NoColorSpace);

  return { map, normalMap, roughnessMap };
}

/**
 * Creates a cached procedural PBR texture manager for a Three.js scene.
 */
export function createTextureManager(THREE) {
  const hasCanvasSupport = canDrawCanvas();
  const baseCache = new Map();
  const trackedClones = new Set();
  const trackedMaterials = new Set();
  let disposed = false;

  function getTextures(textureId, category) {
    if (disposed || !hasCanvasSupport || !THREE?.CanvasTexture) return null;
    const key = getSamplerKey(textureId, category);
    if (baseCache.has(key)) return baseCache.get(key);
    const set = buildTextureMaps(THREE, key);
    if (set) baseCache.set(key, set);
    return set;
  }

  function track(material, clones = []) {
    if (disposed) return;
    for (const tex of clones) {
      if (!tex) continue;
      trackedClones.add(tex);
    }
    if (material) {
      trackedMaterials.add(material);
      if (typeof material.addEventListener === 'function') {
        const onMatDispose = () => {
          trackedMaterials.delete(material);
          for (const tex of clones) {
            if (!tex) continue;
            trackedClones.delete(tex);
            tex.dispose?.();
          }
          material.removeEventListener?.('dispose', onMatDispose);
        };
        material.addEventListener('dispose', onMatDispose);
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mat of Array.from(trackedMaterials)) {
      mat.dispose?.();
    }
    trackedMaterials.clear();

    for (const tex of Array.from(trackedClones)) {
      tex.dispose?.();
    }
    trackedClones.clear();

    for (const set of baseCache.values()) {
      set.map?.dispose?.();
      set.normalMap?.dispose?.();
      set.roughnessMap?.dispose?.();
    }
    baseCache.clear();
  }

  const manager = {
    hasCanvasSupport,
    getTextures,
    _track: track,
    dispose,
  };

  manager.getMaterial = opts => getPBRMaterial(THREE, manager, opts);
  return manager;
}

/**
 * Builds a world-scaled MeshStandardMaterial from procedural PBR maps (or a clean
 * solid material fallback when canvas 2D rendering is unavailable).
 */
export function getPBRMaterial(THREE, texManager, opts = {}) {
  const {
    category,
    textureId,
    color = '#ffffff',
    widthMeters = 1,
    heightMeters = 1,
    textureOriginMeters = [0, 0],
    roughnessOverride,
    metalnessOverride,
    extraProps = {},
  } = opts || {};

  const preset = getTexturePreset(textureId, category);
  const [repU = 1, repV = 1] = preset?.repeatMeters || [1, 1];
  const baseSet = texManager?.getTextures?.(preset?.id || textureId, category);
  const width = Number(widthMeters);
  const height = Number(heightMeters);
  const repeatX = (Number.isFinite(width) && width > 0 ? width : 1) / repU;
  const repeatY = (Number.isFinite(height) && height > 0 ? height : 1) / repV;
  const [originU, originV] = textureOriginMeters;
  const offsetU = mod1(originU / repU);
  const offsetV = mod1(originV / repV);
  const clones = [];

  const cloneTex = baseTex => {
    if (!baseTex) return null;
    if (repeatX === 1 && repeatY === 1 && offsetU === 0 && offsetV === 0) return baseTex;
    const cloned = baseTex.clone();
    cloned.repeat.set(repeatX, repeatY);
    cloned.offset.set(offsetU, offsetV);
    clones.push(cloned);
    return cloned;
  };

  const map = cloneTex(baseSet?.map);
  const normalMap = cloneTex(baseSet?.normalMap);
  // The map stores physical roughness. An explicit scalar override replaces it.
  const roughnessMap = roughnessOverride == null ? cloneTex(baseSet?.roughnessMap) : null;
  const normalStrength = preset?.normalScale ?? 0.38;
  const materialProps = {
    color,
    map,
    normalMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap,
    roughness: roughnessMap ? 1 : (roughnessOverride ?? preset?.roughness ?? 0.72),
    metalness: metalnessOverride ?? preset?.metalness ?? 0,
    envMapIntensity: preset?.envIntensity ?? 0.6,
    ...extraProps,
  };
  const hasFabricSheen = Boolean(map && preset?.sheen);
  const hasBrushedReflection = Boolean(map && preset?.anisotropy);
  let mat;
  if (THREE.MeshPhysicalMaterial && (hasFabricSheen || hasBrushedReflection)) {
    mat = new THREE.MeshPhysicalMaterial({
      ...materialProps,
      ...(hasFabricSheen ? {
        sheen: preset.sheen,
        sheenColor: new THREE.Color(materialProps.color).lerp(new THREE.Color(0xded8cf), 0.18),
        sheenRoughness: preset.sheenRoughness,
      } : {
        anisotropy: preset.anisotropy,
        anisotropyRotation: Math.PI / 2,
      }),
    });
  } else {
    mat = new THREE.MeshStandardMaterial(materialProps);
  }
  mat.userData.baseEnvIntensity = mat.envMapIntensity;
  mat.userData.baseEnvMapIntensity = mat.envMapIntensity;

  texManager?._track?.(mat, clones);
  return mat;
}
