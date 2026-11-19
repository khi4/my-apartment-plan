/**
 * Three.js 3D geometry builders for floors, walls, openings, railings, and grid.
 * Supports both 'realistic' PBR architectural rendering and 'blueprint' line/solid rendering.
 */

import { H3 } from '../data/openingSpecs.js';
import {
  DEFAULT_SCENE_STYLE,
  getTexturePreset,
  resolveRoomFloorStyle,
  resolveRoomWallStyle,
  resolveDoorStyle,
} from '../data/materialPresets.js';
import { getPBRMaterial } from './textureGenerator.js';
import {
  near,
  getRoomRects,
  insideIndoor,
  insideAny,
  computePlanGeometry,
} from '../core/walls.js';
import { P, doorGeom } from '../core/openings.js';

const FLOOR_LINE_Y = 0.004;
const PLINTH_MARGIN = 0.42;
const RAIL_HALF_T = 0.02;
const LIFT_PATTERN = /lift|shaft|elevator|مصعد|بئر/i;

const EXTERIOR_AO_STOPS = [
  [0.0, 0.84, 0.83, 0.81],
  [0.7, 0.97, 0.97, 0.96],
  [1.35, 1.0, 1.0, 1.0],
];

const INTERIOR_AO_STOPS = [
  [0.0, 0.84, 0.83, 0.81],
  [0.35, 0.94, 0.935, 0.925],
  [0.85, 0.985, 0.985, 0.98],
  [1.35, 1.0, 1.0, 1.0],
];

function sampleVerticalAO(worldY, stops) {
  const clamp01 = v => (v <= 0 ? 0 : v >= 1 ? 1 : v);
  if (worldY <= stops[0][0]) {
    return [stops[0][1], stops[0][2], stops[0][3]];
  }
  const last = stops[stops.length - 1];
  if (worldY >= last[0]) {
    return [last[1], last[2], last[3]];
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (worldY <= b[0]) {
      const t = clamp01((worldY - a[0]) / Math.max(1e-6, b[0] - a[0]));
      return [
        clamp01(a[1] + (b[1] - a[1]) * t),
        clamp01(a[2] + (b[2] - a[2]) * t),
        clamp01(a[3] + (b[3] - a[3]) * t),
      ];
    }
  }
  return [last[1], last[2], last[3]];
}

/**
 * Splits expanded indoor wall runs into solid/sill/header pieces around openings.
 */
export function wallPieces(indoorRuns = [], openings = [], wallThickness = H3.t) {
  const t =
    Number.isFinite(Number(wallThickness)) && Number(wallThickness) > 0
      ? Number(wallThickness)
      : H3.t;
  const halfT = t / 2;
  const wallRuns = (indoorRuns || []).map(r => ({
    ...r,
    a: r.a - halfT,
    b: r.b + halfT,
  }));

  const holes = (openings || []).map(p => ({
    o: p.o,
    c: p.c,
    a: Math.min(p.a1, p.a2),
    b: Math.max(p.a1, p.a2),
    lo: p.kind === 'window' ? H3.sill : 0,
    hi: p.kind === 'window' ? H3.head : H3.door,
  }));

  const out = [];
  for (const r of wallRuns) {
    let s = r.a;
    const lineHoles = holes
      .filter(p => p.o === r.o && Math.abs(p.c - r.c) < 1e-3 && p.b > r.a && p.a < r.b)
      .sort((p, q) => p.a - q.a);

    for (const p of lineHoles) {
      const ha = Math.max(s, p.a);
      const hb = Math.min(r.b, p.b);
      if (hb - ha <= 1e-6) continue;
      if (ha > s + 1e-6) {
        out.push({ ...r, a: s, b: ha, y0: 0, y1: H3.wall });
      }
      if (p.lo > 0) {
        out.push({ ...r, a: ha, b: hb, y0: 0, y1: p.lo });
      }
      if (H3.wall > p.hi + 1e-6) {
        out.push({ ...r, a: ha, b: hb, y0: p.hi, y1: H3.wall });
      }
      s = Math.max(s, hb);
    }

    if (r.b > s + 1e-6) {
      out.push({ ...r, a: s, b: r.b, y0: 0, y1: H3.wall });
    }
  }
  return out;
}

/**
 * Returns +1 or -1 pointing into the indoor room when only one side of `op` is indoor,
 * or 0 when both sides are indoor or both are outside indoor spaces.
 */
export function inSide(op, rooms = []) {
  if (!op) return 0;
  const mid = (op.a1 + op.a2) / 2;
  const a = insideIndoor(rooms, ...P(op.o, mid, op.c + 0.2));
  const b = insideIndoor(rooms, ...P(op.o, mid, op.c - 0.2));
  return a === b ? 0 : a ? 1 : -1;
}

/**
 * Returns true if `op` is a door/sliding door whose opposite side leaves the entire plan
 * (`!insideAny`), so exterior doors shut & block walking while terrace doors stay walkable.
 */
export function isExteriorDoor(op, rooms = []) {
  if (!op || op.kind === 'window') return false;
  const mid = (op.a1 + op.a2) / 2;
  const a = insideAny(rooms, ...P(op.o, mid, op.c + 0.2));
  const b = insideAny(rooms, ...P(op.o, mid, op.c - 0.2));
  return a !== b;
}

function disposeGroup(group, disposeMaterials = false) {
  if (!group) return;
  const disposedMats = new Set();
  if (Array.isArray(group.userData?.ownedMaterials)) {
    for (const mat of group.userData.ownedMaterials) {
      if (mat && !disposedMats.has(mat)) {
        disposedMats.add(mat);
        mat.dispose?.();
      }
    }
    group.userData.ownedMaterials = [];
  }
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (disposeMaterials && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat && !disposedMats.has(mat)) {
          disposedMats.add(mat);
          mat.dispose?.();
        }
      }
    }
  });
  group.clear();
}

function normalizeEdgeCoords(edge) {
  if (!edge) return null;
  if (Array.isArray(edge.line) && edge.line.length === 4) {
    const [x1, y1, x2, y2] = edge.line.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    if (near(y1, y2)) return { o: 'h', c: y1, a1: Math.min(x1, x2), a2: Math.max(x1, x2) };
    if (near(x1, x2)) return { o: 'v', c: x1, a1: Math.min(y1, y2), a2: Math.max(y1, y2) };
    return null;
  }
  const c = Number(edge.c);
  const a1 = Number(edge.a1);
  const a2 = Number(edge.a2);
  if ((edge.o !== 'h' && edge.o !== 'v') || ![c, a1, a2].every(Number.isFinite)) return null;
  return { o: edge.o, c, a1: Math.min(a1, a2), a2: Math.max(a1, a2) };
}

function collectMultiRectSeams(rooms = []) {
  const seams = [];
  for (const room of rooms || []) {
    if (!room || room.kind === 'void') continue;
    const rects = getRoomRects(room);
    if (rects.length <= 1) continue;
    for (let i = 0; i < rects.length; i++) {
      const [x1, y1, w1, h1] = rects[i];
      for (let j = i + 1; j < rects.length; j++) {
        const [x2, y2, w2, h2] = rects[j];
        for (const cy of [y1, y1 + h1]) {
          if (near(cy, y2) || near(cy, y2 + h2)) {
            const lo = Math.max(x1, x2);
            const hi = Math.min(x1 + w1, x2 + w2);
            if (hi - lo > 1e-4) seams.push({ o: 'h', c: cy, a1: lo, a2: hi });
          }
        }
        for (const cx of [x1, x1 + w1]) {
          if (near(cx, x2) || near(cx, x2 + w2)) {
            const lo = Math.max(y1, y2);
            const hi = Math.min(y1 + h1, y2 + h2);
            if (hi - lo > 1e-4) seams.push({ o: 'v', c: cx, a1: lo, a2: hi });
          }
        }
      }
    }
  }
  return seams;
}

function subtractIntervals(intervals, cuts, eps = 1e-4) {
  let parts = intervals.filter(([a, b]) => b - a > eps);
  for (const [ca, cb] of cuts) {
    const lo = Math.min(ca, cb);
    const hi = Math.max(ca, cb);
    if (hi - lo <= eps) continue;
    const next = [];
    for (const [a, b] of parts) {
      if (hi <= a + eps || lo >= b - eps) {
        next.push([a, b]);
      } else {
        if (lo - a > eps) next.push([a, lo]);
        if (b - hi > eps) next.push([hi, b]);
      }
    }
    parts = next;
  }
  return parts;
}

