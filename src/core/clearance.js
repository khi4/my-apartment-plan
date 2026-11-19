/**
 * Furniture bounding boxes, local-to-plan coordinate transform,
 * wall collision sweeps, and clearance gap measurements.
 */

import { r2 } from './scale.js';
import { near } from './walls.js';
import { FURNITURE_BY_TYPE } from '../data/furnitureCatalog.js';

const DIRS = [
  ['left', -1, 0],
  ['right', 1, 0],
  ['up', 0, -1],
  ['down', 0, 1],
];

export function aabb(it) {
  const a = (it.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hx = (c * it.L + s * it.W) / 2;
  const hy = (s * it.L + c * it.W) / 2;
  return [it.x - hx, it.y - hy, it.x + hx, it.y + hy];
}

export function furnToPlan(it, lx, ly) {
  const fx = it.flip ? -lx : lx;
  const a = (it.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [it.x + fx * c - ly * s, it.y + fx * s + ly * c];
}

export function crossesWall(box, WALLS = []) {
  const [x0, y0, x1, y1] = box;
  return WALLS.some(([a, b, c, d]) =>
    near(a, c)
      ? a > x0 + 1e-3 && a < x1 - 1e-3 && Math.max(b, d) > y0 + 1e-3 && Math.min(b, d) < y1 - 1e-3
      : b > y0 + 1e-3 && b < y1 - 1e-3 && Math.max(a, c) > x0 + 1e-3 && Math.min(a, c) < x1 - 1e-3,
  );
}

export function wallDist(x, y, dx, dy, WALLS = []) {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of WALLS) {
    let d;
    if (dx) {
      if (!near(x1, x2) || y < Math.min(y1, y2) - 1e-9 || y > Math.max(y1, y2) + 1e-9) continue;
      d = (x1 - x) * dx;
    } else {
      if (!near(y1, y2) || x < Math.min(x1, x2) - 1e-9 || x > Math.max(x1, x2) + 1e-9) continue;
      d = (y1 - y) * dy;
    }
    if (d >= -1e-6 && d < best) best = Math.max(0, d);
  }
  return best;
}

export function itemDist(x, y, dx, dy, boxes = []) {
  let best = Infinity;
  for (const b of boxes) {
    let d;
    if (dx) {
      if (y <= b[1] || y >= b[3]) continue;
      d = dx > 0 ? b[0] - x : x - b[2];
    } else {
      if (x <= b[0] || x >= b[2]) continue;
      d = dy > 0 ? b[1] - y : y - b[3];
    }
    if (d >= -1e-6 && d < best) best = Math.max(0, d);
  }
  return best;
}

export function sweep(box, dx, dy, WALLS = []) {
  const [x0, y0, x1, y1] = box;
  const v = dx || dy;
  if (!v) return 0;
  let allowed = v;
  for (const [a, b, c, d] of WALLS) {
    if (dx) {
      if (!near(a, c) || Math.max(b, d) <= y0 + 1e-3 || Math.min(b, d) >= y1 - 1e-3) continue;
      const gap = v > 0 ? a - x1 : a - x0;
      if (v > 0 && gap >= -1e-6 && gap < allowed) allowed = Math.max(0, gap);
      if (v < 0 && gap <= 1e-6 && gap > allowed) allowed = Math.min(0, gap);
    } else {
      if (!near(b, d) || Math.max(a, c) <= x0 + 1e-3 || Math.min(a, c) >= x1 - 1e-3) continue;
      const gap = v > 0 ? b - y1 : b - y0;
      if (v > 0 && gap >= -1e-6 && gap < allowed) allowed = Math.max(0, gap);
      if (v < 0 && gap <= 1e-6 && gap > allowed) allowed = Math.min(0, gap);
    }
  }
  return allowed;
}

export function moveBlocked(it, tx, ty, WALLS = [], pass = 0.35) {
  let blocked = false;
  const cur = { ...it };

  const wantX = tx - cur.x;
  let ax = sweep(aabb(cur), wantX, 0, WALLS);
  if (Math.abs(wantX - ax) > pass) ax = wantX;
  else if (Math.abs(wantX - ax) > 1e-6) blocked = true;
  cur.x = r2(cur.x + ax);

  const wantY = ty - cur.y;
  let ay = sweep(aabb(cur), 0, wantY, WALLS);
  if (Math.abs(wantY - ay) > pass) ay = wantY;
  else if (Math.abs(wantY - ay) > 1e-6) blocked = true;
  cur.y = r2(cur.y + ay);

  return { x: cur.x, y: cur.y, blocked };
}

export function gapsFor(it, furniture = [], WALLS = []) {
  const [x0, y0, x1, y1] = aabb(it);
  const isUnder = Boolean(FURNITURE_BY_TYPE[it.type]?.under);
  const boxes = isUnder
    ? []
    : furniture
        .filter(o => o !== it && (!it.id || o.id !== it.id) && !FURNITURE_BY_TYPE[o.type]?.under)
        .map(aabb);
  const out = { sides: {}, wall: false, item: false };
  out.item = boxes.some(b => b[0] < x1 - 1e-3 && b[2] > x0 + 1e-3 && b[1] < y1 - 1e-3 && b[3] > y0 + 1e-3);
  out.wall = crossesWall([x0, y0, x1, y1], WALLS);

  for (const [k, dx, dy] of DIRS) {
    const a = dx ? y0 : x0;
    const b = dx ? y1 : x1;
    const n = Math.max(2, Math.ceil((b - a) / 0.05));
    let best = null;
    for (let i = 0; i <= n; i++) {
      const sAlong = a + 0.003 + ((b - a - 0.006) * i) / n;
      const px = dx ? (dx > 0 ? x1 : x0) : sAlong;
      const py = dx ? sAlong : (dy > 0 ? y1 : y0);
      const w = wallDist(px, py, dx, dy, WALLS);
      const f = itemDist(px, py, dx, dy, boxes);
      const d = Math.min(w, f);
      const off = Math.abs(sAlong - (a + b) / 2);
      if (!best || d < best.d - 0.001 || (Math.abs(d - best.d) <= 0.001 && off < best.off)) {
        best = { d, px, py, dx, dy, off };
      }
    }
    out.sides[k] = best;
  }
  return out;
}

export function inPiece(it, x, y) {
  const a = (it.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const vx = x - it.x;
  const vy = y - it.y;
  return Math.abs(vx * c + vy * s) < it.L / 2 - 1e-3 && Math.abs(-vx * s + vy * c) < it.W / 2 - 1e-3;
}
