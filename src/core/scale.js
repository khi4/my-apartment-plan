/**
 * Scale & numeric rounding helpers.
 * Plan data is stored in meters; SVG uses centimeters (1 m = 100 plan units).
 */

export const S = 100;

export const m = v => {
  const n = +(Number(v) * S).toFixed(2);
  return n === 0 ? 0 : n;
};

export const r2 = v => {
  const n = Math.round(Number(v) * 100) / 100;
  return n === 0 ? 0 : n;
};

export const fmt = n => {
  const s = Number(n).toFixed(2);
  return s === '-0.00' ? '0.00' : s;
};

export const snapTo = (v, st = 0.05) => r2(Math.round(v / st) * st);

export const step = e => (e && e.shiftKey ? 0.01 : 0.05);

export const clampSize = (v, min = 0.3, max = 8.0) => Math.min(max, Math.max(min, r2(v)));

export const clampRoomSize = (v, min = 0.4, max = 30.0) => Math.min(max, Math.max(min, r2(v)));
