/**
 * Parametric 2D top-view SVG shapes for all 27 furniture types.
 * Centered on (0, 0) with length L along x and width W along y (1 m = 100 SVG units).
 */

import { S } from './scale.js';

export function shape(type, L, W) {
  const w = L * S;
  const h = W * S;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const n1 = v => (+v).toFixed(1);
  const R = (x, y, ww, hh, cls, rx = 0) =>
    `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(Math.max(0, ww))}" height="${n1(Math.max(0, hh))}" rx="${rx}" class="${cls}"/>`;
  const Ln = (xa, ya, xb, yb, cls) =>
    `<line x1="${n1(xa)}" y1="${n1(ya)}" x2="${n1(xb)}" y2="${n1(yb)}" class="${cls}"/>`;
  const E = (cx, cy, rx, ry, cls) =>
    `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(Math.max(0, rx))}" ry="${n1(Math.max(0, ry))}" class="${cls}"/>`;
  const front = () => Ln(x0, y0 + h - 2, x0 + w, y0 + h - 2, 'f-front');

  if (type === 'sbed') type = 'bed';
  if (type === 'armchair') type = 'sofa';

  let s = '';
  if (type === 'bed') {
    s += R(x0, y0, w, h, 'f-b', 3);
    const hb = Math.min(8, w * 0.06);
    s += R(x0, y0, hb, h, 'f-s');
    const n = h >= 120 ? 2 : 1;
    const pw = Math.min(34, w * 0.2);
    const g = 6;
    const ph = (h - 2 * g - (n - 1) * g) / n;
    for (let i = 0; i < n; i++) s += R(x0 + hb + 6, y0 + g + i * (ph + g), pw, ph, 'f-b', 6);
    const xb = x0 + hb + 6 + pw + 10;
    if (xb < x0 + w - 14) {
      s += R(xb, y0, x0 + w - xb, h, 'f-b');
      s += R(xb, y0, 12, h, 'f-s');
      s += Ln(x0 + w - 26, y0 + h, x0 + w, y0 + h - 26, 'f-l');
    }
  } else if (type === 'sofa') {
    const a = Math.min(18, w * 0.12);
    const b = Math.min(20, h * 0.25);
    s += R(x0, y0, w, h, 'f-b', 5);
    s += R(x0, y0, w, b, 'f-s', 4);
    s += R(x0, y0, a, h, 'f-s', 4) + R(x0 + w - a, y0, a, h, 'f-s', 4);
    const sw = w - 2 * a;
    const n = Math.max(1, Math.round(sw / 65));
    const cw = sw / n;
    for (let i = 0; i < n; i++) {
      s += R(x0 + a + i * cw + 1.5, y0 + b + 1.5, cw - 3, h - b - 4.5, 'f-b', 4);
    }
  } else if (type === 'lsofa') {
    const d = Math.min(95, h * 0.6, w * 0.5);
    const b = Math.min(20, d * 0.22);
    const a = Math.min(18, d * 0.2);
    const inner = d - b;
    s += `<path d="M${n1(x0)},${n1(y0)} H${n1(x0 + w)} V${n1(y0 + h)} H${n1(x0 + w - d)} V${n1(y0 + d)} H${n1(x0)} Z" class="f-b"/>`;
    s += R(x0, y0, w, b, 'f-s', 3);
    s += R(x0 + w - b, y0, b, h, 'f-s', 3);
    s += R(x0, y0, a, d, 'f-s', 3);
    s += R(x0 + w - d, y0 + h - a, d, a, 'f-s', 3);
    const cx0 = x0 + w - d;
    s += R(cx0 + 1.5, y0 + b + 1.5, inner - 3, inner - 3, 'f-b', 4);
    const tl = cx0 - (x0 + a);
    if (tl > 6) {
      const n = Math.max(1, Math.round(tl / 65));
      const tw = tl / n;
      for (let i = 0; i < n; i++) s += R(x0 + a + i * tw + 1.5, y0 + b + 1.5, tw - 3, inner - 3, 'f-b', 4);
    }
    const rlen = y0 + h - a - (y0 + d);
    if (rlen > 6) {
      const n = Math.max(1, Math.round(rlen / 65));
      const rw = rlen / n;
      for (let i = 0; i < n; i++) s += R(cx0 + 1.5, y0 + d + i * rw + 1.5, inner - 3, rw - 3, 'f-b', 4);
    }
  } else if (type === 'chair') {
    const b = Math.max(6, h * 0.16);
    s += R(x0 + 2, y0 + b * 0.6, w - 4, h - b * 0.6, 'f-b', 6);
    s += R(x0, y0, w, b, 'f-s', 4);
  } else if (type === 'wardrobe') {
    s += R(x0, y0, w, h, 'f-b');
    const ry = y0 + h * 0.45;
    const reach = h * 0.28;
    s += Ln(x0 + 5, ry, x0 + w - 5, ry, 'f-l');
    for (let x = x0 + 12; x <= x0 + w - 12; x += 9) s += Ln(x, ry - reach, x, ry + reach, 'f-l');
    s += Ln(x0, y0 + h - 2, x0 + w, y0 + h - 2, 'f-front');
    const n = Math.max(1, Math.round(w / 50));
    for (let i = 1; i < n; i++) s += Ln(x0 + (i * w) / n, y0 + h - 12, x0 + (i * w) / n, y0 + h, 'f-l');
  } else if (type === 'table') {
    s += R(x0, y0, w, h, 'f-b', 4);
    s += R(x0 + 6, y0 + 6, w - 12, h - 12, 'f-l', 2);
  } else if (type === 'nightstand') {
    s += R(x0, y0, w, h, 'f-b', 2) + front();
    s += Ln(-w * 0.15, y0 + h - 9, w * 0.15, y0 + h - 9, 'f-l');
  } else if (type === 'dresser' || type === 'sideboard') {
    s += R(x0, y0, w, h, 'f-b', 2) + front();
    const n = Math.max(1, Math.round(w / (type === 'dresser' ? 45 : 50)));
    for (let i = 1; i < n; i++) s += Ln(x0 + (i * w) / n, y0 + h * 0.35, x0 + (i * w) / n, y0 + h, 'f-l');
    for (let i = 0; i < n; i++) {
      const cx = x0 + ((i + 0.5) * w) / n;
      s += Ln(cx - 6, y0 + h - 9, cx + 6, y0 + h - 9, 'f-l');
    }
  } else if (type === 'vanity') {
    s += R(x0, y0, w, h, 'f-b', 3) + front();
    s += E(0, y0 + 7, w * 0.32, 4, 'f-s');
  } else if (type === 'coffee') {
    s += R(x0, y0, w, h, 'f-b', 8);
    s += R(x0 + 7, y0 + 7, w - 14, h - 14, 'f-l', 5);
  } else if (type === 'tv') {
    s += R(x0, y0, w, h, 'f-b', 2) + front();
    s += R(-w * 0.36, y0 + 4, w * 0.72, Math.min(6, h * 0.2), 'f-s', 1);
  } else if (type === 'rug') {
    s += R(x0, y0, w, h, 'f-rug', 2);
    s += R(x0 + 10, y0 + 10, w - 20, h - 20, 'f-l', 2);
    for (let y = y0 + 6; y <= y0 + h - 6; y += 8) {
      s += Ln(x0 - 6, y, x0, y, 'f-l') + Ln(x0 + w, y, x0 + w + 6, y, 'f-l');
    }
  } else if (type === 'bookcase') {
    s += R(x0, y0, w, h, 'f-b', 1) + front();
    const n = Math.max(1, Math.round(w / 40));
    for (let i = 1; i < n; i++) s += Ln(x0 + (i * w) / n, y0, x0 + (i * w) / n, y0 + h, 'f-l');
  } else if (type === 'dining') {
    const c = Math.min(45, h * 0.28);
    const tuck = Math.min(10, c * 0.25);
    const back = Math.max(5, c * 0.18);
    const n = Math.max(1, Math.floor(w / 60));
    const slot = w / n;
    const cw = Math.min(45, slot - 10);
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * slot;
      s += R(cx - cw / 2, y0, cw, c, 'f-b', 5) + R(cx - cw / 2, y0, cw, back, 'f-s', 3);
      s += R(cx - cw / 2, y0 + h - c, cw, c, 'f-b', 5) + R(cx - cw / 2, y0 + h - back, cw, back, 'f-s', 3);
    }
    const td = h - 2 * (c - tuck);
    s += R(x0, y0 + c - tuck, w, td, 'f-b', 3);
    s += R(x0 + 6, y0 + c - tuck + 6, w - 12, td - 12, 'f-l', 2);
  } else if (type === 'rtable') {
    s += E(0, 0, w / 2, h / 2, 'f-b') + E(0, 0, w / 2 - 7, h / 2 - 7, 'f-l');
  } else if (type === 'counter') {
    s += R(x0, y0, w, h, 'f-b', 1) + front();
    const sw = Math.min(60, w * 0.3);
    const sx = x0 + w * 0.25 - sw / 2;
    s += R(sx, y0 + 8, sw, h - 22, 'f-l', 6) + E(sx + sw / 2, y0 + 8 + (h - 22) / 2, 2.5, 2.5, 'f-l');
    if (w >= 150) {
      const hx = x0 + w * 0.72;
      const r = Math.min(9, h * 0.13);
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(([a, b]) => {
        s += E(hx + a * 15, b * 13 - 4, r, r, 'f-l');
      });
    }
  } else if (type === 'fridge') {
    s += R(x0, y0, w, h, 'f-b', 2) + front();
    s += Ln(x0 + 6, y0 + 6, x0 + w - 6, y0 + h - 8, 'f-l') + Ln(x0 + w - 6, y0 + 6, x0 + 6, y0 + h - 8, 'f-l');
  } else if (type === 'washer') {
    const r = Math.min(w, h) * 0.32;
    s += R(x0, y0, w, h, 'f-b', 3) + front();
    s += E(0, 2, r, r, 'f-l') + E(0, 2, r * 0.6, r * 0.6, 'f-l');
  } else if (type === 'shower') {
    s += R(x0, y0, w, h, 'f-b', 2);
    s += Ln(x0 + 4, y0 + 4, x0 + w - 4, y0 + h - 4, 'f-l') + Ln(x0 + w - 4, y0 + 4, x0 + 4, y0 + h - 4, 'f-l');
    s += E(0, 0, 3, 3, 'f-s');
  } else if (type === 'bathtub') {
    s += R(x0, y0, w, h, 'f-b', 6);
    s += R(x0 + 7, y0 + 7, w - 14, h - 14, 'f-l', Math.max(0, Math.min(25, (h - 14) / 2)));
    s += E(x0 + w - 18, 0, 2.5, 2.5, 'f-l');
  } else if (type === 'toilet') {
    const tk = h * 0.24;
    const bh = (h - tk) / 2;
    s += R(x0 + w * 0.05, y0, w * 0.9, tk, 'f-s', 2);
    s += E(0, y0 + tk + bh, w * 0.42, bh - 1, 'f-b');
    s += E(0, y0 + tk + bh + 2, w * 0.28, bh - 10, 'f-l');
  } else if (type === 'basin') {
    s += R(x0, y0, w, h, 'f-b', 3);
    s += E(0, 3, w * 0.34, h * 0.3, 'f-l') + E(0, y0 + 6, 2, 2, 'f-s');
  } else if (type === 'desk') {
    s += R(x0, y0, w, h, 'f-b', 2);
    s += Ln(x0 + w * 0.68, y0, x0 + w * 0.68, y0 + h, 'f-l');
    for (let i = 1; i < 3; i++) s += Ln(x0 + w * 0.68, y0 + (h * i) / 3, x0 + w, y0 + (h * i) / 3, 'f-l');
  } else if (type === 'plant') {
    s += E(0, 0, w / 2, h / 2, 'f-b');
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.3;
      s += Ln(0, 0, Math.cos(a) * w * 0.4, Math.sin(a) * h * 0.4, 'f-l');
    }
    s += E(0, 0, w * 0.12, h * 0.12, 'f-s');
  }
  return s;
}

export function thumbSvg(type, L, W) {
  const w = L * S;
  const h = W * S;
  const p = Math.max(w, h) * 0.06;
  return `<svg viewBox="${-w / 2 - p} ${-h / 2 - p} ${w + 2 * p} ${h + 2 * p}" aria-hidden="true">${shape(type, L, W)}</svg>`;
}
