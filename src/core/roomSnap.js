/**
 * Room snapping, overlap detection, resize clamping, and automatic placement helpers.
 */

import { r2, snapTo, clampRoomSize } from './scale.js';
import { getRoomRects } from './walls.js';

function extractRects(otherRooms = []) {
  const out = [];
  for (const item of otherRooms || []) {
    if (!item) continue;
    if (Array.isArray(item) && typeof item[0] === 'number') {
      out.push(item);
    } else {
      for (const r of getRoomRects(item)) out.push(r);
    }
  }
  return out;
}

export function roomsOverlap(rectA, rectB, eps = 1e-3) {
  const [ax, ay, aw, ah] = rectA;
  const [bx, by, bw, bh] = rectB;
  return (
    ax < bx + bw - eps &&
    ax + aw > bx + eps &&
    ay < by + bh - eps &&
    ay + ah > by + eps
  );
}

function findClosestXSnap(val, w, otherRects, threshold) {
  let best = null;
  for (const r of otherRects) {
    const [ox, oy, ow, oh] = r;
    for (const target of [ox, ox + ow]) {
      // Snap left edge (val) to target
      const dLeft = Math.abs(val - target);
      if (dLeft <= threshold && (!best || dLeft < best.d)) {
        best = { d: dLeft, nx: target, target, oy, oh };
      }
      // Snap right edge (val + w) to target
      const dRight = Math.abs(val + w - target);
      if (dRight <= threshold && (!best || dRight < best.d)) {
        best = { d: dRight, nx: target - w, target, oy, oh };
      }
    }
  }
  return best;
}

function findClosestYSnap(val, h, otherRects, threshold) {
  let best = null;
  for (const r of otherRects) {
    const [ox, oy, ow, oh] = r;
    for (const target of [oy, oy + oh]) {
      // Snap top edge (val) to target
      const dTop = Math.abs(val - target);
      if (dTop <= threshold && (!best || dTop < best.d)) {
        best = { d: dTop, ny: target, target, ox, ow };
      }
      // Snap bottom edge (val + h) to target
      const dBottom = Math.abs(val + h - target);
      if (dBottom <= threshold && (!best || dBottom < best.d)) {
        best = { d: dBottom, ny: target - h, target, ox, ow };
      }
    }
  }
  return best;
}

function findClosestEdgeSnap(coord, otherRects, axis, threshold) {
  let best = null;
  for (const r of otherRects) {
    const [ox, oy, ow, oh] = r;
    const targets = axis === 'x' ? [ox, ox + ow] : [oy, oy + oh];
    for (const target of targets) {
      const d = Math.abs(coord - target);
      if (d <= threshold && (!best || d < best.d)) {
        best = { d, target, ox, oy, ow, oh };
      }
    }
  }
  return best;
}

export function snapRoomMove(rect, otherRooms, stepSize = 0.05, threshold = 0.25) {
  const [x, y, w, h] = rect;
  const otherRects = extractRects(otherRooms);

  const snapX = findClosestXSnap(x, w, otherRects, threshold);
  const snapY = findClosestYSnap(y, h, otherRects, threshold);

  const nx = r2(snapX ? snapX.nx : snapTo(x, stepSize));
  const ny = r2(snapY ? snapY.ny : snapTo(y, stepSize));
  const rw = r2(w);
  const rh = r2(h);

  const guides = [];
  if (snapX) {
    guides.push({
      o: 'v',
      c: r2(snapX.target),
      a1: r2(Math.min(ny, snapX.oy)),
      a2: r2(Math.max(ny + rh, snapX.oy + snapX.oh)),
    });
  }
  if (snapY) {
    guides.push({
      o: 'h',
      c: r2(snapY.target),
      a1: r2(Math.min(nx, snapY.ox)),
      a2: r2(Math.max(nx + rw, snapY.ox + snapY.ow)),
    });
  }

  return { x: nx, y: ny, w: rw, h: rh, guides };
}

