/**
 * Three.js 3D furniture mesh builder.
 * Supports crisp extruded Blueprint mode and detailed multi-part,
 * multi-material PBR Realistic mode for all 27 furniture types.
 */

import { furnParts } from '../core/furnitureShapes3D.js';
import { furnToPlan } from '../core/clearance.js';
import { resolveFurnitureStyle } from '../data/materialPresets.js';
import { getPBRMaterial } from './textureGenerator.js';

const ACCENT_TEXTURE_BY_TYPE = {
  bed: 'fabric-linen',
  sbed: 'fabric-linen',
  nightstand: 'oak-wood',
  wardrobe: 'oak-wood',
  dresser: 'walnut-wood',
  vanity: 'oak-wood',
  sofa: 'velvet',
  lsofa: 'fabric-linen',
  armchair: 'fabric-linen',
  coffee: 'fabric-linen',
  tv: 'matte-metal',
  rug: 'fabric-linen',
  bookcase: 'walnut-wood',
  dining: 'velvet',
  rtable: 'walnut-wood',
  chair: 'oak-wood',
  sideboard: 'oak-wood',
  counter: 'marble',
  fridge: 'matte-metal',
  washer: 'matte-metal',
  shower: 'metal-brushed',
  bathtub: 'metal-brushed',
  toilet: 'painted-wood',
  basin: 'metal-brushed',
  desk: 'matte-metal',
  table: 'oak-wood',
  plant: 'fabric-linen',
};

const BOOK_PALETTE = ['#8c4a27', '#2d4a5c', '#c5b295', '#5e6e58'];
const FLOOR_CONTACT_Y = 0.0042;
const RUG_CONTACT_Y = 0.0212;

/**
 * Disposes geometries and realistic owned materials inside `furnGroup` without
 * touching shared scene materials (`M`) or shared `texManager` base textures.
 */
function clearFurnitureGroup(furnGroup) {
  const geometries = new Set();
  const ownedMaterials = new Set();

  furnGroup.traverse(obj => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat?.userData?.furnOwned) ownedMaterials.add(mat);
      }
    }
  });

  for (const geo of geometries) geo.dispose();
  for (const mat of ownedMaterials) {
    if (mat?.userData?.ownedMap) {
      mat.userData.ownedMap.dispose?.();
      mat.userData.ownedMap = null;
    }
    mat.dispose();
  }
  furnGroup.clear();
}

function createContactShadowTexture(THREE) {
  const size = 64;
  const data = new Uint8Array(size * size * 4).fill(255);
  for (let py = 0; py < size; py++) {
    const y = Math.abs((py + 0.5) / (size / 2) - 1) - 0.45;
    for (let px = 0; px < size; px++) {
      const x = Math.abs((px + 0.5) / (size / 2) - 1) - 0.45;
      const distance = Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0);
      const falloff = 1 - Math.min(1, Math.max(0, (distance + 0.12) / 0.64));
      data[(py * size + px) * 4 + 3] = Math.round(255 * falloff * falloff * (3 - 2 * falloff));
    }
  }

  const tex = new THREE.DataTexture(data, size, size);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates shared detail PBR materials reused across realistic items in a build pass.
 */
function createDetailMaterials(THREE, M, texManager) {
  const own = mat => {
    mat.userData = mat.userData || {};
    mat.userData.furnOwned = true;
    if (typeof mat.envMapIntensity === 'number') {
      mat.userData.baseEnvMapIntensity = mat.envMapIntensity;
    }
    return mat;
  };

  const GlassMaterial = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

  return {
    cotton: own(
      getPBRMaterial(THREE, texManager, {
        category: 'furniture',
        textureId: 'fabric-linen',
        color: '#f4f0e8',
        widthMeters: 1.2,
        heightMeters: 1.2,
      }),
    ),
    porcelain: own(new THREE.MeshStandardMaterial({ color: '#f5f5f3', roughness: 0.12, metalness: 0.02, envMapIntensity: 1.15 })),
    chrome: own(new THREE.MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.14, metalness: 0.94, envMapIntensity: 1.45 })),
    sinkSteel: own(new THREE.MeshStandardMaterial({ color: '#848b94', roughness: 0.28, metalness: 0.85, envMapIntensity: 1.2 })),
    charcoal: own(new THREE.MeshStandardMaterial({ color: '#22252a', roughness: 0.42, metalness: 0.28, envMapIntensity: 0.7 })),
    screen: own(new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.10, metalness: 0.35, envMapIntensity: 1.2 })),
    darkWood: own(
      getPBRMaterial(THREE, texManager, {
        category: 'furniture',
        textureId: 'walnut-wood',
        color: '#533b28',
        widthMeters: 0.9,
        heightMeters: 0.9,
      }),
    ),
    glass: own(
      new GlassMaterial({
        color: '#d4e8f2',
        roughness: 0.06,
        metalness: 0.04,
        reflectivity: 0.92,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 1.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
    mirror: own(new THREE.MeshStandardMaterial({ color: '#d8e3e9', roughness: 0.04, metalness: 0.96, envMapIntensity: 1.45 })),
    soil: own(new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.94, metalness: 0.0, envMapIntensity: 0.15 })),
    foliage: own(
      getPBRMaterial(THREE, texManager, {
        category: 'furniture',
        textureId: 'stucco-stone',
        color: '#3b6a46',
        widthMeters: 0.45,
        heightMeters: 0.45,
      }),
    ),
    lampShade: own(
      new THREE.MeshStandardMaterial({
        color: '#f6ebd8',
        roughness: 0.84,
        metalness: 0.0,
        emissive: '#ffcf88',
        emissiveIntensity: 0.22,
        envMapIntensity: 0.3,
      }),
    ),
    books: BOOK_PALETTE.map(color =>
      own(new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.02, envMapIntensity: 0.4 })),
    ),
    selEdge:
      M?.selEdge ||
      own(new THREE.LineBasicMaterial({ color: '#111111' })),
  };
}

function createContactShadowMaterial(THREE) {
  const map = createContactShadowTexture(THREE);
  const material = new THREE.MeshBasicMaterial({
    color: '#251d17',
    map,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    toneMapped: false,
  });
  material.userData.furnOwned = true;
  material.userData.ownedMap = map;
  material.addEventListener('dispose', () => {
    material.userData.ownedMap?.dispose();
    material.userData.ownedMap = null;
  });
  return material;
}

function addContactShadow(THREE, itemGroup, material, it, rugs, w, d, lx, lz, opacity) {
  const corners = [
    [lx - w / 2, lz - d / 2], [lx + w / 2, lz - d / 2],
    [lx - w / 2, lz + d / 2], [lx + w / 2, lz + d / 2],
  ].map(([x, z]) => furnToPlan(it, x, z));
  const onRug = rugs.some(({ x, z, cos, sin, halfL, halfW }) =>
    corners.every(([px, pz]) =>
      Math.abs((px - x) * cos + (pz - z) * sin) <= halfL &&
      Math.abs((pz - z) * cos - (px - x) * sin) <= halfW,
    ),
  );

  const geometry = new THREE.PlaneGeometry(w, d);
  geometry.rotateX(-Math.PI / 2);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([
    1, 1, 1, opacity, 1, 1, 1, opacity, 1, 1, 1, opacity, 1, 1, 1, opacity,
  ], 4));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(it.flip ? -lx : lx, onRug ? RUG_CONTACT_Y : FLOOR_CONTACT_Y, lz);
  mesh.raycast = () => {};
  itemGroup.add(mesh);
}

function softenDetailNormals(mat, textureId) {
  const textile = ['fabric-linen', 'velvet', 'leather'].includes(textureId);
  mat.normalScale.multiplyScalar(textile ? 0.75 : 0.62);
}

/**
 * Resolves primary, accent, and custom foliage materials for a single furniture piece.
 */
function createItemMaterials(THREE, texManager, it, shared) {
  const style = resolveFurnitureStyle(it);
  const wM = Math.max(0.6, it.L || 1);
  const hM = Math.max(0.6, it.W || 1);

  const primaryTexture =
    it.type === 'plant' && !it.texture ? 'plaster' : style.texture;
  const primaryMat = getPBRMaterial(THREE, texManager, {
    category: 'furniture',
    textureId: primaryTexture,
    color: style.color,
    widthMeters: wM,
    heightMeters: hM,
    ...(it.type === 'plant' && !it.texture ? { roughnessOverride: 0.78, metalnessOverride: 0 } : {}),
  });
  primaryMat.userData = primaryMat.userData || {};
  primaryMat.userData.furnOwned = true;
  const usesRoundedSurfaces = ['sofa', 'lsofa', 'armchair', 'coffee', 'rug'].includes(it.type);
  if (usesRoundedSurfaces) softenDetailNormals(primaryMat, primaryTexture);

  let accentMat;
  if (it.type === 'plant') {
    if (style.accentColor.toLowerCase() === '#3e6b48') {
      accentMat = shared.foliage;
    } else {
      accentMat = new THREE.MeshStandardMaterial({
        color: style.accentColor,
        roughness: 0.72,
        metalness: 0.0,
        envMapIntensity: 0.3,
      });
      accentMat.userData = accentMat.userData || {};
      accentMat.userData.furnOwned = true;
      accentMat.userData.baseEnvMapIntensity = 0.3;
    }
  } else {
    const accentTex = ACCENT_TEXTURE_BY_TYPE[it.type] || style.texture;
    accentMat = getPBRMaterial(THREE, texManager, {
      category: 'furniture',
      textureId: accentTex,
      color: style.accentColor,
      widthMeters: wM,
      heightMeters: hM,
    });
    accentMat.userData = accentMat.userData || {};
    accentMat.userData.furnOwned = true;
    if (usesRoundedSurfaces) softenDetailNormals(accentMat, accentTex);
  }

  return { primaryMat, accentMat };
}

