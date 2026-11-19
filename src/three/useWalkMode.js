/**
 * First-person Walk mode controller: eye-height camera glide, collision sliding,
 * keyboard / pad movement, head-look drag, bump hints, and dynamic 2D minimap.
 */

import { H3 } from '../data/openingSpecs.js';
import { FURNITURE_BY_TYPE } from '../data/furnitureCatalog.js';
import {
  getRoomRects,
  insideAny,
  roomAt,
  computePlanGeometry,
} from '../core/walls.js';
import { P } from '../core/openings.js';
import { wallPieces, inSide, isExteriorDoor } from './buildWallsAndFloors3D.js';

export const WALK = { eye: 1.6, r: 0.22, speed: 1.3, fast: 2.6, turn: 1.9, fov: 62 };

const LOOK_SENSITIVITY = 0.0035;
const RAIL_HALF_T = 0.02;
const ENTRANCE_ROOM_PATTERN = /entrance|lobby|مدخل|بهو/i;
const KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyQ: 'left',
  ArrowRight: 'right',
  KeyE: 'right',
  KeyA: 'sl',
  KeyD: 'sr',
  ShiftLeft: 'fast',
  ShiftRight: 'fast',
  Shift: 'fast',
};

const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function makeBox(x0, y0, x1, y1, kind, h) {
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    hx: (x1 - x0) / 2,
    hy: (y1 - y0) / 2,
    c: 1,
    s: 0,
    kind,
    h,
  };
}

function pushOut(b, x, y) {
  const vx = x - b.cx;
  const vy = y - b.cy;
  const r = WALK.r;
  let lx = vx * b.c + vy * b.s;
  let ly = -vx * b.s + vy * b.c;
  const dx = lx - Math.max(-b.hx, Math.min(b.hx, lx));
  const dy = ly - Math.max(-b.hy, Math.min(b.hy, ly));
  const d = Math.hypot(dx, dy);
  if (d >= r - 1e-9) return null;
  if (d > 1e-9) {
    lx += (dx * (r - d)) / d;
    ly += (dy * (r - d)) / d;
  } else if (b.hx - Math.abs(lx) < b.hy - Math.abs(ly)) {
    lx = (lx < 0 ? -1 : 1) * (b.hx + r);
  } else {
    ly = (ly < 0 ? -1 : 1) * (b.hy + r);
  }
  return [b.cx + lx * b.c - ly * b.s, b.cy + lx * b.s + ly * b.c];
}