function mergeIntervals(intervals, eps = 1e-4) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const merged = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = sorted[i];
    const last = merged[merged.length - 1];
    if (a <= last[1] + eps) {
      last[1] = Math.max(last[1], b);
    } else {
      merged.push([a, b]);
    }
  }
  return merged;
}

function addLineBucketItem(buckets, o, c, interval) {
  for (const b of buckets) {
    if (b.o === o && near(b.c, c)) {
      b.items.push(interval);
      return;
    }
  }
  buckets.push({ o, c, items: [interval] });
}

function getLineBucketItems(buckets, o, c) {
  const out = [];
  for (const b of buckets) {
    if (b.o === o && near(b.c, c)) out.push(...b.items);
  }
  return out;
}

/**
 * Collects merged, corner-adjusted inward-facing wall segments for a single indoor room.
 */
function collectRoomInteriorWallSegments(room, rooms, indoorRuns, openEdgeBuckets, halfT) {
  const rects = getRoomRects(room);
  if (!rects.length) return [];

  const sameRoomSeams = [];
  if (rects.length > 1) {
    const edgesOf = ([x, y, w, h]) => [
      { o: 'h', c: y, a: x, b: x + w },
      { o: 'h', c: y + h, a: x, b: x + w },
      { o: 'v', c: x, a: y, b: y + h },
      { o: 'v', c: x + w, a: y, b: y + h },
    ];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        for (const e1 of edgesOf(rects[i])) {
          for (const e2 of edgesOf(rects[j])) {
            if (e1.o !== e2.o || !near(e1.c, e2.c)) continue;
            const lo = Math.max(e1.a, e2.a);
            const hi = Math.min(e1.b, e2.b);
            if (hi - lo > 1e-4) addLineBucketItem(sameRoomSeams, e1.o, e1.c, [lo, hi]);
          }
        }
      }
    }
  }

  const faceBuckets = [];
  const pushFace = (o, c, inward, a, b) => {
    const cuts = [
      ...getLineBucketItems(openEdgeBuckets, o, c),
      ...getLineBucketItems(sameRoomSeams, o, c),
    ];
    const kept = subtractIntervals([[a, b]], cuts);
    if (!kept.length) return;
    let bucket = faceBuckets.find(it => it.o === o && near(it.c, c) && it.inward === inward);
    if (!bucket) {
      bucket = { o, c, inward, items: [] };
      faceBuckets.push(bucket);
    }
    bucket.items.push(...kept);
  };

  for (const [x, y, w, h] of rects) {
    if (w <= 1e-6 || h <= 1e-6) continue;
    pushFace('h', y, 1, x, x + w);
    pushFace('h', y + h, -1, x, x + w);
    pushFace('v', x, 1, y, y + h);
    pushFace('v', x + w, -1, y, y + h);
  }

  const adjustEnd = (o, c, inward, endPt, isStart) => {
    const perp = indoorRuns.filter(q => q.o !== o && near(q.c, endPt));
    const hasInwardPerp = perp.some(q =>
      inward > 0 ? q.a <= c + 1e-3 && q.b > c + 1e-3 : q.b >= c - 1e-3 && q.a < c - 1e-3,
    );
    if (hasInwardPerp) {
      return isStart ? endPt + halfT : endPt - halfT;
    }
    const hasOutwardPerp = perp.some(q =>
      inward > 0 ? q.a < c - 1e-3 && q.b >= c - 1e-3 : q.b > c + 1e-3 && q.a <= c + 1e-3,
    );
    if (hasOutwardPerp) {
      const continuesAlong = indoorRuns.some(
        r =>
          r.o === o &&
          near(r.c, c) &&
          (isStart ? r.a < endPt - 1e-3 && r.b >= endPt - 1e-3 : r.b > endPt + 1e-3 && r.a <= endPt + 1e-3),
      );
      if (!continuesAlong) {
        const probe = P(o, endPt + (isStart ? -0.05 : 0.05), c + inward * 0.1);
        if (insideIndoor(rooms, probe[0], probe[1])) {
          return isStart ? endPt - halfT : endPt + halfT;
        }
      }
    }
    return endPt;
  };

  const out = [];
  for (const fb of faceBuckets) {
    for (const [rawA, rawB] of mergeIntervals(fb.items)) {
      const a = adjustEnd(fb.o, fb.c, fb.inward, rawA, true);
      const b = adjustEnd(fb.o, fb.c, fb.inward, rawB, false);
      if (b - a > 1e-4) {
        out.push({ o: fb.o, c: fb.c, inward: fb.inward, a, b });
      }
    }
  }
  return out;
}

function splitWallFaceAroundOpenings(seg, openings) {
  const holes = (openings || [])
    .filter(p => p && p.o === seg.o && Math.abs(p.c - seg.c) < 1e-3)
    .map(p => ({
      a: Math.min(p.a1, p.a2),
      b: Math.max(p.a1, p.a2),
      lo: p.kind === 'window' ? H3.sill : 0,
      hi: p.kind === 'window' ? H3.head : H3.door,
    }))
    .filter(p => p.b > seg.a + 1e-6 && p.a < seg.b - 1e-6)
    .sort((p, q) => p.a - q.a);

  const patches = [];
  let s = seg.a;
  for (const p of holes) {
    const ha = Math.max(s, p.a);
    const hb = Math.min(seg.b, p.b);
    if (hb - ha <= 1e-6) continue;
    if (ha > s + 1e-6) {
      patches.push({ a: s, b: ha, y0: 0, y1: H3.wall });
    }
    if (p.lo > 1e-6) {
      patches.push({ a: ha, b: hb, y0: 0, y1: p.lo });
    }
    if (H3.wall > p.hi + 1e-6) {
      patches.push({ a: ha, b: hb, y0: p.hi, y1: H3.wall });
    }
    s = Math.max(s, hb);
  }
  if (seg.b > s + 1e-6) {
    patches.push({ a: s, b: seg.b, y0: 0, y1: H3.wall });
  }
  return patches;
}

/**
 * Rebuilds 3D floors, walls, openings, railings, shut exterior doors, and grid.
 */
export function buildWallsAndFloors3D({
  THREE,
  M,
  wallMats,
  floorsGroup,
  wallsGroup,
  gridGroup,
  rooms = [],
  openEdges = [],
  openings = [],
  geometry,
  walking = false,
  sceneStyle,
  texManager,
}) {
  const renderMode = sceneStyle?.renderMode || (texManager ? 'realistic' : 'blueprint');
  const style = sceneStyle || DEFAULT_SCENE_STYLE;
  const geom = geometry || computePlanGeometry(rooms, openEdges);
  const V3 = (x, y, h = 0) => new THREE.Vector3(x, h, y);

  const addLine = (pts, mat, parent, dashed = false) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    if (dashed) line.computeLineDistances();
    parent.add(line);
    return line;
  };

  if (renderMode === 'realistic') {
    return buildRealistic({
      THREE,
      M,
      floorsGroup,
      wallsGroup,
      gridGroup,
      rooms,
      openEdges,
      openings,
      geom,
      walking,
      style,
      texManager,
      V3,
      addLine,
    });
  }

  return buildBlueprint({
    THREE,
    M,
    wallMats,
    floorsGroup,
    wallsGroup,
    gridGroup,
    rooms,
    openEdges,
    openings,
    geom,
    walking,
    V3,
    addLine,
  });
}