/**
 * Remaps ExtrudeGeometry UVs into normalized [0..1] box-planar coordinates
 * matching BoxGeometry so world-scaled PBR textures never stretch across bevels.
 */
function normalizeBoxPlanarUVs(geo, THREE) {
  if (!geo?.getAttribute) return geo;
  const pos = geo.getAttribute('position');
  if (!pos) return geo;

  let norm = geo.getAttribute('normal');
  if (!norm) {
    geo.computeVertexNormals?.();
    norm = geo.getAttribute('normal');
  }

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;

  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);

  let uv = geo.getAttribute('uv');
  if (!uv && THREE?.BufferAttribute) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    geo.setAttribute('uv', uv);
  }
  if (!uv) return geo;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm ? Math.abs(norm.getX(i)) : 0;
    const ny = norm ? Math.abs(norm.getY(i)) : 1;
    const nz = norm ? Math.abs(norm.getZ(i)) : 0;

    let u;
    let v;
    if (ny >= 0.5) {
      u = (x - bb.min.x) / spanX;
      v = (z - bb.min.z) / spanZ;
    } else if (nx > nz) {
      u = (z - bb.min.z) / spanZ;
      v = (y - bb.min.y) / spanY;
    } else {
      u = (x - bb.min.x) / spanX;
      v = (y - bb.min.y) / spanY;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geo;
}

function roundedBoxGeometry(THREE, w, h, d, radius, crownY, crownZ, textureW, textureH) {
  const segments = crownY || crownZ ? 10 : 6;
  const cornerStart = segments === 10 ? 0.6 : 1 / 3;
  const geo = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const pos = geo.getAttribute('position');
  const normals = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const r = Math.min(radius, w * 0.49, h * 0.49, d * 0.49);
  const direction = new THREE.Vector3();
  const cornerAxis = value => Math.sign(value) * Math.max(0, Math.abs(value) - cornerStart);
  const straightAxis = value => Math.max(-1, Math.min(1, value / cornerStart));

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const faceX = normals.getX(i);
    const faceY = normals.getY(i);
    const faceZ = normals.getZ(i);
    direction.set(cornerAxis(px), cornerAxis(py), cornerAxis(pz)).normalize();
    const x = (w / 2 - r) * straightAxis(px) + r * direction.x;
    const baseY = (h / 2 - r) * straightAxis(py) + r * direction.y;
    const baseZ = (d / 2 - r) * straightAxis(pz) + r * direction.z;
    const tx = (2 * x) / w;
    const ty = (2 * baseY) / h;
    const tz = (2 * baseZ) / d;
    const fx = 1 - tx * tx;
    const fy = 1 - ty * ty;
    const fz = 1 - tz * tz;
    const bulgeY = crownY * direction.y;
    const bulgeZ = crownZ * direction.z;
    const y = baseY + bulgeY * fx * fz;
    const z = baseZ + bulgeZ * fx * fy;
    const slopeY = bulgeY * direction.y * 4;
    const slopeZ = bulgeZ * direction.z * 4;
    direction.x += ((slopeY * fz + slopeZ * fy) * tx) / w;
    direction.y += (slopeZ * ty * fx) / h;
    direction.z += (slopeY * tz * fx) / d;
    direction.normalize();
    pos.setXYZ(i, x, y, z);
    normals.setXYZ(i, direction.x, direction.y, direction.z);

    // Project the existing face axes in meters so parts keep their textile and grain scale.
    if (faceX) uv.setXY(i, (d / 2 - faceX * z) / textureW, (h / 2 + y) / textureH);
    else if (faceY) uv.setXY(i, (w / 2 + x) / textureW, (d / 2 - faceY * z) / textureH);
    else uv.setXY(i, (w / 2 + faceZ * x) / textureW, (h / 2 + y) / textureH);
  }

  return geo;
}

/**
 * Creates local-space geometry builders for one furniture item, applying `it.flip`
 * via coordinate mirroring (`lx -> -lx`) rather than negative group scaling.
 */
function createItemContext({ THREE, it, itemGroup, primaryMat, accentMat, shared, contact }) {
  const L = Math.max(0.1, Number(it.L) || 0.5);
  const W = Math.max(0.1, Number(it.W) || 0.5);
  const flip = Boolean(it.flip);
  let maxH = 0.05;

  const trackH = yTop => {
    if (yTop > maxH) maxH = yTop;
  };

  const registerMesh = (mesh, cast, receive) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.userData.id = it.id;
    itemGroup.add(mesh);
    return mesh;
  };

  const addBox = (w, h, d, lx, yBottom, lz, mat, cast = true, receive = true, rotX = 0, rotY = 0, rotZ = 0) => {
    if (w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return null;
    const fx = flip ? -lx : lx;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, yBottom + h / 2, lz);
    if (rotX || rotY || rotZ) {
      mesh.rotation.set(rotX, flip ? -rotY : rotY, flip ? -rotZ : rotZ);
    }
    trackH(yBottom + h);
    return registerMesh(mesh, cast, receive);
  };

  const addCyl = (
    rTop,
    rBot,
    h,
    lx,
    yBottom,
    lz,
    mat,
    segs = 20,
    rotX = 0,
    rotZ = 0,
    scaleX = 1,
    scaleZ = 1,
    cast = true,
    receive = true,
  ) => {
    if (h <= 1e-4 || (rTop <= 1e-4 && rBot <= 1e-4)) return null;
    const fx = flip ? -lx : lx;
    const geo = new THREE.CylinderGeometry(
      Math.max(0.001, rTop),
      Math.max(0.001, rBot),
      h,
      segs,
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, yBottom + h / 2, lz);
    if (rotX || rotZ) {
      mesh.rotation.set(rotX, 0, flip ? -rotZ : rotZ);
    }
    if (scaleX !== 1 || scaleZ !== 1) {
      mesh.scale.set(Math.max(0.01, scaleX), 1, Math.max(0.01, scaleZ));
    }
    const maxR = Math.max(rTop * scaleX, rBot * scaleX, rTop * scaleZ, rBot * scaleZ);
    trackH(rotX || rotZ ? yBottom + h / 2 + maxR : yBottom + h);
    return registerMesh(mesh, cast, receive);
  };

  const addExtruded = (pts2d, yBottom, yTop, mat, cast = true, receive = true, holes = []) => {
    if (!pts2d || pts2d.length < 3 || yTop - yBottom <= 1e-4) return null;
    const mapped = pts2d.map(([lx, lz]) => new THREE.Vector2(flip ? -lx : lx, lz));
    const ordered = THREE.ShapeUtils.isClockWise(mapped) ? mapped.reverse() : mapped;
    const shape = new THREE.Shape(ordered);
    for (const points of holes) {
      shape.holes.push(new THREE.Path(points.map(([x, z]) => new THREE.Vector2(flip ? -x : x, z))));
    }
    const depth = Math.max(0.002, yTop - yBottom);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, yTop, 0);
    normalizeBoxPlanarUVs(geo, THREE);
    const mesh = new THREE.Mesh(geo, mat);
    trackH(yTop);
    return registerMesh(mesh, cast, receive);
  };

  const addRoundedBox = (w, h, d, lx, yBottom, lz, mat, options = {}) => {
    const { radius = 0.012, pitch = 0, yaw = 0, roll = 0, cast = true, crownY = 0, crownZ = 0 } = options;
    const geometry = roundedBoxGeometry(THREE, w, h, d, radius, crownY, crownZ, Math.max(0.6, L), Math.max(0.6, W));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(flip ? -lx : lx, yBottom + h / 2, lz);
    mesh.rotation.set(pitch, flip ? -yaw : yaw, flip ? -roll : roll);
    if (pitch || yaw || roll) {
      geometry.computeBoundingBox();
      mesh.updateMatrix();
      trackH(geometry.boundingBox.clone().applyMatrix4(mesh.matrix).max.y);
    } else {
      trackH(yBottom + h + crownY);
    }
    return registerMesh(mesh, cast, true);
  };

  let weltMaterial;
  const addSeatCushion = (w, h, d, lx, yBottom, lz) => {
    const radius = Math.min(0.046, w * 0.25, d * 0.25);
    addRoundedBox(w, h, d, lx, yBottom, lz, primaryMat, { radius, crownY: 0.012 });
    if (w < 0.12 || d < 0.12) return;

    weltMaterial ??= new THREE.MeshStandardMaterial({
      color: primaryMat.color.clone().multiplyScalar(0.71),
      roughness: 0.9,
      envMapIntensity: 0.28,
    });
    weltMaterial.userData.furnOwned = true;
    weltMaterial.userData.baseEnvMapIntensity = 0.28;
    const x = w / 2 - 0.0006;
    const z = d / 2 - 0.0006;
    const y = yBottom + h * 0.69;
    const point = (px, pz) => new THREE.Vector3(px, y, pz);
    const path = new THREE.CurvePath();
    let current = point(-x + radius, -z);
    const lineTo = next => {
      path.add(new THREE.LineCurve3(current, next));
      current = next;
    };
    const curveTo = (control, next) => {
      path.add(new THREE.QuadraticBezierCurve3(current, control, next));
      current = next;
    };
    lineTo(point(x - radius, -z));
    curveTo(point(x, -z), point(x, -z + radius));
    lineTo(point(x, z - radius));
    curveTo(point(x, z), point(x - radius, z));
    lineTo(point(-x + radius, z));
    curveTo(point(-x, z), point(-x, z - radius));
    lineTo(point(-x, -z + radius));
    curveTo(point(-x, -z), point(-x + radius, -z));
    const welt = new THREE.Mesh(new THREE.TubeGeometry(path, 72, 0.0019, 5, true), weltMaterial);
    welt.position.set(flip ? -lx : lx, 0, lz);
    registerMesh(welt, false, true);
  };

  const addSoftBox = (w, h, d, lx, yBottom, lz, mat, bevel = 0.016, rotX = 0, rotY = 0, rotZ = 0) => {
    const b = Math.min(bevel, w * 0.22, h * 0.22, d * 0.22);
    if (b < 0.004) return addBox(w, h, d, lx, yBottom, lz, mat, true, true, rotX, rotY, rotZ);

    const iw = w - 2 * b;
    const id = d - 2 * b;
    const ih = h - 2 * b;
    const cr = Math.min(b * 1.4, iw * 0.35, id * 0.35);
    const hw = iw / 2;
    const hd = id / 2;

    const shape = new THREE.Shape();
    shape.moveTo(-hw + cr, -hd);
    shape.lineTo(hw - cr, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + cr);
    shape.lineTo(hw, hd - cr);
    shape.quadraticCurveTo(hw, hd, hw - cr, hd);
    shape.lineTo(-hw + cr, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - cr);
    shape.lineTo(-hw, -hd + cr);
    shape.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: ih,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, ih / 2, 0);
    normalizeBoxPlanarUVs(geo, THREE);

    const fx = flip ? -lx : lx;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, yBottom + h / 2, lz);
    if (rotX || rotY || rotZ) {
      mesh.rotation.set(rotX, flip ? -rotY : rotY, flip ? -rotZ : rotZ);
    }
    trackH(yBottom + h);
    return registerMesh(mesh, true, true);
  };

  const addSphere = (r, lx, yCenter, lz, mat, segs = 14, sx = 1, sy = 1, sz = 1) => {
    const fx = flip ? -lx : lx;
    const geo = new THREE.SphereGeometry(Math.max(0.005, r), segs, Math.max(8, segs - 2));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, yCenter, lz);
    if (sx !== 1 || sy !== 1 || sz !== 1) mesh.scale.set(sx, sy, sz);
    trackH(yCenter + r * sy);
    return registerMesh(mesh, true, true);
  };

  return {
    it,
    L,
    W,
    flip,
    primaryMat,
    accentMat,
    shared,
    addBox,
    addCyl,
    addExtruded,
    addSoftBox,
    addRoundedBox,
    addSeatCushion,
    addSphere,
    contact,
    getMaxH: () => maxH,
  };
}

