/**
 * Door, sliding door, and window placement, snapping, swing validation, and SVG rendering.
 */

import { OPK } from '../data/openingSpecs.js';
import { FURNITURE_BY_TYPE } from '../data/furnitureCatalog.js';
import { near, insideIndoor, insideAny } from './walls.js';
import { S, m, r2, fmt, snapTo } from './scale.js';
import { furnToPlan, inPiece } from './clearance.js';

export const sameLine = (p, q) => p.o === q.o && Math.abs(p.c - q.c) < 1e-3;

export const alongOf = (o, x, y) => (o === 'h' ? x : y);

export const acrossOf = (o, x, y) => (o === 'h' ? y : x);

export const P = (o, along, across) => (o === 'h' ? [along, across] : [across, along]);

export const segOf = (op, segs = []) =>
  segs.find(g => sameLine(g, op) && op.a1 >= g.a - 1e-3 && op.a2 <= g.b + 1e-3) || null;

export const clashes = (cand, ops = [], selfId = null) =>
  ops.some(
    q =>
      q.id !== selfId &&
      sameLine(q, cand) &&
      q.a1 < cand.a2 - 1e-3 &&
      q.a2 > cand.a1 + 1e-3,
  );

export function snapOp(p, w, st, segs = [], ops = [], selfId = null, offA = 0, offO = null) {
  let best = null;
  for (const g of segs) {
    const al = alongOf(g.o, p.x, p.y) + (g.o === offO ? offA : 0);
    const d = Math.hypot(acrossOf(g.o, p.x, p.y) - g.c, Math.max(0, g.a - al, al - g.b));
    if (d <= 0.5 && (!best || d < best.d)) best = { g, d, al };
  }
  if (!best) return { ok: false, why: 'far' };
  const { g, al } = best;
  const across = acrossOf(g.o, p.x, p.y) - g.c;
  if (g.b - g.a < w - 1e-6) return { ok: false, why: 'short' };
  const a1 = r2(Math.min(g.b - w, Math.max(g.a, g.a + snapTo(al - w / 2 - g.a, st))));
  const cand = { o: g.o, c: g.c, a1, a2: r2(a1 + w), across };
  return clashes(cand, ops, selfId) ? { ...cand, ok: false, why: 'taken' } : { ...cand, ok: true };
}

export function freeSpot(p, w, segs = [], ops = []) {
  const candidates = segs
    .filter(g => g.b - g.a >= w - 1e-6)
    .map(g => {
      const al = alongOf(g.o, p.x, p.y);
      return {
        g,
        d: Math.hypot(acrossOf(g.o, p.x, p.y) - g.c, Math.max(0, g.a - al, al - g.b)),
        al,
      };
    })
    .sort((u, v) => u.d - v.d);

  for (const { g, al } of candidates) {
    const start = Math.min(g.b - w, Math.max(g.a, al - w / 2));
    const maxK = 2 * Math.ceil((g.b - g.a) / 0.05);
    for (let k = 0; k <= maxK; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
      const a1 = r2(start + off);
      if (a1 < g.a - 1e-6 || a1 + w > g.b + 1e-6) continue;
      const cand = { o: g.o, c: g.c, a1, a2: r2(a1 + w) };
      if (!clashes(cand, ops, null)) return cand;
    }
  }
  return null;
}

export function fixSide(op, rooms = [], pref = 1) {
  let side = pref || op.side || 1;
  const mid = (op.a1 + op.a2) / 2;
  const q = sd => P(op.o, mid, op.c + sd * 0.2);

  const inA = insideIndoor(rooms, ...q(side));
  const inB = insideIndoor(rooms, ...q(-side));
  if (!inA && inB) {
    side = -side;
  } else if (!inA && !inB) {
    if (!insideAny(rooms, ...q(side)) && insideAny(rooms, ...q(-side))) {
      side = -side;
    }
  }
  op.side = side;
  return side;
}

const lnS = (p1, p2, cls) =>
  `<line x1="${m(p1[0])}" y1="${m(p1[1])}" x2="${m(p2[0])}" y2="${m(p2[1])}" class="${cls}"/>`;

export function doorGeom(op) {
  const L = op.a2 - op.a1;
  const ha = op.hs ? op.a1 : op.a2;
  const oa = op.hs ? op.a2 : op.a1;
  const H = P(op.o, ha, op.c);
  const tip = P(op.o, ha, op.c + op.side * L);
  const J = P(op.o, oa, op.c);
  const v1 = [tip[0] - H[0], tip[1] - H[1]];
  const v2 = [J[0] - H[0], J[1] - H[1]];
  return { L, H, tip, J, sweep: v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0 };
}