function buildGrid3D({ THREE, M, gridGroup, geom, V3, onPlinth = false }) {
  if (!gridGroup) return;
  disposeGroup(gridGroup, false);
  const b = geom.bounds || { minX: 0, minY: 0, maxX: 14, maxY: 11 };
  const x0 = onPlinth ? b.minX - PLINTH_MARGIN : Math.min(0, Math.floor(b.minX));
  const y0 = onPlinth ? b.minY - PLINTH_MARGIN : Math.min(0, Math.floor(b.minY));
  const x1 = onPlinth ? b.maxX + PLINTH_MARGIN : Math.max(14, Math.ceil(b.maxX));
  const y1 = onPlinth ? b.maxY + PLINTH_MARGIN : Math.max(11, Math.ceil(b.maxY));
  const gridPts = [[], []];
  const gridY = FLOOR_LINE_Y / 2;

  const nx0 = Math.ceil(x0 * 2);
  const nx1 = Math.floor(x1 * 2);
  for (let i = nx0; i <= nx1; i++) {
    const x = i / 2;
    gridPts[Math.abs(i) % 2 ? 0 : 1].push(V3(x, y0, gridY), V3(x, y1, gridY));
  }

  const ny0 = Math.ceil(y0 * 2);
  const ny1 = Math.floor(y1 * 2);
  for (let i = ny0; i <= ny1; i++) {
    const y = i / 2;
    gridPts[Math.abs(i) % 2 ? 0 : 1].push(V3(x0, y, gridY), V3(x1, y, gridY));
  }

  if (gridPts[0].length && M?.gridMinor) {
    gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPts[0]), M.gridMinor));
  }
  if (gridPts[1].length && M?.gridMajor) {
    gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPts[1]), M.gridMajor));
  }
}

function buildBlueprint({
  THREE,
  M,
  wallMats,
  floorsGroup,
  wallsGroup,
  gridGroup,
  rooms,
  openEdges,
  openings,
  geom,
  walking,
  V3,
  addLine,
}) {
  const addBox = (x0, x1, y0, y1, z0, z1, parent, hitList) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    if (dx <= 1e-6 || dy <= 1e-6 || dz <= 1e-6) return null;
    const geo = new THREE.BoxGeometry(dx, dy, dz);
    const mesh = new THREE.Mesh(geo, wallMats);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
    edges.position.copy(mesh.position);
    parent.add(mesh, edges);
    if (hitList) hitList.push(mesh);
    return mesh;
  };

  const floors = [];
  const floorHits = [];
  if (floorsGroup) {
    disposeGroup(floorsGroup, true);
    for (const room of rooms || []) {
      if (!room) continue;
      const kind = room.kind || 'room';
      const isLift =
        kind === 'void' && LIFT_PATTERN.test(`${room.en || ''} ${room.ar || ''} ${room.id || ''}`);
      for (const [x, y, w, h] of getRoomRects(room)) {
        if (w <= 1e-6 || h <= 1e-6) continue;
        const geo = new THREE.PlaneGeometry(w, h);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
        mesh.position.set(x + w / 2, 0, y + h / 2);
        mesh.userData.room = room.id;
        floorsGroup.add(mesh);
        floorHits.push(mesh);
        floors.push({ id: room.id, kind, mesh, isRealistic: false });

        if (isLift) {
          addLine([V3(x, y, FLOOR_LINE_Y), V3(x + w, y + h, FLOOR_LINE_Y)], M.fine, floorsGroup);
          addLine([V3(x + w, y, FLOOR_LINE_Y), V3(x, y + h, FLOOR_LINE_Y)], M.fine, floorsGroup);
        }
      }
    }
  }

  const wallHits = [];
  const openingHits = [];
  let shutGroup = null;
  let openingGroup = null;
  if (wallsGroup) {
    disposeGroup(wallsGroup, false);
    const halfT = H3.t / 2;

    for (const p of wallPieces(geom.indoorRuns || [], openings)) {
      if (p.o === 'h') {
        addBox(p.a, p.b, p.y0, p.y1, p.c - halfT, p.c + halfT, wallsGroup, wallHits);
      } else {
        addBox(p.c - halfT, p.c + halfT, p.y0, p.y1, p.a, p.b, wallsGroup, wallHits);
      }
    }

    openingGroup = new THREE.Group();
    openingGroup.name = 'openings';
    openingGroup.userData.isOpeningGroup = true;
    wallsGroup.add(openingGroup);

    const addGlassPane = (o, c, a1, a2, lo, hi) => {
      const q = (a, h) => (o === 'h' ? V3(a, c, h) : V3(c, a, h));
      addLine([q(a1, lo), q(a2, lo), q(a2, hi), q(a1, hi), q(a1, lo)], M.fine, openingGroup);
      addLine([q((a1 + a2) / 2, lo), q((a1 + a2) / 2, hi)], M.fine, openingGroup);
    };

    for (const op of openings || []) {
      if (!op) continue;
      if (op.kind === 'window') {
        addGlassPane(op.o, op.c, op.a1, op.a2, H3.sill, H3.head);
      } else if (op.kind === 'sliding') {
        addGlassPane(op.o, op.c, op.a1, op.a2, 0, H3.door);
      } else {
        const g = doorGeom(op);
        const L = g.L;
        const t1 = Math.atan2(g.tip[1] - g.H[1], g.tip[0] - g.H[0]);
        let dt = Math.atan2(g.J[1] - g.H[1], g.J[0] - g.H[0]) - t1;
        if (dt > Math.PI) dt -= 2 * Math.PI;
        if (dt < -Math.PI) dt += 2 * Math.PI;
        addLine([V3(g.H[0], g.H[1], FLOOR_LINE_Y), V3(g.tip[0], g.tip[1], FLOOR_LINE_Y)], M.edge, openingGroup);
        addLine(
          Array.from({ length: 21 }, (_, i) =>
            V3(
              g.H[0] + L * Math.cos(t1 + (dt * i) / 20),
              g.H[1] + L * Math.sin(t1 + (dt * i) / 20),
              FLOOR_LINE_Y,
            ),
          ),
          M.fine,
          openingGroup,
        );
      }
    }

    // Dashed floor lines for open edges and internal multi-rect room seams
    const drawnOpen = [];
    for (const raw of openEdges || []) {
      const e = normalizeEdgeCoords(raw);
      if (!e || e.a2 - e.a1 <= 1e-4) continue;
      drawnOpen.push(e);
      const [p1, p2] =
        e.o === 'h'
          ? [V3(e.a1, e.c, FLOOR_LINE_Y), V3(e.a2, e.c, FLOOR_LINE_Y)]
          : [V3(e.c, e.a1, FLOOR_LINE_Y), V3(e.c, e.a2, FLOOR_LINE_Y)];
      addLine([p1, p2], M.dash, wallsGroup, true);
    }

    for (const seam of collectMultiRectSeams(rooms)) {
      const covered = drawnOpen.some(
        e => e.o === seam.o && near(e.c, seam.c) && e.a1 <= seam.a1 + 1e-3 && e.a2 >= seam.a2 - 1e-3,
      );
      if (covered) continue;
      drawnOpen.push(seam);
      const [p1, p2] =
        seam.o === 'h'
          ? [V3(seam.a1, seam.c, FLOOR_LINE_Y), V3(seam.a2, seam.c, FLOOR_LINE_Y)]
          : [V3(seam.c, seam.a1, FLOOR_LINE_Y), V3(seam.c, seam.a2, FLOOR_LINE_Y)];
      addLine([p1, p2], M.dash, wallsGroup, true);
    }

    // Terrace railings: top rail and posts every ~1 m
    for (const pts of geom.railings || []) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        addBox(
          Math.min(ax, bx) - RAIL_HALF_T,
          Math.max(ax, bx) + RAIL_HALF_T,
          H3.rail - 2 * RAIL_HALF_T,
          H3.rail,
          Math.min(ay, by) - RAIL_HALF_T,
          Math.max(ay, by) + RAIL_HALF_T,
          wallsGroup,
          wallHits,
        );
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(len / 1.0));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const y = ay + ((by - ay) * k) / n;
          addBox(
            x - RAIL_HALF_T,
            x + RAIL_HALF_T,
            0,
            H3.rail - 2 * RAIL_HALF_T,
            y - RAIL_HALF_T,
            y + RAIL_HALF_T,
            wallsGroup,
            wallHits,
          );
        }
      }
    }

    // Exterior doors shown shut while walking
    shutGroup = new THREE.Group();
    shutGroup.name = 'shut';
    shutGroup.visible = Boolean(walking);
    openingGroup.add(shutGroup);
    for (const op of openings || []) {
      if (op?.kind !== 'door' || !isExteriorDoor(op, rooms)) continue;
      if (op.o === 'h') {
        addBox(op.a1, op.a2, 0, H3.door, op.c - halfT / 2, op.c + halfT / 2, shutGroup, null);
      } else {
        addBox(op.c - halfT / 2, op.c + halfT / 2, 0, H3.door, op.a1, op.a2, shutGroup, null);
      }
    }
  }

  buildGrid3D({ THREE, M, gridGroup, geom, V3 });

  return {
    floors,
    floorHits,
    wallHits,
    openingHits,
    shutGroup,
    openingGroup,
    pedestalMesh: null,
    compassGroup: null,
  };
}