/**
 * Shared dining/accent chair sub-builder used by `chair` and `dining`.
 */
function buildChairParts(ctx, cx, cz, cw, cd, seatMat, frameMat, facingZ = 1, seatH = 0.45, totalH = 0.90) {
  const legR = Math.min(0.02, cw * 0.08, cd * 0.08);
  const insetX = Math.max(0.02, cw / 2 - legR - 0.02);
  const insetZ = Math.max(0.02, cd / 2 - legR - 0.02);
  const backZ = cz - facingZ * (cd / 2 - legR * 1.2);
  const frontZ = cz + facingZ * insetZ;

  // 4 slender legs
  for (const sx of [-1, 1]) {
    ctx.addCyl(legR, legR * 0.72, seatH - 0.03, cx + sx * insetX, 0, frontZ, frameMat, 10);
    ctx.addCyl(legR, legR * 0.72, totalH - 0.03, cx + sx * insetX, 0, backZ, frameMat, 10);
  }

  // Seat apron & soft upholstered seat pad
  ctx.addBox(cw - 0.02, 0.03, cd - 0.02, cx, seatH - 0.04, cz, frameMat);
  ctx.addSoftBox(cw, 0.055, cd - 0.01, cx, seatH - 0.01, cz + facingZ * 0.005, seatMat, 0.012);

  // Backrest panel & top frame rail
  const backH = Math.max(0.18, (totalH - seatH) * 0.72);
  const backY = totalH - backH - 0.02;
  ctx.addSoftBox(cw - 0.03, backH, 0.045, cx, backY, backZ + facingZ * 0.008, seatMat, 0.012);
  ctx.addBox(cw, 0.032, 0.036, cx, totalH - 0.032, backZ, frameMat);
}

function buildBed(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl, addSoftBox } = ctx;
  const hb = Math.min(0.08, L * 0.06);
  const legH = 0.06;

  // 4 corner legs
  for (const lx of [-L / 2 + 0.04, L / 2 - 0.04]) {
    for (const lz of [-W / 2 + 0.04, W / 2 - 0.04]) {
      addCyl(0.026, 0.02, legH, lx, 0, lz, shared.darkWood, 12);
    }
  }

  // Frame base & side rails
  const frameLen = Math.max(0.2, L - hb);
  addBox(frameLen, 0.22, W, -L / 2 + hb + frameLen / 2, legH, 0, primaryMat);

  // Framed headboard at -L/2
  const stileW = Math.min(0.07, W * 0.1);
  const stileH = 0.905 - legH;
  addBox(hb, stileH, stileW, -L / 2 + hb / 2, legH, -W / 2 + stileW / 2, primaryMat);
  addBox(hb, stileH, stileW, -L / 2 + hb / 2, legH, W / 2 - stileW / 2, primaryMat);
  addBox(hb + 0.015, 0.045, W, -L / 2 + hb / 2, 0.905, 0, primaryMat);
  addBox(hb * 0.78, 0.635, Math.max(0.1, W - 2 * stileW), -L / 2 + hb * 0.42, 0.27, 0, primaryMat);

  // White mattress
  const matLen = Math.max(0.16, L - hb - 0.05);
  const matW = Math.max(0.16, W - 0.05);
  const matCx = -L / 2 + hb + 0.02 + matLen / 2;
  addSoftBox(matLen, 0.20, matW, matCx, 0.26, 0, shared.cotton, 0.02);

  // Duvet blanket (~72% length at foot end, proud of mattress on foot, sides & top) + folded white top cuff
  const footX = -L / 2 + hb + 0.02 + matLen;
  const duvFootX = footX + 0.014;
  const duvLen = Math.max(0.12, matLen * 0.72 + 0.014);
  const duvW = Math.min(W - 0.008, matW + 0.028);
  const duvCx = duvFootX - duvLen / 2;
  addSoftBox(duvLen, 0.214, duvW, duvCx, 0.274, 0, accentMat, 0.022);

  const cuffLen = Math.min(0.14, duvLen * 0.28);
  addSoftBox(
    cuffLen,
    0.026,
    duvW + 0.012,
    duvFootX - duvLen + cuffLen / 2,
    0.478,
    0,
    shared.cotton,
    0.012,
  );

  // Plump pillows (2 on double bed, 1 on single bed when W < 1.2)
  const nPillows = W >= 1.2 ? 2 : 1;
  const pLen = Math.min(0.36, L * 0.2);
  const gap = 0.06;
  const pSpan = Math.max(0.08, (matW - 0.08 - (nPillows - 1) * gap) / nPillows);
  const pCx = -L / 2 + hb + 0.055 + pLen / 2;
  for (let i = 0; i < nPillows; i++) {
    const pCz = -((nPillows - 1) * (pSpan + gap)) / 2 + i * (pSpan + gap);
    addSoftBox(pLen, 0.11, pSpan, pCx, 0.45, pCz, shared.cotton, 0.028, 0, 0, -0.18);
  }
}

function buildSofa(ctx) {
  const { L, W, primaryMat, accentMat, shared, addCyl, addRoundedBox, addSeatCushion, contact } = ctx;
  const armW = Math.min(0.205, L * 0.17);
  const shellD = Math.min(0.14, W * 0.245);
  const seatRear = -W / 2 + shellD + 0.008;
  const seatFront = W / 2 - Math.min(0.018, W * 0.04);
  const seatDepth = seatFront - seatRear;
  const seatSpan = L - 2 * armW;

  // Recessed tapered feet, upholstered platform, then the rounded outer shell.
  const footX = L / 2 - Math.min(0.12, L * 0.22);
  const footZ = W / 2 - Math.min(0.105, W * 0.24);
  const footPairs = Math.max(2, Math.ceil(L / 1.7));
  for (let i = 0; i < footPairs; i++) {
    const x = -footX + (2 * footX * i) / (footPairs - 1);
    for (const z of [-footZ, footZ]) {
      addCyl(0.029, 0.021, 0.069, x, 0, z, shared.darkWood, 20);
      contact(0.13, 0.13, x, z, 0.28);
    }
  }
  addRoundedBox(L - 0.014, 0.242, W - 0.016, 0, 0.064, 0, primaryMat, { radius: 0.041 });
  addRoundedBox(L - 0.004, 0.478, shellD, 0, 0.277, -W / 2 + shellD / 2, primaryMat, { radius: 0.047 });
  for (const side of [-1, 1]) {
    addRoundedBox(armW, 0.37, W - shellD - 0.004, side * (L - armW) / 2, 0.252, shellD / 2, primaryMat, {
      radius: 0.047, crownY: 0.009,
    });
  }

  const n = Math.max(1, Math.round(seatSpan / 0.78));
  const cw = seatSpan / n;
  const gap = Math.min(0.018, cw * 0.065);
  const backDepth = Math.min(0.143, W * 0.25);
  const backZ = seatRear + backDepth / 2 + 0.006;

  for (let i = 0; i < n; i++) {
    const x = -seatSpan / 2 + (i + 0.5) * cw;
    addSeatCushion(cw - gap, 0.147, seatDepth, x, 0.295, (seatRear + seatFront) / 2);
    addRoundedBox(cw - gap * 1.25, 0.422, backDepth, x, 0.412, backZ, primaryMat, { radius: 0.046, pitch: -0.18, crownZ: 0.017 });
  }

  // Loose cushions lean against the back and stay inside the seat when resized.
  if (seatSpan >= 0.45 && seatDepth >= 0.30) {
    for (const side of n === 1 ? [-1] : [-1, 1]) {
      const size = Math.min(side < 0 ? 0.37 : 0.33, cw * 0.74, seatDepth * 0.69);
      const depth = Math.min(0.119, size * 0.38);
      const x = side * (seatSpan / 2 - size * 0.64);
      addRoundedBox(size, size * 0.96, depth, x, 0.426, backZ + backDepth * 0.57 + depth * 0.36, accentMat, {
        radius: 0.05, pitch: -0.24, yaw: -side * 0.27, roll: side * 0.16, crownZ: 0.018,
      });
    }
  }
}