export function createWalkController({
  THREE,
  camera,
  controls,
  mapCanvasRef,
  getState,
  onNeedRender,
  onRoomChange,
  onWalkingChange,
  onHint,
}) {
  const me = { x: 0, y: 0, yaw: 0, pitch: -0.06 };
  const keyHeld = new Set();
  const padHeld = new Set();
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');

  let cols = { walls: [], items: [] };
  let walking = false;
  let saved = null;
  let wAnim = null;
  let currentRoomId = null;
  let bumpT = 0;

  const isHeld = dir => keyHeld.has(dir) || padHeld.has(dir);
  const qOf = (pitch, yaw) => new THREE.Quaternion().setFromEuler(eul.set(pitch, yaw, 0, 'YXZ'));

  function walkIn(x, y) {
    const { rooms = [] } = getState();
    return rooms.some(
      r =>
        r &&
        r.kind !== 'void' &&
        getRoomRects(r).some(
          ([x0, y0, w, h]) =>
            x >= x0 - 1e-6 &&
            x <= x0 + w + 1e-6 &&
            y >= y0 - 1e-6 &&
            y <= y0 + h + 1e-6,
        ),
    );
  }

  function findRoomAt(x, y) {
    const { rooms = [] } = getState();
    const r = roomAt(rooms, x, y);
    return r && r.kind !== 'void' ? r.id : null;
  }

  function placeEye() {
    camera.position.set(me.x, WALK.eye, me.y);
    camera.quaternion.copy(qOf(me.pitch, me.yaw));
    onNeedRender?.();
  }

  function adjustFov(factor) {
    const targetFov = factor > 1 || factor < 1 ? camera.fov * factor : camera.fov;
    camera.fov = Math.max(30, Math.min(85, targetFov));
    camera.updateProjectionMatrix();
    onNeedRender?.();
  }

  function setFov(fov) {
    camera.fov = Math.max(30, Math.min(85, fov));
    camera.updateProjectionMatrix();
    onNeedRender?.();
  }

  function syncRoom() {
    const id = findRoomAt(me.x, me.y);
    if (id !== currentRoomId) {
      currentRoomId = id;
    }
    onRoomChange?.(id, { x: me.x, y: me.y });
  }

  function settle(x, y) {
    let hit = null;
    const all = cols.walls.concat(cols.items);
    for (let i = 0; i < 6; i++) {
      let moved = false;
      for (const b of all) {
        const p = pushOut(b, x, y);
        if (p) {
          x = p[0];
          y = p[1];
          moved = true;
          hit = b;
        }
      }
      if (!moved) break;
    }
    return { x, y, hit };
  }

  function stepBy(dx, dy) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.04));
    let hit = null;
    for (let i = 0; i < n; i++) {
      const s = settle(me.x + dx / n, me.y + dy / n);
      if (!walkIn(s.x, s.y)) {
        hit = hit || { kind: 'wall' };
        break;
      }
      if (s.hit) hit = s.hit;
      me.x = s.x;
      me.y = s.y;
    }
    return hit;
  }

  function unstick() {
    if (!walking || wAnim) return;
    const s = settle(me.x, me.y);
    if (walkIn(s.x, s.y) && (s.x !== me.x || s.y !== me.y)) {
      me.x = s.x;
      me.y = s.y;
      placeEye();
      syncRoom();
    }
  }

  function isFree(x, y) {
    return walkIn(x, y) && !cols.walls.concat(cols.items).some(b => pushOut(b, x, y));
  }

  function freeNear(x, y) {
    if (isFree(x, y)) return [x, y];
    const home = findRoomAt(x, y);
    for (const same of [true, false]) {
      for (let rr = 0.1; rr < 3; rr += 0.1) {
        for (let k = 0; k < 24; k++) {
          const px = x + rr * Math.cos((k * Math.PI) / 12);
          const py = y + rr * Math.sin((k * Math.PI) / 12);
          if ((!same || findRoomAt(px, py) === home) && isFree(px, py)) {
            return [px, py];
          }
        }
      }
    }
    return [x, y];
  }

  function rebuildCollisions() {
    const {
      rooms = [],
      openEdges = [],
      openings = [],
      furniture = [],
      geometry,
      sceneStyle,
    } = getState();
    const geom = geometry || computePlanGeometry(rooms, openEdges);
    const wallT =
      sceneStyle && sceneStyle.renderMode !== 'blueprint'
        ? Math.max(0.04, Math.min(0.35, Number(sceneStyle.wallThickness) || 0.12))
        : H3.t;
    const halfT = wallT / 2;
    const walls = [];

    for (const p of wallPieces(geom.indoorRuns || [], openings, wallT)) {
      if (p.y0 > 1) continue;
      walls.push(
        p.o === 'h'
          ? makeBox(p.a, p.c - halfT, p.b, p.c + halfT, 'wall', p.y1)
          : makeBox(p.c - halfT, p.a, p.c + halfT, p.b, 'wall', p.y1),
      );
    }

    for (const op of openings || []) {
      if (!op || op.kind === 'window' || !isExteriorDoor(op, rooms)) continue;
      walls.push(
        op.o === 'h'
          ? makeBox(op.a1, op.c - halfT, op.a2, op.c + halfT, 'door', H3.door)
          : makeBox(op.c - halfT, op.a1, op.c + halfT, op.a2, 'door', H3.door),
      );
    }

    for (const pts of geom.railings || []) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        walls.push(
          makeBox(
            Math.min(ax, bx) - RAIL_HALF_T,
            Math.min(ay, by) - RAIL_HALF_T,
            Math.max(ax, bx) + RAIL_HALF_T,
            Math.max(ay, by) + RAIL_HALF_T,
            'rail',
            H3.rail,
          ),
        );
      }
    }

    const items = (furniture || [])
      .filter(it => it && FURNITURE_BY_TYPE[it.type] && !FURNITURE_BY_TYPE[it.type].under)
      .map(it => {
        const a = (it.rot * Math.PI) / 180;
        return {
          cx: it.x,
          cy: it.y,
          hx: it.L / 2,
          hy: it.W / 2,
          c: Math.cos(a),
          s: Math.sin(a),
          kind: 'item',
          type: it.type,
        };
      });

    cols = { walls, items };
    unstick();
    onNeedRender?.();
  }

  function findEntrance() {
    const { rooms = [], openEdges = [], openings = [], geometry } = getState();
    const geom = geometry || computePlanGeometry(rooms, openEdges);
    const bounds = geom.bounds || { minX: 0, minY: 0, maxX: 14, maxY: 11, centerX: 7, centerY: 5.5 };
    const refX = bounds.centerX;
    const refY = bounds.maxY;

    const extDoors = (openings || [])
      .filter(op => op && op.kind === 'door' && isExteriorDoor(op, rooms))
      .map(op => {
        const mid = (op.a1 + op.a2) / 2;
        let sd = inSide(op, rooms);
        if (!sd) {
          sd = insideAny(rooms, ...P(op.o, mid, op.c + 0.2)) ? 1 : -1;
        }
        const [x, y] = P(op.o, mid, op.c);
        const insideRoom = roomAt(rooms, ...P(op.o, mid, op.c + sd * 0.2));
        const preferred = Boolean(
          insideRoom && ENTRANCE_ROOM_PATTERN.test(`${insideRoom.en || ''} ${insideRoom.ar || ''}`),
        );
        return {
          op,
          mid,
          sd,
          preferred,
          d: Math.hypot(x - refX, y - refY),
        };
      })
      .sort((p, q) => {
        if (p.preferred !== q.preferred) return p.preferred ? -1 : 1;
        return p.d - q.d;
      });

    const chosen = extDoors[0];
    if (chosen) {
      const [x, y] = P(chosen.op.o, chosen.mid, chosen.op.c + chosen.sd * 0.55);
      const [fx, fy] = P(chosen.op.o, 0, chosen.sd);
      return { x, y, yaw: Math.atan2(-fx, -fy) || 0 };
    }

    // Fallback: center of the first indoor room/hall (or first non-void room), facing +Z
    const firstIndoor =
      rooms.find(r => r && (r.kind === 'room' || r.kind === 'hall') && getRoomRects(r).length > 0) ||
      rooms.find(r => r && r.kind !== 'void' && getRoomRects(r).length > 0);
    if (firstIndoor) {
      const [rx, ry, rw, rh] = getRoomRects(firstIndoor)[0];
      return { x: rx + rw / 2, y: ry + rh / 2, yaw: Math.PI };
    }

    return { x: bounds.centerX, y: bounds.centerY, yaw: Math.PI };
  }

  function glide(p1, q1, f1, done, ms) {
    const { reducedMotion } = getState();
    if (reducedMotion) {
      wAnim = null;
      camera.position.copy(p1);
      camera.quaternion.copy(q1);
      setFov(f1);
      done();
      return;
    }
    wAnim = {
      p0: camera.position.clone(),
      q0: camera.quaternion.clone(),
      f0: camera.fov,
      p1,
      q1,
      f1,
      s: performance.now(),
      ms,
      done,
    };
  }

  function resetToEntrance(instant = false) {
    const e = findEntrance();
    const [x, y] = freeNear(e.x, e.y);
    Object.assign(me, { x, y, yaw: e.yaw, pitch: -0.06 });
    const entranceFov = getState().sceneStyle?.renderMode === 'realistic' ? 54 : WALK.fov;
    const done = () => {
      setFov(entranceFov);
      placeEye();
      syncRoom();
    };
    if (instant) {
      wAnim = null;
      done();
    } else {
      glide(new THREE.Vector3(x, WALK.eye, y), qOf(me.pitch, me.yaw), entranceFov, done, 900);
    }
  }

  function setWalk(on, instant = false) {
    on = Boolean(on);
    if (on === walking) return;
    keyHeld.clear();
    padHeld.clear();
    bumpT = 0;
    onHint?.(null);

    if (on) {
      saved =
        wAnim && wAnim.back
          ? wAnim.back
          : { pos: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      camera.far = 60;
      walking = true;
      onWalkingChange?.(true);
      resetToEntrance(instant);
    } else {
      walking = false;
      onWalkingChange?.(false);
      const { getHomePose } = getState();
      const s = saved || (typeof getHomePose === 'function' ? getHomePose() : null) || {
        pos: new THREE.Vector3(4, 13.2, 20.5),
        target: new THREE.Vector3(7, 0, 6.1),
      };
      saved = null;
      currentRoomId = null;
      onRoomChange?.(null, null);

      const done = () => {
        camera.position.copy(s.pos);
        controls.target.copy(s.target);
        camera.far = 200;
        setFov(40);
        controls.enabled = true;
        controls.update();
        onNeedRender?.();
      };

      if (instant) {
        wAnim = null;
        done();
      } else {
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(s.pos, s.target, camera.up),
        );
        glide(s.pos.clone(), targetQuat, 40, done, 700);
        if (wAnim) wAnim.back = s;
      }
    }
    onNeedRender?.();
  }

  function bump(b) {
    const now = performance.now();
    if (b) {
      bumpT = now;
      onHint?.({ kind: b.kind, type: b.type });
    } else if (bumpT && now - bumpT > 1400) {
      bumpT = 0;
      onHint?.(null);
    }
  }

  function stepTransition(now) {
    if (!wAnim) return false;
    const k = Math.min(1, Math.max(0, (now - wAnim.s) / wAnim.ms));
    const e = ease(k);
    camera.position.lerpVectors(wAnim.p0, wAnim.p1, e);
    camera.quaternion.slerpQuaternions(wAnim.q0, wAnim.q1, e);
    camera.fov = wAnim.f0 + (wAnim.f1 - wAnim.f0) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) {
      const done = wAnim.done;
      wAnim = null;
      done();
    }
    return true;
  }

  function stepWalk(dt) {
    const f = (isHeld('up') ? 1 : 0) - (isHeld('down') ? 1 : 0);
    const st = (isHeld('sr') ? 1 : 0) - (isHeld('sl') ? 1 : 0);
    const tr = (isHeld('left') ? 1 : 0) - (isHeld('right') ? 1 : 0);
    let moved = false;
    let hit = null;

    if (tr) {
      me.yaw += tr * WALK.turn * dt;
      moved = true;
    }
    if (f || st) {
      const sp = ((isHeld('fast') ? WALK.fast : WALK.speed) * dt) / Math.hypot(f, st);
      const sy = Math.sin(me.yaw);
      const cy = Math.cos(me.yaw);
      const dx = (-sy * f + cy * st) * sp;
      const dy = (-cy * f - sy * st) * sp;
      const x0 = me.x;
      const y0 = me.y;
      hit = stepBy(dx, dy);
      const denom = dx * dx + dy * dy;
      const prog = denom ? ((me.x - x0) * dx + (me.y - y0) * dy) / denom : 1;
      if (me.x !== x0 || me.y !== y0) moved = true;
      if (prog > 0.35) hit = null;
    }

    bump(hit);
    if (moved) {
      placeEye();
      syncRoom();
    }
    return moved;
  }

  function handleWalkKey(e, isDown) {
    const k = KEYS[e.code] || KEYS[e.key];
    if (!k) return false;
    if (!isDown) {
      keyHeld.delete(k);
      return true;
    }
    if (!walking) return false;
    keyHeld.add(k);
    return true;
  }

  function setPadHeld(dir, isDown) {
    if (!dir) return;
    if (isDown) padHeld.add(dir);
    else padHeld.delete(dir);
  }

  function clearInputs() {
    keyHeld.clear();
    padHeld.clear();
  }

  function handleWalkLookDrag(dx, dy) {
    if (!walking || wAnim) return;
    me.yaw += dx * LOOK_SENSITIVITY;
    me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch + dy * LOOK_SENSITIVITY));
    placeEye();
  }

  function drawMinimap(MC) {
    const mapCv = mapCanvasRef?.value ?? mapCanvasRef;
    if (!mapCv || !MC) return;
    const mctx = mapCv.getContext('2d');
    if (!mctx) return;

    const { rooms = [], openEdges = [], furniture = [], geometry } = getState();
    const geom = geometry || computePlanGeometry(rooms, openEdges);
    const b = geom.bounds || { minX: 0, minY: 0, maxX: 14, maxY: 11 };
    const ext = [b.minX, b.minY, b.maxX, b.maxY];
    const spanX = Math.max(2, ext[2] - ext[0]);
    const spanY = Math.max(2, ext[3] - ext[1]);

    const MW = 168;
    const PAD = 0.3;
    const mk = MW / (spanX + 2 * PAD);
    const MH = Math.max(48, Math.round((spanY + 2 * PAD) * mk));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.round(MW * dpr);
    const targetH = Math.round(MH * dpr);

    if (mapCv.width !== targetW || mapCv.height !== targetH) {
      mapCv.width = targetW;
      mapCv.height = targetH;
      mapCv.style.height = `${MH}px`;
    }

    const px = 1 / mk;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mapCv.width, mapCv.height);
    mctx.setTransform(
      dpr * mk,
      0,
      0,
      dpr * mk,
      (PAD - ext[0]) * dpr * mk,
      (PAD - ext[1]) * dpr * mk,
    );

    // Draw void rooms first, then active spaces
    for (const r of rooms) {
      if (!r || r.kind !== 'void') continue;
      mctx.fillStyle = MC.faint;
      for (const [x, y, w, h] of getRoomRects(r)) {
        mctx.fillRect(x, y, w, h);
      }
    }

    for (const r of rooms) {
      if (!r || r.kind === 'void') continue;
      mctx.fillStyle = r.kind === 'terrace' || r.id === currentRoomId ? MC.raise : MC.floor;
      for (const [x, y, w, h] of getRoomRects(r)) {
        mctx.fillRect(x, y, w, h);
      }
    }

    mctx.fillStyle = MC.piece;
    for (const it of furniture || []) {
      if (!it || !FURNITURE_BY_TYPE[it.type] || FURNITURE_BY_TYPE[it.type].under) continue;
      mctx.save();
      mctx.translate(it.x, it.y);
      mctx.rotate((it.rot * Math.PI) / 180);
      mctx.fillRect(-it.L / 2, -it.W / 2, it.L, it.W);
      mctx.restore();
    }

    for (const box of cols.walls) {
      mctx.fillStyle = box.kind === 'wall' && box.h > 1 ? MC.ink : MC.mid;
      const hx = Math.max(box.hx, 0.7 * px);
      const hy = Math.max(box.hy, 0.7 * px);
      mctx.fillRect(box.cx - hx, box.cy - hy, 2 * hx, 2 * hy);
    }

    const hf = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * (camera.aspect || 1.2));
    const a0 = Math.atan2(-Math.cos(me.yaw), -Math.sin(me.yaw));
    mctx.beginPath();
    mctx.moveTo(me.x, me.y);
    mctx.arc(me.x, me.y, 1.8, a0 - hf, a0 + hf);
    mctx.closePath();
    mctx.fillStyle = MC.cone;
    mctx.fill();

    mctx.beginPath();
    mctx.arc(me.x, me.y, 3.4 * px, 0, 2 * Math.PI);
    mctx.fillStyle = MC.ink;
    mctx.fill();
  }

  const onBlur = () => clearInputs();
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', onBlur);
  }

  function dispose() {
    clearInputs();
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', onBlur);
    }
  }

  return {
    WALK,
    isWalking: () => walking,
    isAnimating: () => Boolean(wAnim),
    currentRoomId: () => currentRoomId,
    currentPos: () => ({ x: me.x, y: me.y, yaw: me.yaw, pitch: me.pitch }),
    forwardCenter: (dist = 1.2) => ({
      x: me.x - Math.sin(me.yaw) * dist,
      y: me.y - Math.cos(me.yaw) * dist,
    }),
    rebuildCollisions,
    findEntrance,
    setWalk,
    resetToEntrance,
    stepTransition,
    stepWalk,
    stepBy,
    settle,
    unstick,
    handleWalkKey,
    setPadHeld,
    clearInputs,
    handleWalkLookDrag,
    adjustFov,
    drawMinimap,
    dispose,
  };
}