export function snapRoomResize(
  origRect,
  dir,
  pointerPt,
  otherRooms,
  stepSize = 0.05,
  minSize = 0.4,
  maxSize = 30.0,
  threshold = 0.2,
) {
  const [ox, oy, ow, oh] = origRect;
  const left = ox;
  const right = ox + ow;
  const top = oy;
  const bottom = oy + oh;

  const hasW = dir.includes('w');
  const hasE = dir.includes('e');
  const hasN = dir.includes('n');
  const hasS = dir.includes('s');

  const otherRects = extractRects(otherRooms);

  let nx = left;
  let nw = ow;
  let snapXInfo = null;

  if (hasE) {
    const snap = findClosestEdgeSnap(pointerPt.x, otherRects, 'x', threshold);
    const targetX = snap ? snap.target : snapTo(pointerPt.x, stepSize);
    nw = clampRoomSize(targetX - left, minSize, maxSize);
    if (snap && Math.abs(left + nw - snap.target) < 1e-3) snapXInfo = snap;
  } else if (hasW) {
    const snap = findClosestEdgeSnap(pointerPt.x, otherRects, 'x', threshold);
    const targetX = snap ? snap.target : snapTo(pointerPt.x, stepSize);
    nw = clampRoomSize(right - targetX, minSize, maxSize);
    nx = r2(right - nw);
    if (snap && Math.abs(nx - snap.target) < 1e-3) snapXInfo = snap;
  }

  let ny = top;
  let nh = oh;
  let snapYInfo = null;

  if (hasS) {
    const snap = findClosestEdgeSnap(pointerPt.y, otherRects, 'y', threshold);
    const targetY = snap ? snap.target : snapTo(pointerPt.y, stepSize);
    nh = clampRoomSize(targetY - top, minSize, maxSize);
    if (snap && Math.abs(top + nh - snap.target) < 1e-3) snapYInfo = snap;
  } else if (hasN) {
    const snap = findClosestEdgeSnap(pointerPt.y, otherRects, 'y', threshold);
    const targetY = snap ? snap.target : snapTo(pointerPt.y, stepSize);
    nh = clampRoomSize(bottom - targetY, minSize, maxSize);
    ny = r2(bottom - nh);
    if (snap && Math.abs(ny - snap.target) < 1e-3) snapYInfo = snap;
  }

  nx = r2(nx);
  ny = r2(ny);
  nw = r2(nw);
  nh = r2(nh);

  const guides = [];
  if (snapXInfo) {
    guides.push({
      o: 'v',
      c: r2(snapXInfo.target),
      a1: r2(Math.min(ny, snapXInfo.oy)),
      a2: r2(Math.max(ny + nh, snapXInfo.oy + snapXInfo.oh)),
    });
  }
  if (snapYInfo) {
    guides.push({
      o: 'h',
      c: r2(snapYInfo.target),
      a1: r2(Math.min(nx, snapYInfo.ox)),
      a2: r2(Math.max(nx + nw, snapYInfo.ox + snapYInfo.ow)),
    });
  }

  return { rect: [nx, ny, nw, nh], guides };
}

export function findFreeRoomSpot(across, deep, existingRooms = [], preferredCenter = null) {
  const w = r2(across);
  const h = r2(deep);
  const existingRects = extractRects(existingRooms);

  if (existingRects.length === 0) {
    const x = preferredCenter
      ? snapTo(preferredCenter.x - w / 2, 0.5)
      : Math.max(0, snapTo(5 - w / 2, 0.5));
    const y = preferredCenter
      ? snapTo(preferredCenter.y - h / 2, 0.5)
      : Math.max(0, snapTo(4 - h / 2, 0.5));
    return [r2(x), r2(y), w, h];
  }

  // Order anchor rects: closest to preferredCenter if provided, else most recently added first
  const anchors = preferredCenter
    ? [...existingRects].sort((a, b) => {
        const da = Math.hypot(a[0] + a[2] / 2 - preferredCenter.x, a[1] + a[3] / 2 - preferredCenter.y);
        const db = Math.hypot(b[0] + b[2] / 2 - preferredCenter.x, b[1] + b[3] / 2 - preferredCenter.y);
        return da - db;
      })
    : [...existingRects].reverse();

  const isFree = cand => !existingRects.some(r => roomsOverlap(cand, r));

  const flushCandidates = ([ax, ay, aw, ah]) => [
    // Right edge (top-aligned, bottom-aligned)
    [r2(ax + aw), r2(ay), w, h],
    [r2(ax + aw), r2(ay + ah - h), w, h],
    // Bottom edge (left-aligned, right-aligned)
    [r2(ax), r2(ay + ah), w, h],
    [r2(ax + aw - w), r2(ay + ah), w, h],
    // Left edge (top-aligned, bottom-aligned)
    [r2(ax - w), r2(ay), w, h],
    [r2(ax - w), r2(ay + ah - h), w, h],
    // Top edge (left-aligned, right-aligned)
    [r2(ax), r2(ay - h), w, h],
    [r2(ax + aw - w), r2(ay - h), w, h],
  ];

  // First pass: prefer flush placement inside non-negative coordinates (x >= 0, y >= 0)
  for (const anchor of anchors) {
    for (const cand of flushCandidates(anchor)) {
      if (cand[0] >= -1e-4 && cand[1] >= -1e-4 && isFree(cand)) return cand;
    }
  }

  // Second pass: flush placement anywhere (allows negative coordinates if needed)
  for (const anchor of anchors) {
    for (const cand of flushCandidates(anchor)) {
      if (isFree(cand)) return cand;
    }
  }

  // Fallback: scan around overall bounding box in 0.5 m steps
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [rx, ry, rw, rh] of existingRects) {
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx + rw);
    maxY = Math.max(maxY, ry + rh);
  }

  const bMinX = Math.max(0, snapTo(minX, 0.5));
  const bMinY = Math.max(0, snapTo(minY, 0.5));
  const bMaxX = snapTo(maxX, 0.5);
  const bMaxY = snapTo(maxY, 0.5);

  for (let y = bMinY; y <= bMaxY + h + 2; y = r2(y + 0.5)) {
    for (let x = bMinX; x <= bMaxX + w + 2; x = r2(x + 0.5)) {
      const cand = [x, y, w, h];
      if (isFree(cand)) return cand;
    }
  }

  return [r2(maxX), r2(minY), w, h];
}