function buildLSectional(ctx) {
  const { L, W, primaryMat, accentMat, shared, addCyl, addRoundedBox, addSeatCushion, contact } = ctx;
  const depth = Math.min(0.95, W * 0.6, L * 0.5);
  const shell = Math.min(0.14, depth * 0.245);
  const arm = Math.min(0.185, depth * 0.20);
  const left = -L / 2;
  const rear = -W / 2;
  const right = L / 2;
  const front = W / 2;
  const returnEdge = right - depth;
  const seatEdge = rear + depth;
  const wingDepth = W - depth;
  const inside = depth - shell - 0.016;

  // Two upholstered modules follow the L footprint. Their recessed feet
  // and contact shadows leave the open corner clear.
  const inset = Math.min(0.106, depth * 0.20);
  const legR = Math.min(0.028, depth * 0.15);
  const feet = [
    [left + inset, rear + inset], [0, rear + inset], [right - inset, rear + inset],
    [left + inset, seatEdge - inset], [returnEdge + inset, seatEdge - inset],
    [returnEdge + inset, front - inset], [right - inset, front - inset],
  ];
  for (const [x, z] of feet) {
    addCyl(legR, legR * 0.74, 0.069, x, 0, z, shared.darkWood, 16);
    contact(legR * 2 + 0.074, legR * 2 + 0.074, x, z, 0.26);
  }
  contact(L + 0.13, depth + 0.13, 0, rear + depth / 2, 0.21);
  contact(depth + 0.13, wingDepth + 0.12, right - depth / 2, seatEdge + wingDepth / 2, 0.17);

  addRoundedBox(L - 0.014, 0.242, depth - 0.007, 0, 0.064, rear + depth / 2, primaryMat, { radius: 0.038 });
  addRoundedBox(depth - 0.016, 0.24, wingDepth - 0.014, right - depth / 2, 0.064, seatEdge + wingDepth / 2, primaryMat, { radius: 0.038 });

  addRoundedBox(L - 0.004, 0.478, shell, 0, 0.277, rear + shell / 2, primaryMat, { radius: 0.047 });
  addRoundedBox(shell, 0.473, W - shell - 0.004, right - shell / 2, 0.278, shell / 2, primaryMat, { radius: 0.046 });
  addRoundedBox(arm, 0.37, depth - shell - 0.004, left + arm / 2, 0.252, rear + (depth + shell) / 2, primaryMat, { radius: 0.044, crownY: 0.009 });
  addRoundedBox(depth - shell - 0.004, 0.367, arm, right - (depth + shell) / 2, 0.254, front - arm / 2, primaryMat, { radius: 0.044, crownY: 0.009 });

  const backD = Math.min(0.143, depth * 0.25);
  const mainZ = rear + (depth + shell) / 2;
  const mainBackZ = rear + shell + backD / 2 + 0.014;
  const mainSpan = L - depth - arm;
  const mainCount = Math.max(1, Math.round(mainSpan / 0.78));
  const mainSlot = mainSpan / mainCount;
  const mainGap = Math.min(0.016, mainSlot * 0.11);
  for (let i = 0; i < mainCount; i++) {
    const x = left + arm + (i + 0.5) * mainSlot;
    addSeatCushion(mainSlot - mainGap, 0.147, inside, x, 0.295, mainZ);
    addRoundedBox(mainSlot - mainGap * 1.2, 0.419, backD, x, 0.412, mainBackZ, primaryMat, { radius: 0.047, pitch: -0.18, crownZ: 0.016 });
  }

  const wingX = right - (depth + shell) / 2;
  const wingBackX = right - shell - backD / 2 - 0.013;
  addSeatCushion(inside, 0.145, inside, wingX, 0.296, mainZ);
  addRoundedBox(inside, 0.416, backD, wingX, 0.412, mainBackZ, primaryMat, { radius: 0.046, pitch: -0.18, crownZ: 0.016 });

  const wingSpan = wingDepth - arm;
  const wingCount = Math.max(1, Math.round(wingSpan / 0.77));
  const wingSlot = wingSpan / wingCount;
  const wingGap = Math.min(0.017, wingSlot * 0.13);
  for (let i = 0; i < wingCount; i++) {
    const z = seatEdge + (i + 0.5) * wingSlot;
    addSeatCushion(inside - 0.002, 0.149, wingSlot - wingGap, wingX, 0.294, z);
    addRoundedBox(backD, 0.422, wingSlot - wingGap * 1.22, wingBackX, 0.409, z, primaryMat, { radius: 0.046, roll: -0.17 });
  }

  if (inside > 0.36 && mainSpan > 0.42 && wingSpan > 0.34) {
    const size = Math.min(0.34, inside * 0.57, wingSpan * 0.77);
    addRoundedBox(size, size * 0.96, 0.112, left + arm + size * 0.63, 0.426, mainBackZ + backD * 0.6 + 0.036, accentMat, {
      radius: 0.049, pitch: -0.24, yaw: 0.29, roll: -0.16, crownZ: 0.017,
    });
    addRoundedBox(0.106, size * 0.88, size, wingBackX - backD * 0.6 - 0.032, 0.428, front - arm - size * 0.62, accentMat, {
      radius: 0.048, pitch: 0.12, yaw: -0.17, roll: -0.24,
    });
  }
}

function buildChair(ctx) {
  const { L, W, primaryMat, accentMat } = ctx;
  buildChairParts(ctx, 0, 0, L, W, primaryMat, accentMat, 1, 0.44, 0.9);
}

function buildDiningSet(ctx) {
  const { L, W, primaryMat, accentMat, addBox, addCyl } = ctx;
  const td = Math.min(W * 0.58, 0.95);
  const n = Math.max(1, Math.floor(L / 0.6));
  const slot = L / n;
  const cw = Math.min(0.44, Math.max(0.24, slot - 0.10));
  const cd = Math.min(0.44, Math.max(0.24, (W - td) / 2 + 0.09));

  // Dining table (0..0.75)
  addBox(L, 0.04, td, 0, 0.71, 0, primaryMat);
  addBox(Math.max(0.1, L - 0.09), 0.06, Math.max(0.1, td - 0.09), 0, 0.65, 0, primaryMat);
  const legInsetX = Math.min(L / 2 - 0.03, Math.max(0.03, L / 2 - 0.06));
  const legInsetZ = Math.min(td / 2 - 0.03, Math.max(0.03, td / 2 - 0.06));
  for (const lx of [-legInsetX, legInsetX]) {
    for (const lz of [-legInsetZ, legInsetZ]) {
      addCyl(0.026, 0.022, 0.71, lx, 0, lz, primaryMat, 12);
    }
  }

  // Dining chairs tucked neatly on both sides
  for (let i = 0; i < n; i++) {
    const cx = -L / 2 + (i + 0.5) * slot;
    buildChairParts(ctx, cx, -W / 2 + cd / 2, cw, cd, accentMat, primaryMat, 1, 0.44, 0.88);
    buildChairParts(ctx, cx, W / 2 - cd / 2, cw, cd, accentMat, primaryMat, -1, 0.44, 0.88);
  }
}

function buildRoundTable(ctx) {
  const { L, W, primaryMat, accentMat, addCyl } = ctx;
  const rx = L / 2;
  const rz = W / 2;
  const colR = Math.min(rx, rz) * 0.13;
  const baseR = Math.min(rx, rz) * 0.48;

  // Tabletop (0.71..0.75) & subtle under-rim bevel
  addCyl(0.5, 0.5, 0.04, 0, 0.71, 0, primaryMat, 36, 0, 0, L, W);
  addCyl(0.46, 0.43, 0.025, 0, 0.685, 0, accentMat, 32, 0, 0, L, W);

  // Pedestal column & flared circular/elliptical base
  addCyl(colR * 0.9, colR * 1.15, 0.63, 0, 0.06, 0, accentMat, 24);
  addCyl(colR * 1.25, baseR, 0.06, 0, 0, 0, accentMat, 32, 0, 0, L / Math.min(L, W), W / Math.min(L, W));
}

function buildTable(ctx) {
  const { L, W, primaryMat, accentMat, addBox, addCyl } = ctx;
  addBox(L, 0.04, W, 0, 0.71, 0, primaryMat);
  addBox(Math.max(0.1, L - 0.1), 0.055, Math.max(0.1, W - 0.1), 0, 0.655, 0, accentMat);
  const ix = Math.max(0.05, L / 2 - 0.06);
  const iz = Math.max(0.05, W / 2 - 0.06);
  for (const lx of [-ix, ix]) {
    for (const lz of [-iz, iz]) {
      addCyl(0.026, 0.022, 0.71, lx, 0, lz, accentMat, 12);
    }
  }
}

