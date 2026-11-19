/**
 * Wall topology, space containment, shared-boundary detection, railings, and bounds
 * derived from room rectangles and openEdges.
 */

const clean = v => {
  const n = Math.round(Number(v) * 1e6) / 1e6;
  return n === 0 ? 0 : n;
};

export const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

export const getRoomRects = room =>
  Array.isArray(room?.rects) ? room.rects : Array.isArray(room?.rect) ? room.rect : [];

const isIndoor = room => room?.kind === 'room' || room?.kind === 'hall';

export function insideIndoor(rooms, x, y) {
  for (const room of rooms || []) {
    if (!isIndoor(room)) continue;
    for (const [x0, y0, w, h] of getRoomRects(room)) {
      if (x > x0 && x < x0 + w && y > y0 && y < y0 + h) return true;
    }
  }
  return false;
}

export function insideAny(rooms, x, y) {
  for (const room of rooms || []) {
    if (!room || room.kind === 'void') continue;
    for (const [x0, y0, w, h] of getRoomRects(room)) {
      if (x > x0 && x < x0 + w && y > y0 && y < y0 + h) return true;
    }
  }
  return false;
}

export function roomAt(rooms, x, y) {
  const list = rooms || [];
  // Prefer strict interior of non-void spaces first
  for (const room of list) {
    if (!room || room.kind === 'void') continue;
    for (const [x0, y0, w, h] of getRoomRects(room)) {
      if (x > x0 && x < x0 + w && y > y0 && y < y0 + h) return room;
    }
  }
  // Then boundary-inclusive check for non-void spaces
  for (const room of list) {
    if (!room || room.kind === 'void') continue;
    for (const [x0, y0, w, h] of getRoomRects(room)) {
      if (x >= x0 - 1e-6 && x <= x0 + w + 1e-6 && y >= y0 - 1e-6 && y <= y0 + h + 1e-6) return room;
    }
  }
  // Finally void spaces (boundary-inclusive)
  for (const room of list) {
    if (!room || room.kind !== 'void') continue;
    for (const [x0, y0, w, h] of getRoomRects(room)) {
      if (x >= x0 - 1e-6 && x <= x0 + w + 1e-6 && y >= y0 - 1e-6 && y <= y0 + h + 1e-6) return room;
    }
  }
  return null;
}

function rectEdges([x, y, w, h]) {
  const x0 = clean(x);
  const y0 = clean(y);
  const x1 = clean(x + w);
  const y1 = clean(y + h);
  return [
    { o: 'h', c: y0, a: x0, b: x1 },
    { o: 'h', c: y1, a: x0, b: x1 },
    { o: 'v', c: x0, a: y0, b: y1 },
    { o: 'v', c: x1, a: y0, b: y1 },
  ];
}

function subtractIntervals(intervals, cuts, eps = 1e-4) {
  let parts = intervals.map(([a, b]) => [clean(a), clean(b)]).filter(([a, b]) => b - a > eps);
  for (const [ca, cb] of cuts) {
    const lo = Math.min(ca, cb);
    const hi = Math.max(ca, cb);
    if (hi - lo <= eps) continue;
    const next = [];
    for (const [a, b] of parts) {
      if (hi <= a + eps || lo >= b - eps) {
        next.push([a, b]);
      } else {
        if (lo - a > eps) next.push([a, clean(lo)]);
        if (b - hi > eps) next.push([clean(hi), b]);
      }
    }
    parts = next;
  }
  return parts;
}

function mergeIntervals(intervals, eps = 1e-4) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const merged = [[clean(sorted[0][0]), clean(sorted[0][1])]];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = sorted[i];
    const last = merged[merged.length - 1];
    if (a <= last[1] + eps) {
      last[1] = clean(Math.max(last[1], b));
    } else {
      merged.push([clean(a), clean(b)]);
    }
  }
  return merged;
}

function addLineEntry(buckets, o, c, interval) {
  const cc = clean(c);
  for (const entry of buckets) {
    if (entry.o === o && near(entry.c, cc)) {
      entry.items.push(interval);
      return;
    }
  }
  buckets.push({ o, c: cc, items: [interval] });
}

function getLineItems(buckets, o, c) {
  const out = [];
  for (const entry of buckets) {
    if (entry.o === o && near(entry.c, c)) {
      out.push(...entry.items);
    }
  }
  return out;
}