export function opSvg(op, erase = true) {
  const { o, c, a1, a2 } = op;
  const L = a2 - a1;
  let s = erase ? lnS(P(o, a1, c), P(o, a2, c), 'erase') : '';
  if (op.kind === 'sliding') {
    s +=
      lnS(P(o, a1, c - 0.03), P(o, a1 + L * 0.58, c - 0.03), 'slide') +
      lnS(P(o, a2 - L * 0.58, c + 0.03), P(o, a2, c + 0.03), 'slide');
  } else if (op.kind === 'window') {
    s +=
      lnS(P(o, a1, c - 0.04), P(o, a2, c - 0.04), 'glass-line') +
      lnS(P(o, a1, c + 0.04), P(o, a2, c + 0.04), 'glass-line') +
      lnS(P(o, a1, c), P(o, a2, c), 'glass-mid') +
      lnS(P(o, a1, c - 0.04), P(o, a1, c + 0.04), 'glass-line') +
      lnS(P(o, a2, c - 0.04), P(o, a2, c + 0.04), 'glass-line');
  } else {
    const g = doorGeom(op);
    s +=
      lnS(g.H, g.tip, 'leaf') +
      `<path d="M${m(g.tip[0])},${m(g.tip[1])} A${m(g.L)},${m(g.L)} 0 0 ${g.sweep} ${m(g.J[0])},${m(g.J[1])}" class="swing"/>`;
  }
  return s;
}

export function thumbOp(kind, w) {
  const op = { kind, o: 'h', c: 0, a1: 0, a2: w, hs: true, side: 1 };
  const stub = 0.35;
  const h = kind === 'door' ? w : 0.12;
  const pad = 0.08;
  const vb = [m(-stub), m(-0.12 - pad), m(w + 2 * stub), m(h + 0.12 + 2 * pad)].join(' ');
  return `<svg viewBox="${vb}" aria-hidden="true">${lnS([-stub, 0], [0, 0], 'wall')}${lnS([w, 0], [w + stub, 0], 'wall')}${opSvg(op, false)}</svg>`;
}

export function swingBlocked(op, furniture = []) {
  if (!op || op.kind !== 'door') return false;
  const L = op.a2 - op.a1;
  const ha = op.hs ? op.a1 : op.a2;
  const dir = op.hs ? 1 : -1;
  const inWedge = (x, y) => {
    const u = (alongOf(op.o, x, y) - ha) * dir;
    const v = (acrossOf(op.o, x, y) - op.c) * op.side;
    return u > -1e-3 && v > 0.01 && u * u + v * v < L * L - 1e-4;
  };
  return (furniture || []).some(it => {
    if (FURNITURE_BY_TYPE[it.type]?.under) return false;
    const corners = [
      [0, 0],
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sy]) => furnToPlan(it, (sx * it.L) / 2, (sy * it.W) / 2));
    if (corners.some(p => inWedge(...p))) return true;
    for (let i = 1; i <= 6; i++) {
      for (let j = 0; j <= 8; j++) {
        const r = (L * i) / 6 - 0.005;
        const a = (Math.PI / 2) * (j / 8);
        const [x, y] = P(
          op.o,
          ha + dir * r * Math.cos(a),
          op.c + op.side * Math.max(0.011, r * Math.sin(a)),
        );
        if (inPiece(it, x, y)) return true;
      }
    }
    return false;
  });
}

export function validateOpWidthChange(op, newW, segs = [], ops = []) {
  const spec = OPK[op.kind];
  const w = spec ? Math.min(spec.max, Math.max(spec.min, r2(newW))) : r2(newW);
  const g = segOf(op, segs);
  const mid = (op.a1 + op.a2) / 2;
  if (g && g.b - g.a < w - 1e-6) return { ok: false, why: 'short' };
  let a1 = r2(mid - w / 2);
  if (g) a1 = r2(Math.min(g.b - w, Math.max(g.a, a1)));
  const a2 = r2(a1 + w);
  if (clashes({ ...op, a1, a2 }, ops, op.id)) return { ok: false, why: 'taken' };
  return { ok: true, a1, a2 };
}

export function validateOpKindChange(op, newKind, segs = [], ops = [], rooms = []) {
  const spec = OPK[newKind];
  if (!spec) return { ok: false, why: 'invalid' };
  const w = Math.min(spec.max, Math.max(spec.min, r2(op.a2 - op.a1)));
  const g = segOf(op, segs);
  const mid = (op.a1 + op.a2) / 2;
  if (g && g.b - g.a < w - 1e-6) return { ok: false, why: 'short' };
  let a1 = r2(mid - w / 2);
  if (g) a1 = r2(Math.min(g.b - w, Math.max(g.a, a1)));
  const a2 = r2(a1 + w);
  if (clashes({ ...op, a1, a2 }, ops, op.id)) return { ok: false, why: 'taken' };
  let side = op.side === -1 ? -1 : 1;
  if (newKind === 'door') {
    const cand = { ...op, kind: newKind, a1, a2, side };
    side = fixSide(cand, rooms, side);
  }
  return { ok: true, kind: newKind, a1, a2, side };
}

export function slideOp(op, delta, segs = [], ops = []) {
  const g = segOf(op, segs);
  const a1 = r2(op.a1 + delta);
  const a2 = r2(op.a2 + delta);
  if (g && (a1 < g.a - 1e-6 || a2 > g.b + 1e-6)) return { ok: false, why: 'end' };
  if (clashes({ ...op, a1, a2 }, ops, op.id)) return { ok: false, why: 'taken' };
  return { ok: true, a1, a2 };
}