function buildDesk(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  // Desktop (0.71..0.75)
  addBox(L, 0.04, W, 0, 0.71, 0, primaryMat);

  // 3-drawer pedestal on +L/2 side
  const pedW = Math.min(0.44, Math.max(0.24, L * 0.32));
  const pedD = Math.max(0.18, W - 0.04);
  const pedCx = L / 2 - pedW / 2 - 0.01;
  addBox(pedW, 0.68, pedD, pedCx, 0.03, -0.005, primaryMat);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCyl(0.015, 0.012, 0.03, pedCx + sx * (pedW / 2 - 0.03), 0, sz * (pedD / 2 - 0.03), shared.charcoal, 10);
    }
  }
  const drawerH = 0.2;
  for (let i = 0; i < 3; i++) {
    const dy = 0.06 + i * 0.21;
    addBox(pedW - 0.025, drawerH, 0.016, pedCx, dy, -0.005 + pedD / 2 + 0.008, primaryMat);
    addBox(Math.min(0.14, pedW * 0.42), 0.012, 0.014, pedCx, dy + drawerH * 0.55, -0.005 + pedD / 2 + 0.022, shared.chrome);
  }

  // Metal leg frame on -L/2 side + rear crossbar
  const leftX = -L / 2 + 0.05;
  const legZ = Math.max(0.04, W / 2 - 0.06);
  addBox(0.04, 0.71, 0.04, leftX, 0, -legZ, accentMat);
  addBox(0.04, 0.71, 0.04, leftX, 0, legZ, accentMat);
  addBox(0.035, 0.035, Math.max(0.08, W - 0.12), leftX, 0.04, 0, accentMat);
  addBox(0.035, 0.035, Math.max(0.08, W - 0.12), leftX, 0.675, 0, accentMat);
  const spanX = Math.max(0.1, pedCx - pedW / 2 - leftX);
  addBox(spanX, 0.045, 0.025, leftX + spanX / 2, 0.665, -legZ, accentMat);

  // Sleek open laptop prop on desktop
  if (L >= 0.6 && W >= 0.35) {
    const lapX = -L * 0.14;
    const lapZ = -W * 0.04;
    const lapW = Math.min(0.36, L * 0.32);
    const lapD = Math.min(0.24, W * 0.42);
    addBox(lapW, 0.012, lapD, lapX, 0.75, lapZ, shared.chrome);
    addBox(lapW * 0.86, 0.003, lapD * 0.52, lapX, 0.762, lapZ - lapD * 0.08, shared.charcoal);
    const lidH = lapD * 0.92;
    const screenH = lidH * 0.86;
    const screenY = 0.76 + (lidH - screenH) / 2 + 0.002;
    addBox(lapW, lidH, 0.009, lapX, 0.76, lapZ - lapD / 2 - 0.015, shared.chrome, true, true, -0.22, 0, 0);
    addBox(lapW * 0.92, screenH, 0.003, lapX, screenY, lapZ - lapD / 2 - 0.007, shared.screen, false, false, -0.22, 0, 0);
  }
}

function buildCoffeeTable(ctx) {
  const { L, W, primaryMat, accentMat, shared, addRoundedBox, contact } = ctx;
  const topY = 0.42;
  const topH = 0.045;
  const legW = Math.min(0.09, L * 0.18);
  const legD = W - 2 * Math.min(0.09, W * 0.17);
  const legX = L / 2 - Math.min(0.18, L * 0.22);
  const trestles = Math.max(2, Math.ceil((2 * legX) / 1.2) + 1);

  // Softened solid top with recessed apron and a joined trestle base.
  addRoundedBox(L, topH, W, 0, topY - topH, 0, primaryMat, { radius: 0.016 });
  addRoundedBox(L * 0.84, 0.032, W * 0.78, 0, 0.347, 0, primaryMat, { radius: 0.007 });
  addRoundedBox(2 * legX, 0.057, Math.min(0.10, legD * 0.45), 0, 0.135, 0, primaryMat, { radius: 0.01 });
  for (let i = 0; i < trestles; i++) {
    const x = -legX + (2 * legX * i) / (trestles - 1);
    addRoundedBox(legW, 0.365, legD, x, 0.012, 0, primaryMat, { radius: 0.018 });
    addRoundedBox(legW * 0.77, 0.017, legD - 0.024, x, 0, 0, shared.charcoal, { radius: 0.005 });
    contact(legW + 0.1, legD + 0.11, x, 0, 0.30);
  }

  // A closed book provides a familiar scale cue on full-sized tables.
  if (L >= 0.72 && W >= 0.43) {
    const x = L * 0.21;
    const z = -W * 0.13;
    const options = { radius: 0.003, yaw: 0.17 };
    addRoundedBox(0.24, 0.006, 0.164, x, topY - 0.001, z, accentMat, options);
    addRoundedBox(0.227, 0.017, 0.153, x, topY + 0.003, z, shared.cotton, options);
    addRoundedBox(0.24, 0.006, 0.164, x, topY + 0.019, z, accentMat, options);
  }
}

function buildNightstand(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  const bodyD = Math.max(0.12, W - 0.02);
  // 4 short legs
  for (const lx of [-L / 2 + 0.04, L / 2 - 0.04]) {
    for (const lz of [-W / 2 + 0.04, W / 2 - 0.04]) {
      addCyl(0.016, 0.012, 0.05, lx, 0, lz, accentMat, 10);
    }
  }

  // Carcass & overhanging top (0.05..0.55)
  addBox(L - 0.02, 0.47, bodyD, 0, 0.05, -0.01, primaryMat);
  addBox(L, 0.03, W, 0, 0.52, 0, primaryMat);

  // 2 drawer fronts & handles on +W/2 face
  const faceZ = -0.01 + bodyD / 2 + 0.008;
  for (let i = 0; i < 2; i++) {
    const dy = 0.08 + i * 0.215;
    addBox(L - 0.04, 0.195, 0.016, 0, dy, faceZ, primaryMat);
    addBox(Math.min(0.14, L * 0.34), 0.012, 0.014, 0, dy + 0.105, faceZ + 0.014, shared.chrome);
  }

  // Warm miniature bedside lamp on top (0.55..0.82)
  const lampR = Math.min(0.09, L * 0.22, W * 0.22);
  addCyl(lampR * 0.65, lampR * 0.78, 0.03, 0, 0.55, -W * 0.06, accentMat, 16);
  addCyl(0.012, 0.014, 0.12, 0, 0.58, -W * 0.06, shared.chrome, 12);
  addCyl(lampR * 0.9, lampR * 1.25, 0.14, 0, 0.68, -W * 0.06, shared.lampShade, 20);
}

function buildStorageCabinet(ctx) {
  const { it, L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  const type = it.type;
  const totalH = type === 'wardrobe' ? 2.0 : 0.85;
  const plinthH = type === 'sideboard' ? 0.16 : 0.07;
  const bodyD = Math.max(0.14, W - 0.02);
  const topH = 0.03;
  const bodyH = totalH - plinthH - topH;

  if (type === 'sideboard') {
    for (const lx of [-L / 2 + 0.06, L / 2 - 0.06]) {
      for (const lz of [-W / 2 + 0.06, W / 2 - 0.06]) {
        addCyl(0.022, 0.014, plinthH, lx, 0, lz, accentMat, 10);
      }
    }
  } else {
    addBox(Math.max(0.1, L - 0.02), plinthH, Math.max(0.1, bodyD - 0.03), 0, 0, -0.02, accentMat);
  }

  addBox(L - 0.01, bodyH, bodyD, 0, plinthH, -0.01, primaryMat);
  addBox(L, topH, W, 0, totalH - topH, 0, primaryMat);

  const faceZ = -0.01 + bodyD / 2 + 0.008;
  if (type === 'dresser') {
    const cols = Math.max(1, Math.round(L / 0.55));
    const dw = (L - 0.02) / cols;
    const rows = 3;
    const dh = (bodyH - 0.03) / rows;
    for (let c = 0; c < cols; c++) {
      const cx = -(L - 0.02) / 2 + (c + 0.5) * dw;
      for (let r = 0; r < rows; r++) {
        const dy = plinthH + 0.015 + r * dh;
        addBox(dw - 0.014, dh - 0.014, 0.016, cx, dy, faceZ, primaryMat);
        addBox(Math.min(0.14, dw * 0.34), 0.012, 0.014, cx, dy + dh * 0.52, faceZ + 0.014, shared.chrome);
      }
    }
  } else {
    const doors = Math.max(2, Math.round(L / 0.5));
    const dw = (L - 0.02) / doors;
    const hLen = type === 'wardrobe' ? 0.34 : 0.14;
    const hBottom = type === 'wardrobe' ? 0.88 : plinthH + bodyH * 0.58;
    for (let i = 0; i < doors; i++) {
      const cx = -(L - 0.02) / 2 + (i + 0.5) * dw;
      addBox(dw - 0.012, bodyH - 0.02, 0.016, cx, plinthH + 0.01, faceZ, primaryMat);
      const handleSide = i % 2 === 0 ? 1 : -1;
      const hx = cx + handleSide * Math.max(0.02, dw / 2 - 0.045);
      addBox(0.014, hLen, 0.018, hx, hBottom, faceZ + 0.015, shared.chrome);
    }
  }
}

function buildVanity(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl, addSoftBox } = ctx;
  // 4 slender legs + drawers + top (0..0.78)
  const legH = 0.62;
  for (const lx of [-L / 2 + 0.04, L / 2 - 0.04]) {
    for (const lz of [-W / 2 + 0.04, W / 2 - 0.04]) {
      addCyl(0.018, 0.013, legH, lx, 0, lz, accentMat, 12);
    }
  }
  addBox(L - 0.02, 0.13, Math.max(0.14, W - 0.03), 0, legH, -0.008, primaryMat);
  addBox(L, 0.03, W, 0, 0.75, 0, primaryMat);

  const cols = L >= 0.7 ? 2 : 1;
  const dw = (L - 0.04) / cols;
  const faceZ = -0.008 + Math.max(0.14, W - 0.03) / 2 + 0.008;
  for (let i = 0; i < cols; i++) {
    const cx = -(L - 0.04) / 2 + (i + 0.5) * dw;
    addBox(dw - 0.014, 0.11, 0.014, cx, legH + 0.01, faceZ, primaryMat);
    addCyl(0.012, 0.012, 0.016, cx, legH + 0.06, faceZ + 0.012, shared.chrome, 12, Math.PI / 2, 0);
  }

  // Upright vanity mirror frame & reflective pane (0.78..1.35)
  const mirW = Math.min(L * 0.64, 0.68);
  const mirZ = -W / 2 + 0.035;
  const frameT = 0.032;
  addBox(mirW, frameT, 0.032, 0, 0.78, mirZ, accentMat);
  addBox(mirW, frameT, 0.032, 0, 1.35 - frameT, mirZ, accentMat);
  addBox(frameT, 0.57 - 2 * frameT, 0.032, -mirW / 2 + frameT / 2, 0.78 + frameT, mirZ, accentMat);
  addBox(frameT, 0.57 - 2 * frameT, 0.032, mirW / 2 - frameT / 2, 0.78 + frameT, mirZ, accentMat);
  addBox(Math.max(0.1, mirW - 2 * frameT), 0.57 - 2 * frameT, 0.012, 0, 0.78 + frameT, mirZ, shared.mirror);

  // Tucked padded stool
  const stoolW = Math.min(0.36, L * 0.42);
  const stoolD = Math.min(0.3, W * 0.66);
  const stoolZ = W / 2 - stoolD / 2 - 0.02;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCyl(0.015, 0.011, 0.37, sx * (stoolW / 2 - 0.03), 0, stoolZ + sz * (stoolD / 2 - 0.03), accentMat, 10);
    }
  }
  addSoftBox(stoolW, 0.08, stoolD, 0, 0.37, stoolZ, shared.cotton, 0.016);
}