function buildRealistic({
  THREE,
  M,
  floorsGroup,
  wallsGroup,
  gridGroup,
  rooms,
  openEdges,
  openings,
  geom,
  walking,
  style,
  texManager,
  V3,
  addLine,
}) {
  const rawWallT =
    style?.wallThickness === null ||
    style?.wallThickness === undefined ||
    style?.wallThickness === '' ||
    typeof style?.wallThickness === 'boolean'
      ? NaN
      : Number(style.wallThickness);
  const wallT = Math.max(0.04, Math.min(0.35, Number.isFinite(rawWallT) ? rawWallT : 0.08));
  const halfT = wallT / 2;

  // 1. Floors, Diorama Pedestal Slab & Architectural Compass Ring
  const floors = [];
  const floorHits = [];
  let pedestalMesh = null;
  let compassGroup = null;
  if (floorsGroup) {
    disposeGroup(floorsGroup, true);
    const liftLineMat = new THREE.LineBasicMaterial({
      color: '#9b958b',
      transparent: true,
      opacity: 0.5,
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: '#f5f2ea',
      roughness: 0.96,
      shadowSide: THREE.DoubleSide,
    });
    const ceilings = new THREE.Group();
    ceilings.name = 'walk-ceilings';
    ceilings.visible = walking;
    floorsGroup.add(ceilings);
    floorsGroup.userData.ownedMaterials = [liftLineMat, ceilingMat];

    for (const room of rooms || []) {
      if (!room) continue;
      const kind = room.kind || 'room';
      const isLift =
        kind === 'void' && LIFT_PATTERN.test(`${room.en || ''} ${room.ar || ''} ${room.id || ''}`);
      const floorStyle = resolveRoomFloorStyle(room, style);

      for (const [x, y, w, h] of getRoomRects(room)) {
        if (w <= 1e-6 || h <= 1e-6) continue;
        const geo = new THREE.PlaneGeometry(w, h);
        geo.rotateX(-Math.PI / 2);

        let mat;
        let posY = 0;
        if (kind === 'void') {
          posY = -0.005;
          mat = new THREE.MeshStandardMaterial({
            color: floorStyle.color || '#d2cec6',
            roughness: 0.9,
            metalness: 0.0,
          });
        } else {
          mat = getPBRMaterial(THREE, texManager, {
            category: 'floor',
            textureId: floorStyle.texture,
            color: floorStyle.color,
            widthMeters: w,
            heightMeters: h,
            textureOriginMeters: [x, -(y + h)],
          });
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x + w / 2, posY, y + h / 2);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.userData = { room: room.id, baseEmissive: 0x000000 };
        floorsGroup.add(mesh);
        floorHits.push(mesh);
        floors.push({ id: room.id, kind, mesh, isRealistic: true });

        if (kind === 'room' || kind === 'hall') {
          const ceilingGeo = new THREE.PlaneGeometry(w, h);
          ceilingGeo.rotateX(Math.PI / 2);
          const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
          ceiling.position.set(x + w / 2, H3.wall - 0.008, y + h / 2);
          ceiling.castShadow = true;
          ceiling.receiveShadow = true;
          ceilings.add(ceiling);
        }

        if (isLift) {
          const lineY = posY + 0.002;
          addLine([V3(x, y, lineY), V3(x + w, y + h, lineY)], liftLineMat, floorsGroup);
          addLine([V3(x + w, y, lineY), V3(x, y + h, lineY)], liftLineMat, floorsGroup);
        }
      }
    }

    const b = geom?.bounds;
    if (
      Array.isArray(rooms) &&
      rooms.length > 0 &&
      b &&
      Number.isFinite(b.minX) &&
      Number.isFinite(b.maxX) &&
      Number.isFinite(b.minY) &&
      Number.isFinite(b.maxY)
    ) {
      const pedPad = PLINTH_MARGIN;
      const pedMinX = b.minX - pedPad;
      const pedMaxX = b.maxX + pedPad;
      const pedMinY = b.minY - pedPad;
      const pedMaxY = b.maxY + pedPad;
      const pedW = Math.max(0.2, pedMaxX - pedMinX);
      const pedD = Math.max(0.2, pedMaxY - pedMinY);
      const pedH = 0.332; // y = -0.34 .. -0.008

      const pedTopMat = getPBRMaterial(THREE, texManager, {
        category: 'floor',
        textureId: 'polished-concrete',
        color: style?.outerGroundColor || DEFAULT_SCENE_STYLE.outerGroundColor,
        widthMeters: pedW,
        heightMeters: pedD,
        metalnessOverride: 0.02,
      });
      const pedSideMat = getPBRMaterial(THREE, texManager, {
        category: 'wall',
        textureId: 'stucco-stone',
        color: '#aaa69f',
        widthMeters: Math.max(pedW, pedD),
        heightMeters: pedH * 3,
      });
      const pedBottomMat = new THREE.MeshStandardMaterial({
        color: '#6d6559',
        roughness: 0.94,
        metalness: 0.02,
      });
      floorsGroup.userData.ownedMaterials.push(pedTopMat, pedSideMat, pedBottomMat);

      const pedGeo = new THREE.BoxGeometry(pedW, pedH, pedD);
      pedestalMesh = new THREE.Mesh(pedGeo, [
        pedSideMat,
        pedSideMat,
        pedTopMat,
        pedBottomMat,
        pedSideMat,
        pedSideMat,
      ]);
      pedestalMesh.name = 'diorama-pedestal';
      pedestalMesh.position.set((pedMinX + pedMaxX) / 2, -0.34 + pedH / 2, (pedMinY + pedMaxY) / 2);
      pedestalMesh.receiveShadow = true;
      pedestalMesh.castShadow = true;
      pedestalMesh.userData = { pedestal: true };
      floorsGroup.add(pedestalMesh);

      const cx = Number.isFinite(b.centerX) ? b.centerX : (b.minX + b.maxX) / 2;
      const cy = Number.isFinite(b.centerY) ? b.centerY : (b.minY + b.maxY) / 2;
      const radius = Math.max(4.8, Math.hypot(pedW / 2, pedD / 2) + 0.55);
      const ringY = -0.325;

      compassGroup = new THREE.Group();
      compassGroup.name = 'compass-ring';

      const ringGeo = new THREE.RingGeometry(radius - 0.035, radius, 72);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({
        color: '#77736b',
        roughness: 0.78,
        metalness: 0.0,
        transparent: true,
        opacity: 0.44,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(0, ringY, 0);
      ringMesh.castShadow = false;
      ringMesh.receiveShadow = false;
      compassGroup.add(ringMesh);

      for (const [tx, tz, rot] of [
        [radius + 0.04, 0, Math.PI / 2],
        [0, radius + 0.04, 0],
        [-(radius + 0.04), 0, Math.PI / 2],
      ]) {
        const tickGeo = new THREE.PlaneGeometry(0.028, 0.13);
        tickGeo.rotateX(-Math.PI / 2);
        const tickMesh = new THREE.Mesh(tickGeo, ringMat);
        tickMesh.position.set(tx, ringY + 0.001, tz);
        tickMesh.rotation.y = rot;
        tickMesh.castShadow = false;
        tickMesh.receiveShadow = false;
        compassGroup.add(tickMesh);
      }

      const wedgeShape = new THREE.Shape();
      wedgeShape.moveTo(0, 0.34);
      wedgeShape.lineTo(-0.125, 0);
      wedgeShape.lineTo(0, 0.065);
      wedgeShape.lineTo(0.125, 0);
      wedgeShape.closePath();
      const wedgeGeo = new THREE.ShapeGeometry(wedgeShape);
      wedgeGeo.rotateX(-Math.PI / 2);
      const northWedgeMat = new THREE.MeshStandardMaterial({
        color: '#c94038',
        roughness: 0.38,
        metalness: 0.18,
        side: THREE.DoubleSide,
      });
      const wedgeMesh = new THREE.Mesh(wedgeGeo, northWedgeMat);
      wedgeMesh.position.set(0, ringY + 0.002, -(radius - 0.02));
      wedgeMesh.castShadow = false;
      wedgeMesh.receiveShadow = false;
      compassGroup.add(wedgeMesh);

      if (typeof document !== 'undefined' && THREE.CanvasTexture) {
        const cardinals = [
          { label: 'N', x: 0, z: -(radius + 0.58), isNorth: true },
          { label: 'E', x: radius + 0.36, z: 0, isNorth: false },
          { label: 'S', x: 0, z: radius + 0.36, isNorth: false },
          { label: 'W', x: -(radius + 0.36), z: 0, isNorth: false },
        ];
        for (const c of cardinals) {
          const cv = document.createElement('canvas');
          cv.width = 128;
          cv.height = 128;
          const ctx = cv.getContext?.('2d');
          if (!ctx) continue;

          ctx.clearRect(0, 0, 128, 128);
          ctx.fillStyle = c.isNorth ? '#a34a3c' : '#514e49';
          ctx.font = '600 68px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(c.label, 64, 67);

          const tex = new THREE.CanvasTexture(cv);
          if ('colorSpace' in tex && THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
          }
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          floorsGroup.userData.ownedMaterials.push(tex);

          const plaqueGeo = new THREE.PlaneGeometry(0.46, 0.46);
          plaqueGeo.rotateX(-Math.PI / 2);
          const plaqueMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
          plaqueMesh.position.set(c.x, ringY + 0.003, c.z);
          plaqueMesh.castShadow = false;
          plaqueMesh.receiveShadow = false;
          compassGroup.add(plaqueMesh);
        }
      }

      const rawNorth = Number(style?.northDeg);
      const northDeg = Number.isFinite(rawNorth) ? rawNorth : 0;
      compassGroup.position.set(cx, 0, cy);
      compassGroup.rotation.y = -(northDeg * Math.PI) / 180;
      floorsGroup.add(compassGroup);
    }
  }

  // 2. Walls, per-room interior surfaces, baseboards, 3D doors/windows, railings
  const wallHits = [];
  const openingHits = [];
  let shutGroup = null;
  let openingGroup = null;

  if (wallsGroup) {
    disposeGroup(wallsGroup, false);
    const ownedMaterials = [];
    const trackMat = mat => {
      if (mat) ownedMaterials.push(mat);
      return mat;
    };

    const outerPreset = getTexturePreset('stucco-stone', 'wall');
    const [outerRepU = 1.5, outerRepV = 1.5] = outerPreset?.repeatMeters || [1.5, 1.5];
    const outerWallMat = trackMat(
      getPBRMaterial(THREE, texManager, {
        category: 'wall',
        textureId: 'stucco-stone',
        color: '#ede7dc',
        widthMeters: outerRepU,
        heightMeters: outerRepV,
        extraProps: { vertexColors: true },
      }),
    );
    const wallCapMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f6f2ea',
        roughness: 0.56,
        metalness: 0.02,
        envMapIntensity: 0.48,
      }),
    );
    const baseboardMat = trackMat(
      getPBRMaterial(THREE, texManager, {
        category: 'door',
        textureId: 'painted-wood',
        color: '#ede8df',
        widthMeters: 1.5,
        heightMeters: 0.5,
      }),
    );
    const sillMat = trackMat(
      getPBRMaterial(THREE, texManager, {
        category: 'furniture',
        textureId: 'marble',
        color: '#ece8df',
        widthMeters: 1.2,
        heightMeters: 0.4,
      }),
    );
    sillMat.userData._shared = true;
    const handleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#c4c7cc',
        roughness: 0.24,
        metalness: 0.85,
      }),
    );
    handleMat.userData._shared = true;

    const glazingSeal = trackMat(new THREE.MeshStandardMaterial({
      color: '#514f4a', roughness: 0.84,
    }));
    glazingSeal.userData._shared = true;

    const GlassMatCtor = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const glassMat = trackMat(
      new GlassMatCtor({
        color: '#e4eeeb',
        roughness: 0.12,
        metalness: 0,
        ior: 1.5,
        specularIntensity: 0.55,
        transparent: true,
        opacity: 0.19,
        envMapIntensity: 1.25,
        depthWrite: false,
      }),
    );
    glassMat.userData._shared = true;

    const railMetalMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#2c3137',
        roughness: 0.35,
        metalness: 0.75,
      }),
    );
    const railGlassMat = trackMat(
      new GlassMatCtor({
        color: '#e4eeeb',
        roughness: 0.12,
        metalness: 0,
        ior: 1.5,
        specularIntensity: 0.55,
        transparent: true,
        opacity: 0.19,
        envMapIntensity: 1.25,
        depthWrite: false,
      }),
    );
    railGlassMat.userData._shared = true;

    let aoMat = null;
    if (typeof document !== 'undefined') {
      const aoCanvas = document.createElement('canvas');
      aoCanvas.width = 1;
      aoCanvas.height = 64;
      const ctx = aoCanvas.getContext?.('2d');
      if (ctx && THREE.CanvasTexture) {
        const grad = ctx.createLinearGradient(0, 0, 0, 64);
        grad.addColorStop(0.0, 'rgba(18, 16, 14, 0.23)');
        grad.addColorStop(0.25, 'rgba(18, 16, 14, 0.09)');
        grad.addColorStop(0.58, 'rgba(18, 16, 14, 0.025)');
        grad.addColorStop(1.0, 'rgba(18, 16, 14, 0.00)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1, 64);

        const aoTex = trackMat(new THREE.CanvasTexture(aoCanvas));
        if ('colorSpace' in aoTex && THREE.SRGBColorSpace) {
          aoTex.colorSpace = THREE.SRGBColorSpace;
        }
        aoTex.wrapS = THREE.ClampToEdgeWrapping;
        aoTex.wrapT = THREE.ClampToEdgeWrapping;
        aoTex.minFilter = THREE.LinearFilter;
        aoTex.magFilter = THREE.LinearFilter;
        aoTex.needsUpdate = true;

        aoMat = trackMat(
          new THREE.MeshBasicMaterial({
            map: aoTex,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            depthWrite: false,
          }),
        );
      }
    }

    const addBox = (x0, x1, y0, y1, z0, z1, mat, parent, {
      castShadow = true,
      receiveShadow = true,
      edgeMat = null,
      userData = null,
      hitList = null,
    } = {}) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      if (dx <= 1e-6 || dy <= 1e-6 || dz <= 1e-6) return null;
      const geo = new THREE.BoxGeometry(dx, dy, dz);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      if (userData) Object.assign(mesh.userData, userData);
      parent.add(mesh);
      if (edgeMat) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
        edges.position.copy(mesh.position);
        parent.add(edges);
      }
      if (hitList) hitList.push(mesh);
      return mesh;
    };

    // 2a. Structural wall core (slightly recessed 2mm per side so inner room wall planes never z-fight)
    const coreHalfT = Math.max(0.005, halfT - 0.002);
    const wallCoreMats = [
      outerWallMat,
      outerWallMat,
      wallCapMat,
      wallCapMat,
      outerWallMat,
      outerWallMat,
    ];
    const safeOuterRepU = Math.max(0.01, outerRepU);
    const safeOuterRepV = Math.max(0.01, outerRepV);

    const addWallCoreBox = (x0, x1, y0, y1, z0, z1) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      if (dx <= 1e-6 || dy <= 1e-6 || dz <= 1e-6) return null;

      const centerX = (x0 + x1) / 2;
      const centerY = (y0 + y1) / 2;
      const centerZ = (z0 + z1) / 2;
      const hSegs = dy > 1.2 ? 8 : dy > 0.45 ? 4 : 1;
      const geo = new THREE.BoxGeometry(dx, dy, dz, 1, hSegs, 1);

      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const colors = new Float32Array(pos.count * 3);

      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const nx = norm ? Math.abs(norm.getX(i)) : 0;
        const ny = norm ? Math.abs(norm.getY(i)) : 0;
        const nz = norm ? Math.abs(norm.getZ(i)) : 0;

        const worldX = centerX + px;
        const worldY = Math.max(0, centerY + py);
        const worldZ = centerZ + pz;

        if (uv) {
          if (nz >= 0.5) {
            uv.setXY(i, worldX / safeOuterRepU, worldY / safeOuterRepV);
          } else if (nx >= 0.5) {
            uv.setXY(i, worldZ / safeOuterRepU, worldY / safeOuterRepV);
          } else if (ny >= 0.5) {
            uv.setXY(i, worldX / safeOuterRepU, worldZ / safeOuterRepV);
          }
        }

        const [cr, cg, cb] = sampleVerticalAO(worldY, EXTERIOR_AO_STOPS);
        colors[i * 3] = cr;
        colors[i * 3 + 1] = cg;
        colors[i * 3 + 2] = cb;
      }
      if (uv) uv.needsUpdate = true;
      if (THREE.BufferAttribute) {
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }

      const mesh = new THREE.Mesh(geo, wallCoreMats);
      mesh.position.set(centerX, centerY, centerZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { wall: true };
      wallsGroup.add(mesh);
      wallHits.push(mesh);

      return mesh;
    };

    const coreHalfTH = coreHalfT;
    const coreHalfTV = Math.max(0.004, coreHalfT - 0.0008);
    for (const p of wallPieces(geom.indoorRuns || [], openings, wallT)) {
      if (p.o === 'h') {
        addWallCoreBox(p.a, p.b, p.y0, p.y1, p.c - coreHalfTH, p.c + coreHalfTH);
      } else {
        const y1V = Math.abs(p.y1 - H3.wall) < 1e-4 ? p.y1 - 0.0012 : p.y1;
        addWallCoreBox(p.c - coreHalfTV, p.c + coreHalfTV, p.y0, y1V, p.a, p.b);
      }
    }

    // 2b. Per-room interior wall surfaces & baseboards
    const openEdgeBuckets = [];
    for (const raw of openEdges || []) {
      const e = normalizeEdgeCoords(raw);
      if (e && e.a2 - e.a1 > 1e-4) addLineBucketItem(openEdgeBuckets, e.o, e.c, [e.a1, e.a2]);
    }

    const wallMatCache = new Map();
    const getRoomWallMaterial = (wallColor, wallTexture) => {
      const preset = getTexturePreset(wallTexture, 'wall');
      const [repU = 2.0, repV = 2.0] = preset?.repeatMeters || [2.0, 2.0];
      const key = `${wallTexture}|${wallColor}`;
      if (!wallMatCache.has(key)) {
        const mat = trackMat(
          getPBRMaterial(THREE, texManager, {
            category: 'wall',
            textureId: wallTexture,
            color: wallColor,
            widthMeters: repU,
            heightMeters: repV,
            extraProps: {
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
              vertexColors: true,
            },
          }),
        );
        wallMatCache.set(key, { mat, repU, repV });
      }
      return wallMatCache.get(key);
    };

    const faceOffset = halfT + 0.001;
    for (const room of rooms || []) {
      if (!room || (room.kind !== 'room' && room.kind !== 'hall')) continue;
      const { color: wallColor, texture: wallTexture } = resolveRoomWallStyle(room, style);
      const { mat: wallMat, repU, repV } = getRoomWallMaterial(wallColor, wallTexture);
      const segments = collectRoomInteriorWallSegments(
        room,
        rooms,
        geom.indoorRuns || [],
        openEdgeBuckets,
        halfT,
      );

      for (const seg of segments) {
        const patches = splitWallFaceAroundOpenings(seg, openings);
        const rotY =
          seg.o === 'h'
            ? seg.inward > 0
              ? 0
              : Math.PI
            : seg.inward > 0
              ? Math.PI / 2
              : -Math.PI / 2;
        const positiveDir = (seg.o === 'h' && seg.inward > 0) || (seg.o === 'v' && seg.inward < 0);

        for (const patch of patches) {
          const span = patch.b - patch.a;
          const patchH = patch.y1 - patch.y0;
          if (span <= 1e-4 || patchH <= 1e-4) continue;

          const geo = new THREE.PlaneGeometry(span, patchH, 1, 8);
          const uv = geo.attributes.uv;
          const uBase = positiveDir ? patch.a : -patch.b;
          const vBase = patch.y0;
          for (let i = 0; i < uv.count; i++) {
            const u = (uBase + uv.getX(i) * span) / Math.max(0.01, repU);
            const v = (vBase + uv.getY(i) * patchH) / Math.max(0.01, repV);
            uv.setXY(i, u, v);
          }
          uv.needsUpdate = true;

          const pos = geo.attributes.position;
          const midA = (patch.a + patch.b) / 2;
          const midY = (patch.y0 + patch.y1) / 2;
          const colors = new Float32Array(pos.count * 3);
          for (let i = 0; i < pos.count; i++) {
            const worldY = midY + pos.getY(i);
            const [cr, cg, cb] = sampleVerticalAO(worldY, INTERIOR_AO_STOPS);
            colors[i * 3] = cr;
            colors[i * 3 + 1] = cg;
            colors[i * 3 + 2] = cb;
          }
          if (THREE.BufferAttribute) {
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          }

          const mesh = new THREE.Mesh(geo, wallMat);
          const coordC = seg.c + seg.inward * faceOffset;
          if (seg.o === 'h') {
            mesh.position.set(midA, midY, coordC);
          } else {
            mesh.position.set(coordC, midY, midA);
          }
          mesh.rotation.y = rotY;
          mesh.receiveShadow = true;
          mesh.castShadow = false;
          mesh.userData = { room: room.id };
          wallsGroup.add(mesh);
          wallHits.push(mesh);

          // 0.065 m ('h') / 0.0644 m ('v') tall baseboard along floor-level wall segments
          if (patch.y0 === 0) {
            const bbH = seg.o === 'h' ? 0.065 : 0.0644;
            const bbInner = seg.c + seg.inward * (halfT + 0.001);
            const bbOuter = seg.c + seg.inward * (halfT + (seg.o === 'h' ? 0.007 : 0.0066));
            const c0 = Math.min(bbInner, bbOuter);
            const c1 = Math.max(bbInner, bbOuter);
            if (seg.o === 'h') {
              addBox(patch.a, patch.b, 0, bbH, c0, c1, baseboardMat, wallsGroup, {
                castShadow: false,
                receiveShadow: true,
                userData: { room: room.id },
                hitList: wallHits,
              });
            } else {
              addBox(c0, c1, 0, bbH, patch.a, patch.b, baseboardMat, wallsGroup, {
                castShadow: false,
                receiveShadow: true,
                userData: { room: room.id },
                hitList: wallHits,
              });
            }

            if (aoMat) {
              const aoDepth = 0.12;
              const aoGeo = new THREE.PlaneGeometry(span, aoDepth);
              aoGeo.rotateX(-Math.PI / 2);
              const aoMesh = new THREE.Mesh(aoGeo, aoMat);
              const aoY = seg.o === 'h' ? 0.0022 : 0.0030;
              const aoCoordC = seg.c + seg.inward * (halfT + 0.007 + aoDepth / 2);
              if (seg.o === 'h') {
                aoMesh.position.set(midA, aoY, aoCoordC);
              } else {
                aoMesh.position.set(aoCoordC, aoY, midA);
              }
              aoMesh.rotation.y = rotY;
              aoMesh.castShadow = false;
              aoMesh.receiveShadow = false;
              aoMesh.userData = { ao: true };
              wallsGroup.add(aoMesh);
            }
          }
        }
      }
    }

    // 2c. 3D Doors, Sliding Doors, and Windows
    openingGroup = new THREE.Group();
    openingGroup.name = 'openings';
    openingGroup.userData.isOpeningGroup = true;
    wallsGroup.add(openingGroup);

    const extOpenGroup = new THREE.Group();
    extOpenGroup.name = 'extOpen';
    extOpenGroup.visible = !walking;
    openingGroup.add(extOpenGroup);

    shutGroup = new THREE.Group();
    shutGroup.name = 'shut';
    shutGroup.visible = Boolean(walking);
    openingGroup.add(shutGroup);

    const addOrientedBox = (op, along0, along1, y0, y1, off0, off1, mat, parent, hitList) => {
      const x0 = op.o === 'h' ? along0 : op.c + off0;
      const x1 = op.o === 'h' ? along1 : op.c + off1;
      const z0 = op.o === 'h' ? op.c + off0 : along0;
      const z1 = op.o === 'h' ? op.c + off1 : along1;
      const m = addBox(x0, x1, y0, y1, z0, z1, mat, parent, {
        castShadow: !mat.transparent,
        receiveShadow: !mat.transparent,
        userData: { opId: op.id, baseEmissive: 0x000000 },
        hitList,
      });
      if (m && hitList) openingHits.push(m);
      return m;
    };

    const buildDoorLeafGroup = ({
      op,
      pivotX,
      pivotZ,
      angle,
      leafW,
      leafH,
      leafT,
      leafMat,
      trimMat,
      parent,
      hitList,
    }) => {
      const grp = new THREE.Group();
      grp.position.set(pivotX, 0, pivotZ);
      grp.rotation.y = -angle;
      grp.userData = { opId: op.id };
      parent.add(grp);

      const leafY0 = 0.005;
      const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafT), leafMat);
      leafMesh.position.set(leafW / 2, leafY0 + leafH / 2, 0);
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      leafMesh.userData = { opId: op.id, baseEmissive: 0x000000 };
      grp.add(leafMesh);
      if (hitList) {
        hitList.push(leafMesh);
        openingHits.push(leafMesh);
      }

      // Raised panel molding frames on both faces
      const panelMarginX = Math.min(0.11, leafW * 0.16);
      const innerPanelW = leafW - 2 * panelMarginX;
      if (innerPanelW > 0.12) {
        const panelZ = leafT / 2 + 0.003;
        const upperGeo = new THREE.BoxGeometry(innerPanelW, leafH * 0.42, 0.006);
        const lowerGeo = new THREE.BoxGeometry(innerPanelW, leafH * 0.28, 0.006);
        for (const sgn of [-1, 1]) {
          const upper = new THREE.Mesh(upperGeo, trimMat);
          upper.position.set(leafW / 2, leafY0 + leafH * 0.7, sgn * panelZ);
          upper.castShadow = false;
          upper.receiveShadow = true;
          upper.userData = { opId: op.id, baseEmissive: 0x000000 };

          const lower = new THREE.Mesh(lowerGeo, trimMat);
          lower.position.set(leafW / 2, leafY0 + leafH * 0.24, sgn * panelZ);
          lower.castShadow = false;
          lower.receiveShadow = true;
          lower.userData = { opId: op.id, baseEmissive: 0x000000 };

          grp.add(upper, lower);
        }
      }

      // Brushed metallic lever handles on both sides
      const hx = Math.max(0.12, leafW - 0.08);
      const hy = 1.02;
      const roseGeo = new THREE.BoxGeometry(0.042, 0.11, 0.006);
      const neckGeo = new THREE.BoxGeometry(0.018, 0.018, 0.026);
      const leverGeo = new THREE.BoxGeometry(0.11, 0.016, 0.014);
      for (const sgn of [-1, 1]) {
        const rose = new THREE.Mesh(roseGeo, handleMat);
        rose.position.set(hx, hy, sgn * (leafT / 2 + 0.003));
        rose.userData = { opId: op.id };

        const neck = new THREE.Mesh(neckGeo, handleMat);
        neck.position.set(hx, hy, sgn * (leafT / 2 + 0.016));
        neck.userData = { opId: op.id };

        const lever = new THREE.Mesh(leverGeo, handleMat);
        lever.position.set(hx - 0.042, hy, sgn * (leafT / 2 + 0.03));
        lever.castShadow = true;
        lever.userData = { opId: op.id };

        grp.add(rose, neck, lever);
      }

      return grp;
    };

    for (const op of openings || []) {
      if (!op) continue;
      const a1 = Math.min(op.a1, op.a2);
      const a2 = Math.max(op.a1, op.a2);
      const span = a2 - a1;
      if (span <= 1e-4) continue;

      const { color: doorColor, frameColor, texture: doorTex } = resolveDoorStyle(op, style);
      const frameMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: frameColor,
          roughness: 0.48,
          metalness: 0.06,
        }),
      );

      const frameDepth = wallT + 0.025;
      const halfFD = frameDepth / 2;

      if (op.kind === 'window') {
        const ft = 0.04;
        addOrientedBox(op, a1, a1 + ft, H3.sill + ft, H3.head - ft, -halfFD, halfFD, frameMat, openingGroup, wallHits);
        addOrientedBox(op, a2 - ft, a2, H3.sill + ft, H3.head - ft, -halfFD, halfFD, frameMat, openingGroup, wallHits);
        addOrientedBox(op, a1, a2, H3.head - ft, H3.head, -halfFD, halfFD, frameMat, openingGroup, wallHits);
        addOrientedBox(op, a1, a2, H3.sill, H3.sill + ft, -halfFD, halfFD, frameMat, openingGroup, wallHits);

        // Protruding interior/exterior window sill (wallT + 0.07 m deep, 0.032 m thick)
        const sillHalfD = (wallT + 0.07) / 2;
        addOrientedBox(
          op,
          a1 - 0.035,
          a2 + 0.035,
          H3.sill - 0.032,
          H3.sill,
          -sillHalfD,
          sillHalfD,
          sillMat,
          openingGroup,
          wallHits,
        );

        // Center mullion when width >= 1.0 m
        const mid = (a1 + a2) / 2;
        const hasMullion = span >= 1.0;
        if (hasMullion) {
          addOrientedBox(
            op,
            mid - 0.02,
            mid + 0.02,
            H3.sill + ft,
            H3.head - ft,
            -wallT * 0.35,
            wallT * 0.35,
            frameMat,
            openingGroup,
            wallHits,
          );
        }
        const panes = hasMullion
          ? [[a1 + ft, mid - 0.02], [mid + 0.02, a2 - ft]]
          : [[a1 + ft, a2 - ft]];
        for (const [start, end] of panes) {
          const seal = 0.007;
          const w = end - start;
          const h = H3.head - H3.sill - ft * 2;
          const frame = new THREE.Shape();
          frame.moveTo(0, 0);
          frame.lineTo(w, 0);
          frame.lineTo(w, h);
          frame.lineTo(0, h);
          frame.closePath();
          const aperture = new THREE.Path();
          aperture.moveTo(seal, seal);
          aperture.lineTo(seal, h - seal);
          aperture.lineTo(w - seal, h - seal);
          aperture.lineTo(w - seal, seal);
          aperture.closePath();
          frame.holes.push(aperture);
          const sealGeo = new THREE.ExtrudeGeometry(frame, { depth: 0.015, bevelEnabled: false });
          sealGeo.translate(0, 0, -0.0075);
          const bead = new THREE.Mesh(sealGeo, glazingSeal);
          if (op.o === 'v') bead.rotation.y = -Math.PI / 2;
          bead.position.set(op.o === 'h' ? start : op.c, H3.sill + ft, op.o === 'h' ? op.c : start);
          bead.receiveShadow = true;
          bead.userData.opId = op.id;
          openingGroup.add(bead);
          openingHits.push(bead);
          addOrientedBox(op, start + seal, end - seal, H3.sill + ft + seal, H3.head - ft - seal,
            -0.004, 0.004, glassMat, openingGroup, wallHits);
        }
      } else if (op.kind === 'sliding') {
        const ft = 0.04;
        addOrientedBox(op, a1, a1 + ft, 0.016, H3.door - ft, -halfFD, halfFD, frameMat, openingGroup, wallHits);
        addOrientedBox(op, a2 - ft, a2, 0.016, H3.door - ft, -halfFD, halfFD, frameMat, openingGroup, wallHits);
        addOrientedBox(op, a1, a2, H3.door - ft, H3.door, -halfFD, halfFD, frameMat, openingGroup, wallHits);
        addOrientedBox(op, a1, a2, 0, 0.016, -halfFD, halfFD, frameMat, openingGroup, wallHits);

        const innerA1 = a1 + ft;
        const innerA2 = a2 - ft;
        const innerW = Math.max(0.2, innerA2 - innerA1);
        const sashW = Math.min(innerW, Math.max(0.24, innerW * 0.54));
        const st = 0.04;
        const trackOff = Math.min(0.018, wallT * 0.16);
        const sashHalfD = Math.min(0.014, Math.max(0.004, trackOff - 0.001));

        const panelMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: doorColor,
            roughness: 0.42,
            metalness: 0.08,
          }),
        );

        const buildSash = (sa1, sa2, offC, handleSide) => {
          addOrientedBox(op, sa1, sa1 + st, 0.016 + st, H3.door - ft - st, offC - sashHalfD, offC + sashHalfD, panelMat, openingGroup, wallHits);
          addOrientedBox(op, sa2 - st, sa2, 0.016 + st, H3.door - ft - st, offC - sashHalfD, offC + sashHalfD, panelMat, openingGroup, wallHits);
          addOrientedBox(op, sa1, sa2, H3.door - ft - st, H3.door - ft, offC - sashHalfD, offC + sashHalfD, panelMat, openingGroup, wallHits);
          addOrientedBox(op, sa1, sa2, 0.016, 0.016 + st, offC - sashHalfD, offC + sashHalfD, panelMat, openingGroup, wallHits);

          const pullA = handleSide < 0 ? sa1 + st + 0.015 : sa2 - st - 0.03;
          addOrientedBox(
            op,
            pullA,
            pullA + 0.015,
            0.9,
            1.16,
            offC - sashHalfD - 0.008,
            offC + sashHalfD + 0.008,
            handleMat,
            openingGroup,
            null,
          );

          addOrientedBox(
            op,
            sa1 + st,
            sa2 - st,
            0.016 + st,
            H3.door - ft - st,
            offC - 0.004,
            offC + 0.004,
            glassMat,
            openingGroup,
            wallHits,
          );
        };

        buildSash(innerA1, innerA1 + sashW, -trackOff, -1);
        buildSash(innerA2 - sashW, innerA2, trackOff, 1);
      } else {
        // Hinged door
        addOrientedBox(
          op,
          a1 - 0.005,
          a1 + 0.035,
          0,
          H3.door - 0.035,
          -halfFD,
          halfFD,
          frameMat,
          openingGroup,
          wallHits,
        );
        addOrientedBox(
          op,
          a2 - 0.035,
          a2 + 0.005,
          0,
          H3.door - 0.035,
          -halfFD,
          halfFD,
          frameMat,
          openingGroup,
          wallHits,
        );
        addOrientedBox(
          op,
          a1 - 0.005,
          a2 + 0.005,
          H3.door - 0.035,
          H3.door + 0.005,
          -halfFD,
          halfFD,
          frameMat,
          openingGroup,
          wallHits,
        );

        const leafW = Math.max(0.2, span - 0.06);
        const leafH = H3.door - 0.03;
        const leafT = 0.04;
        const leafMat = trackMat(
          getPBRMaterial(THREE, texManager, {
            category: 'door',
            textureId: doorTex,
            color: doorColor,
            widthMeters: leafW,
            heightMeters: leafH,
          }),
        );
        const trimMat = trackMat(
          getPBRMaterial(THREE, texManager, {
            category: 'door',
            textureId: doorTex,
            color: frameColor,
            widthMeters: leafW,
            heightMeters: leafH,
          }),
        );

        const g = doorGeom(op);
        const angClosed = Math.atan2(g.J[1] - g.H[1], g.J[0] - g.H[0]);
        const angOpen = Math.atan2(g.tip[1] - g.H[1], g.tip[0] - g.H[0]);
        let dt = angOpen - angClosed;
        if (dt > Math.PI) dt -= 2 * Math.PI;
        if (dt < -Math.PI) dt += 2 * Math.PI;

        const pivotX = g.H[0] + 0.03 * Math.cos(angClosed);
        const pivotZ = g.H[1] + 0.03 * Math.sin(angClosed);
        const openAngle = angClosed + dt * 0.78;
        const isExt = isExteriorDoor(op, rooms);

        if (isExt) {
          buildDoorLeafGroup({
            op,
            pivotX,
            pivotZ,
            angle: openAngle,
            leafW,
            leafH,
            leafT,
            leafMat,
            trimMat,
            parent: extOpenGroup,
            hitList: wallHits,
          });
          buildDoorLeafGroup({
            op,
            pivotX,
            pivotZ,
            angle: angClosed,
            leafW,
            leafH,
            leafT,
            leafMat,
            trimMat,
            parent: shutGroup,
            hitList: null,
          });
        } else {
          buildDoorLeafGroup({
            op,
            pivotX,
            pivotZ,
            angle: openAngle,
            leafW,
            leafH,
            leafT,
            leafMat,
            trimMat,
            parent: openingGroup,
            hitList: wallHits,
          });
        }
      }
    }

    // 2d. Realistic Terrace Railings (handrail + posts + tempered glass infill 0.08..0.94 m)
    const cornerKey = (x, y) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
    const claimedRailEnds = new Set();
    const placedPosts = new Set();

    for (const pts of geom.railings || []) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len <= 1e-4) continue;

        const horiz = Math.abs(by - ay) <= Math.abs(bx - ax);
        const startA = horiz ? ax : ay;
        const endA = horiz ? bx : by;
        const dir = Math.sign(endA - startA) || 1;
        const startKey = cornerKey(ax, ay);
        const endKey = cornerKey(bx, by);
        const startClaimed = i > 0 || claimedRailEnds.has(startKey);
        const endClaimed = claimedRailEnds.has(endKey);
        const aStart = startA + (startClaimed ? dir * RAIL_HALF_T : -dir * RAIL_HALF_T);
        const aEnd = endA + (endClaimed ? -dir * RAIL_HALF_T : dir * RAIL_HALF_T);
        claimedRailEnds.add(startKey);
        claimedRailEnds.add(endKey);

        // Top brushed-metal handrail (inset already-claimed L-corners so perpendicular rails miter flush)
        if (dir * (aEnd - aStart) > 1e-6) {
          const r0 = Math.min(aStart, aEnd);
          const r1 = Math.max(aStart, aEnd);
          const c0 = (horiz ? Math.min(ay, by) : Math.min(ax, bx)) - RAIL_HALF_T;
          const c1 = (horiz ? Math.max(ay, by) : Math.max(ax, bx)) + RAIL_HALF_T;
          addBox(
            horiz ? r0 : c0,
            horiz ? r1 : c1,
            H3.rail - 0.045,
            H3.rail,
            horiz ? c0 : r0,
            horiz ? c1 : r1,
            railMetalMat,
            wallsGroup,
            { castShadow: true, receiveShadow: true, userData: { wall: true }, hitList: wallHits },
          );
        }

        // Posts every ~1 m
        const n = Math.max(1, Math.ceil(len / 1.0));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const y = ay + ((by - ay) * k) / n;
          const pKey = cornerKey(x, y);
          if (placedPosts.has(pKey)) continue;
          placedPosts.add(pKey);
          addBox(
            x - RAIL_HALF_T,
            x + RAIL_HALF_T,
            0,
            H3.rail - 0.045,
            y - RAIL_HALF_T,
            y + RAIL_HALF_T,
            railMetalMat,
            wallsGroup,
            { castShadow: true, receiveShadow: true, userData: { wall: true }, hitList: wallHits },
          );
        }

        // Tempered glass infill between 0.08 m and 0.94 m
        const glassPad = 0.006;
        if (horiz) {
          addBox(
            Math.min(ax, bx),
            Math.max(ax, bx),
            0.08,
            0.94,
            (ay + by) / 2 - glassPad,
            (ay + by) / 2 + glassPad,
            railGlassMat,
            wallsGroup,
            { castShadow: false, receiveShadow: false, userData: { wall: true }, hitList: null },
          );
        } else {
          addBox(
            (ax + bx) / 2 - glassPad,
            (ax + bx) / 2 + glassPad,
            0.08,
            0.94,
            Math.min(ay, by),
            Math.max(ay, by),
            railGlassMat,
            wallsGroup,
            { castShadow: false, receiveShadow: false, userData: { wall: true }, hitList: null },
          );
        }
      }
    }

    wallsGroup.userData.ownedMaterials = ownedMaterials;
  }

  // 3. Subtle architectural grid (when gridOn is enabled)
  buildGrid3D({ THREE, M, gridGroup, geom, V3, onPlinth: rooms.length > 0 });

  return {
    floors,
    floorHits,
    wallHits,
    openingHits,
    shutGroup,
    openingGroup,
    pedestalMesh,
    compassGroup,
  };
}
