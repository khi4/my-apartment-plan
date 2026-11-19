// Doors, sliding doors, and windows: default width and allowed range (meters)
export const OPK = {
  door: { w: 0.8, min: 0.5, max: 1.5 },
  sliding: { w: 1.8, min: 0.6, max: 4.0 },
  window: { w: 1.2, min: 0.3, max: 4.0 },
};

export const OP_KINDS = ['door', 'sliding', 'window'];

// 3D heights & wall thickness in meters (walls are 4 cm thick, centered on the 2D wall line)
export const H3 = {
  wall: 2.8,
  door: 2.1,
  sill: 0.9,
  head: 2.1,
  rail: 1.0,
  t: 0.04,
};