function buildTvUnit(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  const bodyD = Math.max(0.16, W - 0.02);
  // 4 short legs + low media console (0..0.48)
  for (const lx of [-L / 2 + 0.05, L / 2 - 0.05]) {
    for (const lz of [-W / 2 + 0.05, W / 2 - 0.05]) {
      addCyl(0.02, 0.014, 0.08, lx, 0, lz, accentMat, 10);
    }
  }
  addBox(L - 0.01, 0.37, bodyD, 0, 0.08, -0.005, primaryMat);
  addBox(L, 0.03, W, 0, 0.45, 0, primaryMat);

  // Side cabinet doors & center open media shelf cubby
  const faceZ = -0.005 + bodyD / 2 + 0.008;
  const sideW = Math.max(0.16, L * 0.28);
  if (L >= 0.9) {
    for (const sx of [-1, 1]) {
      const cx = sx * (L / 2 - sideW / 2 - 0.01);
      addBox(sideW - 0.01, 0.34, 0.015, cx, 0.095, faceZ, primaryMat);
      addBox(0.08, 0.012, 0.014, cx - sx * (sideW * 0.2), 0.36, faceZ + 0.014, shared.chrome);
    }
    const midW = Math.max(0.16, L - 2 * sideW - 0.04);
    addBox(midW, 0.02, bodyD - 0.02, 0, 0.25, 0, primaryMat);
    addBox(midW * 0.72, 0.03, bodyD * 0.6, 0, 0.27, 0.02, shared.charcoal);
  } else {
    addBox(L - 0.03, 0.34, 0.015, 0, 0.095, faceZ, primaryMat);
  }

  // Flat-screen 16:9 TV on central pedestal stand above console (0.48..~1.30)
  const tvZ = -W / 2 + Math.min(0.14, W * 0.35);
  const tvW = Math.min(L * 0.72, 1.24);
  const tvH = tvW * (9 / 16);
  const bezel = 0.028;
  const tvBottom = 0.58;
  addBox(Math.min(0.36, tvW * 0.38), 0.02, Math.min(0.22, W * 0.55), 0, 0.48, tvZ, shared.charcoal);
  addBox(0.06, 0.11, 0.04, 0, 0.5, tvZ - 0.01, shared.charcoal);
  addBox(tvW + bezel, tvH + bezel, bezel, 0, tvBottom, tvZ, shared.charcoal);
  addBox(tvW, tvH, 0.006, 0, tvBottom + bezel / 2, tvZ + bezel / 2 + 0.005, shared.screen, false, false);
}

function buildBookcase(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox } = ctx;
  const sideT = 0.026;
  const backT = 0.02;
  const innerW = Math.max(0.1, L - 2 * sideT);
  const shelfD = Math.max(0.1, W - backT);

  // Frame, back panel & 5 shelves (0..1.90)
  addBox(sideT, 1.9, W, -L / 2 + sideT / 2, 0, 0, primaryMat);
  addBox(sideT, 1.9, W, L / 2 - sideT / 2, 0, 0, primaryMat);
  addBox(innerW, 1.87, backT, 0, 0, -W / 2 + backT / 2, accentMat);
  addBox(innerW, 0.05, shelfD, 0, 0, backT / 2, primaryMat);
  addBox(innerW, 0.03, W, 0, 1.87, 0, primaryMat);

  const shelfYs = [0.05, 0.41, 0.77, 1.13, 1.49];
  for (const sy of shelfYs) {
    addBox(innerW, 0.024, shelfD, 0, sy, backT / 2, primaryMat);
  }

  // Optional center vertical divider on wider bookcases
  const bays = L >= 0.72 ? 2 : 1;
  if (bays === 2) {
    addBox(0.02, 1.82, shelfD - 0.01, 0, 0.05, backT / 2, primaryMat);
  }

  // Colorful varied-height book clusters across shelves
  const bookD = Math.max(0.08, shelfD * 0.72);
  const bookZ = -W / 2 + backT + bookD / 2 + 0.015;
  for (let sIdx = 0; sIdx < shelfYs.length; sIdx++) {
    const baseY = shelfYs[sIdx] + 0.024;
    for (let bIdx = 0; bIdx < bays; bIdx++) {
      const baySpan = bays === 2 ? innerW / 2 - 0.02 : innerW - 0.02;
      const bayStart = bays === 2 ? (bIdx === 0 ? -innerW / 2 + 0.01 : 0.015) : -innerW / 2 + 0.015;
      let cursor = 0.01;
      const count = Math.min(6, Math.max(2, Math.floor(baySpan / 0.048)));
      for (let k = 0; k < count; k++) {
        const bw = 0.024 + ((k + sIdx) % 3) * 0.008;
        if (cursor + bw > baySpan * 0.82) break;
        const bh = 0.19 + ((k * 3 + sIdx * 2 + bIdx) % 5) * 0.022;
        const bx = bayStart + cursor + bw / 2;
        const mat = shared.books[(k + sIdx + bIdx) % shared.books.length];
        addBox(bw, bh, bookD, bx, baseY, bookZ, mat);
        cursor += bw + 0.005;
      }
    }
  }
}

function buildCounter(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  const cabD = Math.max(0.16, W - 0.03);
  const cabZ = -0.015;

  // Toe-kick plinth, cabinet carcass & overhanging marble/stone countertop
  addBox(L - 0.01, 0.08, Math.max(0.12, cabD - 0.04), 0, 0, cabZ - 0.02, shared.charcoal);
  addBox(L, 0.78, cabD, 0, 0.08, cabZ, primaryMat);
  addBox(L, 0.04, W, 0, 0.86, 0, accentMat);
  addBox(L, 0.06, 0.02, 0, 0.9005, -W / 2 + 0.01, accentMat);

  // Front cabinet doors & handles on +W/2 face
  const doors = Math.max(2, Math.round(L / 0.55));
  const dw = (L - 0.02) / doors;
  const faceZ = cabZ + cabD / 2 + 0.008;
  for (let i = 0; i < doors; i++) {
    const cx = -L / 2 + 0.01 + (i + 0.5) * dw;
    addBox(dw - 0.012, 0.73, 0.016, cx, 0.105, faceZ, primaryMat);
    const side = i % 2 === 0 ? 1 : -1;
    addBox(0.014, 0.14, 0.016, cx + side * Math.max(0.02, dw / 2 - 0.05), 0.64, faceZ + 0.015, shared.chrome);
  }

  // Stainless-steel sink & chrome gooseneck faucet at -L/4
  const sinkX = -L * 0.25;
  const sw = Math.min(0.58, L * 0.3);
  const sd = Math.max(0.2, W - 0.2);
  addBox(sw, 0.010, sd, sinkX, 0.9005, 0.01, shared.chrome);
  addBox(Math.max(0.08, sw - 0.05), 0.014, Math.max(0.08, sd - 0.05), sinkX, 0.9005, 0.01, shared.sinkSteel);
  addCyl(0.022, 0.022, 0.005, sinkX, 0.9145, 0.01, shared.chrome, 12);

  // Gooseneck faucet behind sink
  const tapZ = -W / 2 + Math.min(0.09, W * 0.16);
  addCyl(0.02, 0.024, 0.02, sinkX, 0.9, tapZ, shared.chrome, 14);
  addCyl(0.011, 0.011, 0.18, sinkX, 0.92, tapZ, shared.chrome, 12);
  addBox(0.022, 0.022, 0.11, sinkX, 1.08, tapZ + 0.045, shared.chrome);
  addCyl(0.01, 0.01, 0.05, sinkX, 1.035, tapZ + 0.095, shared.chrome, 10);

  // 4-burner ceramic cooktop hob when L >= 1.5
  if (L >= 1.5) {
    const hobX = L * 0.22;
    const hw = Math.min(0.58, L * 0.26);
    const hd = Math.max(0.24, W - 0.14);
    addBox(hw, 0.012, hd, hobX, 0.901, 0, shared.charcoal);
    const br = Math.min(0.078, hw * 0.15, hd * 0.18);
    const ox = hw * 0.24;
    const oz = hd * 0.24;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addCyl(br, br * 1.05, 0.008, hobX + sx * ox, 0.913, sz * oz, shared.charcoal, 18);
      }
    }
  }
}

function buildFridge(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  const bodyD = Math.max(0.18, W - 0.04);
  const bodyZ = -0.02;

  // Feet & main appliance body (0..1.80)
  for (const lx of [-L / 2 + 0.05, L / 2 - 0.05]) {
    for (const lz of [-W / 2 + 0.05, W / 2 - 0.05]) {
      addCyl(0.02, 0.02, 0.02, lx, 0, lz, shared.charcoal, 10);
    }
  }
  addBox(L, 1.78, bodyD, 0, 0.02, bodyZ, primaryMat);

  // Split upper fridge door & lower freezer drawer on +W/2 face
  const doorZ = bodyZ + bodyD / 2 + 0.018;
  addBox(L - 0.012, 1.18, 0.032, 0, 0.61, doorZ, primaryMat);
  addBox(L - 0.012, 0.55, 0.032, 0, 0.03, doorZ, primaryMat);

  // Subtle dispenser recess & brushed steel handles
  if (L >= 0.5) {
    addBox(Math.min(0.18, L * 0.26), 0.26, 0.008, -L * 0.15, 1.02, doorZ + 0.016, accentMat);
  }
  const hx = L / 2 - 0.07;
  addBox(0.018, 0.52, 0.024, hx, 0.84, doorZ + 0.028, shared.chrome);
  addBox(Math.min(0.36, L * 0.52), 0.018, 0.024, 0, 0.49, doorZ + 0.028, shared.chrome);
}