function collectSameRoomSeams(rects) {
  const seams = [];
  if (rects.length <= 1) return seams;
  const edgesByRect = rects.map(rectEdges);
  for (let i = 0; i < edgesByRect.length; i++) {
    for (let j = i + 1; j < edgesByRect.length; j++) {
      for (const e1 of edgesByRect[i]) {
        for (const e2 of edgesByRect[j]) {
          if (e1.o !== e2.o || !near(e1.c, e2.c)) continue;
          const lo = Math.max(e1.a, e2.a);
          const hi = Math.min(e1.b, e2.b);
          if (hi - lo > 1e-4) {
            addLineEntry(seams, e1.o, e1.c, [clean(lo), clean(hi)]);
          }
        }
      }
    }
  }
  return seams;
}

function normalizeOpenEdges(openEdges = []) {
  const buckets = [];
  for (const oe of openEdges || []) {
    if (!oe) continue;
    let o = oe.o;
    let c = Number(oe.c);
    let a1 = Number(oe.a1);
    let a2 = Number(oe.a2);
    if ((!o || !Number.isFinite(c)) && Array.isArray(oe.line) && oe.line.length === 4) {
      const [x1, y1, x2, y2] = oe.line.map(Number);
      if (near(y1, y2)) {
        o = 'h';
        c = y1;
        a1 = x1;
        a2 = x2;
      } else if (near(x1, x2)) {
        o = 'v';
        c = x1;
        a1 = y1;
        a2 = y2;
      }
    }
    if ((o !== 'h' && o !== 'v') || ![c, a1, a2].every(Number.isFinite)) continue;
    const lo = clean(Math.min(a1, a2));
    const hi = clean(Math.max(a1, a2));
    if (hi - lo <= 1e-4) continue;
    addLineEntry(buckets, o, c, [lo, hi]);
  }
  return buckets;
}

/**
 * Compute all wall runs, furniture-blocking walls, opening segments,
 * shared room boundaries, terrace railings, and bounding box from rooms & openEdges.
 */
