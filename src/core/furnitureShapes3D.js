/**
 * Parametric 3D extrusion parts for all 27 furniture types,
 * in the piece's own frame (meters, centered at (0, 0), length along x, width along y).
 */

const BLOCK_HEIGHTS = {
  wardrobe: 2.0,
  nightstand: 0.55,
  dresser: 0.85,
  vanity: 0.78,
  tv: 0.5,
  bookcase: 1.9,
  sideboard: 0.85,
  counter: 0.9,
  fridge: 1.8,
  washer: 0.85,
  shower: 0.05,
  bathtub: 0.55,
  toilet: 0.75,
  basin: 0.85,
  rug: 0.01,
};

export function furnParts(it) {
  const L = it.L;
  const W = it.W;
  const x0 = -L / 2;
  const y0 = -W / 2;

  const R = (x, y, w, h, z0, z1) => ({
    pts: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    z0,
    z1,
  });

  const RND = (h, z0 = 0) => ({
    pts: Array.from({ length: 32 }, (_, i) => [
      (L / 2) * Math.cos((i * Math.PI) / 16),
      (W / 2) * Math.sin((i * Math.PI) / 16),
    ]),
    z0,
    z1: h,
  });

  const TBL = h => {
    const g = 0.05;
    const i = 0.04;
    const legs = [
      [x0 + i, y0 + i],
      [x0 + L - i - g, y0 + i],
      [x0 + i, y0 + W - i - g],
      [x0 + L - i - g, y0 + W - i - g],
    ];
    return [R(x0, y0, L, W, h - 0.04, h), ...legs.map(([x, y]) => R(x, y, g, g, 0, h - 0.04))];
  };

  if (it.type === 'bed' || it.type === 'sbed') {
    const hb = Math.min(0.08, L * 0.06);
    return [R(x0 + hb, y0, L - hb, W, 0, 0.5), R(x0, y0, hb, W, 0, 0.95)];
  }
  if (BLOCK_HEIGHTS[it.type]) {
    return [R(x0, y0, L, W, 0, BLOCK_HEIGHTS[it.type])];
  }

  const shrink = (p, k) => ({ ...p, pts: p.pts.map(([x, y]) => [x * k, y * k]) });
  if (it.type === 'rtable') return [RND(0.75, 0.71), shrink(RND(0.71), 0.12)];
  if (it.type === 'plant') return [shrink(RND(0.4), 0.6), RND(1.1, 0.4)];
  if (it.type === 'coffee') return TBL(0.42);
  if (it.type === 'desk' || it.type === 'dining' || it.type === 'table') return TBL(0.75);

  if (it.type === 'sofa' || it.type === 'armchair') {
    const a = Math.min(0.18, L * 0.12);
    const b = Math.min(0.2, W * 0.25);
    return [
      R(x0 + a, y0 + b, L - 2 * a, W - b, 0, 0.42),
      R(x0, y0, L, b, 0, 0.85),
      R(x0, y0 + b, a, W - b, 0, 0.62),
      R(x0 + L - a, y0 + b, a, W - b, 0, 0.62),
    ];
  }

  if (it.type === 'lsofa') {
    const d = Math.min(0.95, W * 0.6, L * 0.5);
    const b = Math.min(0.2, d * 0.22);
    const a = Math.min(0.18, d * 0.2);
    return [
      {
        pts: [
          [x0 + a, y0 + b],
          [x0 + L - b, y0 + b],
          [x0 + L - b, y0 + W - a],
          [x0 + L - d, y0 + W - a],
          [x0 + L - d, y0 + d],
          [x0 + a, y0 + d],
        ],
        z0: 0,
        z1: 0.42,
      },
      R(x0, y0, L, b, 0, 0.85),
      R(x0 + L - b, y0 + b, b, W - b, 0, 0.85),
      R(x0, y0 + b, a, d - b, 0, 0.62),
      R(x0 + L - d, y0 + W - a, d - b, a, 0, 0.62),
    ];
  }

  if (it.type === 'chair') {
    const b = Math.max(0.06, W * 0.16);
    return [R(x0, y0 + b, L, W - b, 0, 0.45), R(x0, y0, L, b, 0, 0.9)];
  }

  return [R(x0, y0, L, W, 0, 0.5)];
}