function buildWasher(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl } = ctx;
  const bodyD = Math.max(0.18, W - 0.02);
  // Feet & body (0..0.85)
  for (const lx of [-L / 2 + 0.05, L / 2 - 0.05]) {
    for (const lz of [-W / 2 + 0.05, W / 2 - 0.05]) {
      addCyl(0.016, 0.016, 0.02, lx, 0, lz, shared.charcoal, 10);
    }
  }
  addBox(L, 0.83, bodyD, 0, 0.02, -0.01, primaryMat);

  // Upper control strip, dial & detergent tray on +W/2 face
  const faceZ = -0.01 + bodyD / 2 + 0.006;
  addBox(L - 0.02, 0.13, 0.012, 0, 0.71, faceZ, accentMat);
  addBox(L * 0.26, 0.09, 0.008, -L * 0.3, 0.73, faceZ + 0.006, primaryMat);
  addCyl(0.026, 0.026, 0.018, 0, 0.775 - 0.009, faceZ + 0.012, shared.chrome, 16, Math.PI / 2, 0);
  addBox(Math.min(0.12, L * 0.2), 0.035, 0.008, L * 0.26, 0.755, faceZ + 0.006, shared.charcoal);

  // Protruding drum porthole with bezel & dark glass
  const drumR = Math.min(L * 0.34, 0.21);
  addCyl(drumR, drumR * 1.06, 0.03, 0, 0.4 - 0.015, faceZ + 0.012, shared.chrome, 26, Math.PI / 2, 0);
  addCyl(drumR * 0.78, drumR * 0.78, 0.036, 0, 0.4 - 0.018, faceZ + 0.016, shared.screen, 24, Math.PI / 2, 0);
}

function buildShower(ctx) {
  const { L, W, primaryMat, shared, addBox, addCyl } = ctx;
  // Ceramic tray with raised perimeter curb (0..0.06)
  addBox(L, 0.038, W, 0, 0, 0, primaryMat);
  const curbW = 0.05;
  addBox(L, 0.022, curbW, 0, 0.038, -W / 2 + curbW / 2, primaryMat);
  addBox(L, 0.022, curbW, 0, 0.038, W / 2 - curbW / 2, primaryMat);
  addBox(curbW, 0.022, W - 2 * curbW, -L / 2 + curbW / 2, 0.038, 0, primaryMat);
  addBox(curbW, 0.022, W - 2 * curbW, L / 2 - curbW / 2, 0.038, 0, primaryMat);
  addCyl(0.045, 0.045, 0.004, 0, 0.038, 0, shared.chrome, 16);

  // Translucent glass walls (0.06..2.05) + thin chrome framing rails
  const glassH = 1.99;
  const railT = 0.022;
  const postH = glassH - railT;
  const gOff = 0.018;
  // Front wall (+W/2) split into fixed panel + door panel with handle, inset between posts
  const frontW = Math.max(0.2, L - 2 * gOff);
  const clearFrontW = Math.max(0.1, frontW - railT);
  addBox(clearFrontW * 0.44, postH, 0.01, -clearFrontW * 0.28, 0.06, W / 2 - gOff, shared.glass, false, true);
  addBox(clearFrontW * 0.54, postH, 0.01, clearFrontW * 0.23, 0.06, W / 2 - gOff, shared.glass, false, true);
  addBox(0.016, 0.24, 0.04, clearFrontW * 0.02, 0.94, W / 2 - gOff, shared.chrome);

  // Side glass walls (+L/2 and -L/2), inset between front & back corner posts
  const sideD = Math.max(0.2, W - 2 * gOff);
  const clearSideD = Math.max(0.1, sideD - railT);
  addBox(0.01, postH, clearSideD, L / 2 - gOff, 0.06, 0, shared.glass, false, true);
  addBox(0.01, postH, clearSideD, -L / 2 + gOff, 0.06, 0, shared.glass, false, true);

  // Corner posts stopping beneath top frame rails + flush non-overlapping top rails
  for (const lx of [-L / 2 + gOff, L / 2 - gOff]) {
    for (const lz of [-W / 2 + gOff, W / 2 - gOff]) {
      addBox(railT, postH, railT, lx, 0.06, lz, shared.chrome);
    }
  }
  addBox(frontW + railT, railT, railT, 0, 2.05 - railT, W / 2 - gOff, shared.chrome);
  addBox(railT, railT, sideD, L / 2 - gOff, 2.05 - railT, -railT / 2, shared.chrome);
  addBox(railT, railT, sideD, -L / 2 + gOff, 2.05 - railT, -railT / 2, shared.chrome);

  // Chrome shower column & overhead rain head at back wall (-W/2)
  const colZ = -W / 2 + 0.05;
  const armLen = Math.min(0.28, Math.max(0.08, W * 0.42));
  addCyl(0.014, 0.014, 1.15, 0, 0.85, colZ, shared.chrome, 12);
  addBox(Math.min(0.22, L * 0.45), 0.032, 0.04, 0, 1.04, colZ + 0.02, shared.chrome);
  addBox(0.024, 0.024, armLen, 0, 1.98, colZ + armLen / 2, shared.chrome);
  addCyl(Math.min(0.11, L * 0.25, W * 0.25), Math.min(0.11, L * 0.25, W * 0.25), 0.016, 0, 1.955, colZ + armLen - 0.01, shared.chrome, 20);
}

function buildBathtub(ctx) {
  const { L, W, primaryMat, shared, addBox, addCyl } = ctx;
  const tubMat = shared.porcelain || primaryMat;
  const wallT = Math.min(0.08, W * 0.14);
  const endT = Math.min(0.12, L * 0.12);

  // Hollow porcelain tub shell (0..0.55)
  addBox(L, 0.12, W, 0, 0, 0, tubMat);
  addBox(L, 0.43, wallT, 0, 0.12, -W / 2 + wallT / 2, tubMat);
  addBox(L, 0.43, wallT, 0, 0.12, W / 2 - wallT / 2, tubMat);
  addBox(endT, 0.43, W - 2 * wallT, -L / 2 + endT / 2, 0.12, 0, tubMat);
  addBox(endT, 0.43, W - 2 * wallT, L / 2 - endT / 2, 0.12, 0, tubMat);

  // Sloped headrest inside -L/2 end
  const innerW = Math.max(0.16, W - 2 * wallT);
  addBox(0.04, 0.40, innerW, -L / 2 + endT + 0.06, 0.11, 0, tubMat, true, true, 0, 0, -0.35);

  // Chrome drain & deck mixer faucet at +L/2 end
  addCyl(0.03, 0.03, 0.005, L / 2 - endT - 0.09, 0.12, 0, shared.chrome, 16);
  const tapX = L / 2 - endT * 0.5;
  addBox(0.045, 0.03, 0.16, tapX, 0.55, 0, shared.chrome);
  addCyl(0.015, 0.018, 0.08, tapX, 0.58, 0, shared.chrome, 12);
  addBox(0.11, 0.022, 0.026, tapX - 0.045, 0.64, 0, shared.chrome);
}

function buildToilet(ctx) {
  const { L, W, shared, addBox, addCyl, addSoftBox } = ctx;
  const tk = Math.min(0.22, W * 0.28);
  const bowlLen = Math.max(0.24, W - tk);
  const tankW = Math.min(L * 0.94, 0.42);

  // Rear cistern tank & dual-flush button (0..0.78)
  addSoftBox(tankW, 0.75, tk, 0, 0, -W / 2 + tk / 2, shared.porcelain, 0.016);
  addSoftBox(tankW + 0.016, 0.03, tk + 0.016, 0, 0.75, -W / 2 + tk / 2, shared.porcelain, 0.01);
  addCyl(0.022, 0.022, 0.01, 0, 0.78, -W / 2 + tk / 2, shared.chrome, 14);

  // Pedestal base & contoured porcelain oval bowl (0..0.42)
  const bowlCz = -W / 2 + tk + bowlLen * 0.48;
  addCyl(0.45, 0.38, 0.22, 0, 0, bowlCz - bowlLen * 0.06, shared.porcelain, 24, 0, 0, L * 0.62, bowlLen * 0.66);
  addCyl(0.5, 0.34, 0.2, 0, 0.19, bowlCz, shared.porcelain, 28, 0, 0, L * 0.86, bowlLen * 0.94);

  // Seat ring & closed lid
  addCyl(0.49, 0.5, 0.032, 0, 0.39, bowlCz, shared.porcelain, 28, 0, 0, L * 0.78, bowlLen * 0.84);
  addBox(L * 0.45, 0.014, 0.025, 0, 0.4, -W / 2 + tk + 0.02, shared.chrome);
}