export function computePlanGeometry(rooms = [], openEdges = []) {
  const openBuckets = normalizeOpenEdges(openEdges);

  const indoorWallBuckets = [];
  const allWallBuckets = [];
  const indoorRawEdgeBuckets = [];
  const terraceRawEdgeBuckets = [];

  for (const room of rooms || []) {
    if (!room || room.kind === 'void') continue;
    const rects = getRoomRects(room);
    if (!rects.length) continue;

    const seams = collectSameRoomSeams(rects);
    const indoor = isIndoor(room);
    const terrace = room.kind === 'terrace';

    for (const rect of rects) {
      for (const e of rectEdges(rect)) {
        if (indoor) addLineEntry(indoorRawEdgeBuckets, e.o, e.c, [e.a, e.b]);
        if (terrace) addLineEntry(terraceRawEdgeBuckets, e.o, e.c, [e.a, e.b]);

        const cuts = [
          ...getLineItems(openBuckets, e.o, e.c),
          ...getLineItems(seams, e.o, e.c),
        ];
        const kept = subtractIntervals([[e.a, e.b]], cuts);
        for (const iv of kept) {
          addLineEntry(allWallBuckets, e.o, e.c, iv);
          if (indoor) addLineEntry(indoorWallBuckets, e.o, e.c, iv);
        }
      }
    }
  }

  // Merged indoor wall runs (used for 3D walls and SEGS)
  const indoorRuns = [];
  for (const bucket of indoorWallBuckets) {
    for (const [a, b] of mergeIntervals(bucket.items)) {
      indoorRuns.push({ o: bucket.o, c: bucket.c, a, b });
    }
  }
  indoorRuns.sort((u, v) => (u.o !== v.o ? (u.o < v.o ? -1 : 1) : u.c - v.c || u.a - v.a));

  // Merged WALLS (indoor + terrace minus openEdges and same-room seams)
  const WALLS = [];
  const wallCutters = [];
  for (const bucket of allWallBuckets) {
    for (const [a, b] of mergeIntervals(bucket.items)) {
      const seg = bucket.o === 'h' ? [a, bucket.c, b, bucket.c] : [bucket.c, a, bucket.c, b];
      WALLS.push(seg);
      wallCutters.push({ o: bucket.o, c: bucket.c, a, b });
    }
  }

  // SEGS: indoorRuns split at perpendicular wall intersections
  const SEGS = [];
  for (const r of indoorRuns) {
    const rawCuts = wallCutters
      .filter(
        q =>
          q.o !== r.o &&
          q.c > r.a + 1e-3 &&
          q.c < r.b - 1e-3 &&
          q.a <= r.c + 1e-3 &&
          q.b >= r.c - 1e-3,
      )
      .map(q => clean(q.c))
      .sort((p, q) => p - q);
    const cuts = [];
    for (const cut of rawCuts) {
      if (!cuts.length || cut - cuts[cuts.length - 1] > 1e-3) {
        cuts.push(cut);
      }
    }
    const pts = [r.a, ...cuts, r.b];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] - pts[i - 1] > 1e-4) {
        SEGS.push({ o: r.o, c: r.c, a: pts[i - 1], b: pts[i] });
      }
    }
  }

  // Railings: outer terrace edges NOT shared with any indoor room edge, openEdge, or adjacent terrace rect
  const railings = [];
  for (const tBucket of terraceRawEdgeBuckets) {
    const rawT = tBucket.items;
    const sharedTerraceSeams = [];
    for (let i = 0; i < rawT.length; i++) {
      for (let j = i + 1; j < rawT.length; j++) {
        const lo = Math.max(rawT[i][0], rawT[j][0]);
        const hi = Math.min(rawT[i][1], rawT[j][1]);
        if (hi - lo > 1e-4) sharedTerraceSeams.push([clean(lo), clean(hi)]);
      }
    }
    const cuts = [
      ...sharedTerraceSeams,
      ...getLineItems(indoorRawEdgeBuckets, tBucket.o, tBucket.c),
      ...getLineItems(openBuckets, tBucket.o, tBucket.c),
    ];
    const outer = subtractIntervals(mergeIntervals(rawT), cuts);
    for (const [a, b] of mergeIntervals(outer)) {
      railings.push(
        tBucket.o === 'h'
          ? [
              [a, tBucket.c],
              [b, tBucket.c],
            ]
          : [
              [tBucket.c, a],
              [tBucket.c, b],
            ],
      );
    }
  }

  // Shared edges between distinct indoor/terrace rooms
  const sharedEdges = [];
  const activeRooms = (rooms || []).filter(r => r && (isIndoor(r) || r.kind === 'terrace'));
  for (let i = 0; i < activeRooms.length; i++) {
    for (let j = i + 1; j < activeRooms.length; j++) {
      const r1 = activeRooms[i];
      const r2Room = activeRooms[j];
      if (!r1.id || !r2Room.id || r1.id === r2Room.id) continue;
      const in1 = isIndoor(r1);
      const in2 = isIndoor(r2Room);
      if (!in1 && !in2) continue; // skip terrace-terrace

      const roomA = r1.id < r2Room.id ? r1 : r2Room;
      const roomB = r1.id < r2Room.id ? r2Room : r1;
      const kind = in1 && in2 ? 'indoor-indoor' : 'indoor-terrace';

      const pairLineBuckets = [];
      const edgesA = getRoomRects(roomA).flatMap(rectEdges);
      const edgesB = getRoomRects(roomB).flatMap(rectEdges);
      for (const ea of edgesA) {
        for (const eb of edgesB) {
          if (ea.o !== eb.o || !near(ea.c, eb.c)) continue;
          const lo = Math.max(ea.a, eb.a);
          const hi = Math.min(ea.b, eb.b);
          if (hi - lo > 1e-4) {
            addLineEntry(pairLineBuckets, ea.o, ea.c, [clean(lo), clean(hi)]);
          }
        }
      }

      for (const bucket of pairLineBuckets) {
        for (const [a1, a2] of mergeIntervals(bucket.items)) {
          if (a2 - a1 <= 0.05) continue;
          const openOnLine = getLineItems(openBuckets, bucket.o, bucket.c);
          const mid = (a1 + a2) / 2;
          const isOpen = openOnLine.some(
            ([oa, ob]) =>
              (oa <= mid + 1e-3 && ob >= mid - 1e-3) ||
              Math.min(ob, a2) - Math.max(oa, a1) > 1e-3,
          );
          const key = `${bucket.o}:${bucket.c.toFixed(2)}:${a1.toFixed(2)}:${a2.toFixed(2)}`;
          sharedEdges.push({
            key,
            o: bucket.o,
            c: bucket.c,
            a1,
            a2,
            roomA,
            roomB,
            isOpen,
            kind,
          });
        }
      }
    }
  }

  // Bounds across ALL rooms (including void)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasRect = false;

  for (const room of rooms || []) {
    for (const [x, y, w, h] of getRoomRects(room)) {
      hasRect = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }

  const bounds = hasRect
    ? (() => {
        const x0 = clean(minX);
        const y0 = clean(minY);
        const x1 = clean(maxX);
        const y1 = clean(maxY);
        return {
          minX: x0,
          minY: y0,
          maxX: x1,
          maxY: y1,
          width: clean(x1 - x0),
          height: clean(y1 - y0),
          centerX: clean((x0 + x1) / 2),
          centerY: clean((y0 + y1) / 2),
        };
      })()
    : {
        minX: 0,
        minY: 0,
        maxX: 14,
        maxY: 11,
        width: 14,
        height: 11,
        centerX: 7,
        centerY: 5.5,
      };

  return { WALLS, indoorRuns, SEGS, sharedEdges, railings, bounds };
}