function buildBasin(ctx) {
  const { L, W, primaryMat, accentMat, shared, addBox, addCyl, addSoftBox } = ctx;
  // Vanity cabinet & porcelain counter (0..0.85)
  addBox(L - 0.02, 0.06, Math.max(0.14, W - 0.05), 0, 0, -0.02, shared.charcoal);
  addBox(L - 0.01, 0.74, Math.max(0.16, W - 0.02), 0, 0.06, -0.01, primaryMat);
  addBox(L, 0.045, W, 0, 0.8, 0, shared.porcelain);

  // Front cabinet doors
  const faceZ = -0.01 + Math.max(0.16, W - 0.02) / 2 + 0.008;
  const doors = L >= 0.55 ? 2 : 1;
  const dw = (L - 0.02) / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -(L - 0.02) / 2 + (i + 0.5) * dw;
    addBox(dw - 0.012, 0.68, 0.014, cx, 0.09, faceZ, primaryMat);
    const side = doors === 2 ? (i === 0 ? 1 : -1) : 0;
    addBox(0.012, 0.12, 0.014, cx + side * (dw * 0.25), 0.6, faceZ + 0.013, shared.chrome);
  }

  // Washbasin hollow rim, drain & chrome mixer tap
  const bowlW = Math.min(L * 0.72, 0.52);
  const bowlD = Math.min(W * 0.66, 0.34);
  const rimT = 0.028;
  addBox(bowlW, 0.035, rimT, 0, 0.845, 0.03 - bowlD / 2 + rimT / 2, shared.porcelain);
  addBox(bowlW, 0.035, rimT, 0, 0.845, 0.03 + bowlD / 2 - rimT / 2, shared.porcelain);
  addBox(rimT, 0.035, Math.max(0.04, bowlD - 2 * rimT), -bowlW / 2 + rimT / 2, 0.845, 0.03, shared.porcelain);
  addBox(rimT, 0.035, Math.max(0.04, bowlD - 2 * rimT), bowlW / 2 - rimT / 2, 0.845, 0.03, shared.porcelain);
  addCyl(0.02, 0.02, 0.005, 0, 0.845, 0.03, shared.chrome, 12);
  const tapZ = -W / 2 + Math.min(0.07, W * 0.18);
  addCyl(0.016, 0.02, 0.11, 0, 0.845, tapZ, shared.chrome, 12);
  addBox(0.02, 0.02, 0.09, 0, 0.94, tapZ + 0.04, shared.chrome);

  // Framed wall mirror above basin (1.00..1.65)
  const mirW = Math.min(L * 0.9, 0.72);
  const mirZ = -W / 2 + 0.018;
  const frameT = 0.024;
  addBox(mirW, frameT, 0.024, 0, 1.0, mirZ, accentMat);
  addBox(mirW, frameT, 0.024, 0, 1.65 - frameT, mirZ, accentMat);
  addBox(frameT, 0.65 - 2 * frameT, 0.024, -mirW / 2 + frameT / 2, 1.0 + frameT, mirZ, accentMat);
  addBox(frameT, 0.65 - 2 * frameT, 0.024, mirW / 2 - frameT / 2, 1.0 + frameT, mirZ, accentMat);
  addBox(Math.max(0.1, mirW - 2 * frameT), 0.65 - 2 * frameT, 0.01, 0, 1.0 + frameT, mirZ, shared.mirror);
}

function buildPlant(ctx) {
  const { L, W, primaryMat, accentMat, shared, addCyl, addSphere } = ctx;
  const r = Math.min(L, W) * 0.5;
  const potTop = Math.max(0.08, r * 0.68);
  const potBot = Math.max(0.06, r * 0.46);

  // Tapered pot + flared rim + dark soil disc (0..0.43)
  addCyl(potTop, potBot, 0.39, 0, 0, 0, primaryMat, 22);
  addCyl(potTop * 1.08, potTop * 1.04, 0.045, 0, 0.38, 0, primaryMat, 22);
  addCyl(potTop * 0.96, potTop * 0.96, 0.02, 0, 0.4, 0, shared.soil, 20);

  // Multi-cluster leafy foliage spheres & fronds (0.42..1.15)
  addCyl(0.018, 0.024, 0.38, 0, 0.41, 0, shared.soil, 10);
  const crownR = Math.max(0.11, r * 0.54);
  addSphere(crownR * 0.9, 0, 0.94, 0, accentMat, 14, 1.0, 1.35, 1.0);
  const clusters = 6;
  for (let i = 0; i < clusters; i++) {
    const a = (i * Math.PI * 2) / clusters + 0.3;
    const dist = crownR * 0.85;
    const hOff = (i % 2 === 0 ? 0.68 : 0.84) + (i % 3) * 0.08;
    addSphere(
      crownR * (0.56 + (i % 2) * 0.12),
      Math.cos(a) * dist,
      hOff,
      Math.sin(a) * dist,
      accentMat,
      12,
      1.15,
      0.85,
      1.15,
    );
  }
}

function buildRug(ctx) {
  const { L, W, primaryMat, accentMat, addRoundedBox, addExtruded } = ctx;
  const edge = Math.min(0.016, L * 0.045, W * 0.045);
  const bounds = inset => {
    const x = L / 2 - inset;
    const z = W / 2 - inset;
    return [[-x, -z], [x, -z], [x, z], [-x, z]];
  };

  // Binding supports a shallow pile. The colored inset is one continuous ring.
  addRoundedBox(L, 0.008, W, 0, 0.0055, 0, accentMat, { radius: 0.0035, cast: false });
  addRoundedBox(L - 2 * edge, 0.008, W - 2 * edge, 0, 0.0095, 0, primaryMat, { radius: 0.0032, cast: false });
  const inset = Math.min(0.065, L * 0.18, W * 0.18);
  const stripe = Math.min(0.018, L * 0.05, W * 0.05);
  addExtruded(bounds(inset), 0.018, 0.020, accentMat, false, true, [bounds(inset + stripe)]);
}

const FURNITURE_BUILDERS = {
  bed: buildBed,
  sbed: buildBed,
  sofa: buildSofa,
  armchair: buildSofa,
  lsofa: buildLSectional,
  chair: buildChair,
  dining: buildDiningSet,
  rtable: buildRoundTable,
  table: buildTable,
  desk: buildDesk,
  coffee: buildCoffeeTable,
  nightstand: buildNightstand,
  wardrobe: buildStorageCabinet,
  dresser: buildStorageCabinet,
  sideboard: buildStorageCabinet,
  vanity: buildVanity,
  tv: buildTvUnit,
  bookcase: buildBookcase,
  counter: buildCounter,
  fridge: buildFridge,
  washer: buildWasher,
  shower: buildShower,
  bathtub: buildBathtub,
  toilet: buildToilet,
  basin: buildBasin,
  plant: buildPlant,
  rug: buildRug,
};

/**
 * Renders blueprint mode furniture using crisp extruded 2D-matched silhouettes and edge lines.
 */
function buildBlueprintFurniture({ THREE, furnGroup, furniture, selId, M }) {
  for (const it of furniture) {
    if (!it) continue;
    const sel = it.id === selId;
    for (const p of furnParts(it)) {
      const depth = Math.max(0.001, p.z1 - p.z0);
      const shape = new THREE.Shape(
        p.pts.map(([lx, ly]) => new THREE.Vector2(...furnToPlan(it, lx, ly))),
      );
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      geo.translate(0, p.z1, 0);

      const mesh = new THREE.Mesh(geo, [sel ? M.selTop : M.fTop, M.fSide]);
      mesh.userData.id = it.id;

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        sel ? M.selEdge : M.edge,
      );
      furnGroup.add(mesh, edges);
    }
  }
}

/**
 * Disposes old furniture geometries (and owned realistic materials) and rebuilds
 * all 3D furniture meshes for either Realistic or Blueprint mode.
 */
export function buildFurniture3D({
  THREE,
  furnGroup,
  furniture = [],
  selId = null,
  M,
  renderMode,
  sceneStyle = null,
  texManager = null,
}) {
  if (!furnGroup || !THREE) return;
  clearFurnitureGroup(furnGroup);

  const items = furniture || [];
  if (!items.length) return;

  const effectiveMode = renderMode ?? sceneStyle?.renderMode ?? 'realistic';
  if (effectiveMode === 'blueprint') {
    buildBlueprintFurniture({ THREE, furnGroup, furniture: items, selId, M });
    return;
  }

  const shared = createDetailMaterials(THREE, M, texManager);
  const contactMaterial = items.some(it => it && it.type !== 'rug' && it.type !== 'shower')
    ? createContactShadowMaterial(THREE)
    : null;
  const rugs = items.filter(it => it?.type === 'rug').map(it => {
    const angle = (Number(it.rot) || 0) * Math.PI / 180;
    return {
      x: Number(it.x) || 0,
      z: Number(it.y) || 0,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      halfL: Number(it.L) / 2 - 0.016,
      halfW: Number(it.W) / 2 - 0.016,
    };
  });

  for (const it of items) {
    if (!it) continue;

    const itemGroup = new THREE.Group();
    itemGroup.position.set(Number(it.x) || 0, 0, Number(it.y) || 0);
    itemGroup.rotation.y = -((Number(it.rot) || 0) * Math.PI) / 180;
    itemGroup.userData.id = it.id;

    const { primaryMat, accentMat } = createItemMaterials(THREE, texManager, it, shared);
    const contact = (w, d, lx, lz, opacity) =>
      addContactShadow(THREE, itemGroup, contactMaterial, it, rugs, w, d, lx, lz, opacity);
    const ctx = createItemContext({ THREE, it, itemGroup, primaryMat, accentMat, shared, contact });
    const builder = FURNITURE_BUILDERS[it.type];

    if (builder) {
      builder(ctx);
    } else {
      ctx.addBox(ctx.L, 0.5, ctx.W, 0, 0, 0, primaryMat);
    }

    if (!['lsofa', 'rug', 'shower'].includes(it.type)) {
      contact(ctx.L + 0.19, ctx.W + 0.19, 0, 0, it.type === 'coffee' ? 0.13 : 0.25);
    }

    if (it.id === selId) {
      const boxH = ctx.getMaxH() + 0.04;
      const selGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(ctx.L + 0.04, boxH, ctx.W + 0.04));
      const selBox = new THREE.LineSegments(selGeo, shared.selEdge);
      selBox.position.set(0, boxH / 2 + 0.004, 0);
      itemGroup.add(selBox);
    }

    furnGroup.add(itemGroup);
  }
}
