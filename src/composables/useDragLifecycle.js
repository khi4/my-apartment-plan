/**
 * Singleton drag lifecycle composable for 2D/3D palette drops, room drawing,
 * room move/resize with magnetic snapping, opening move, and furniture move/resize.
 */

import { ref, computed } from 'vue';
import { m, r2, snapTo, step, clampSize } from '../core/scale.js';
import { near, getRoomRects, computePlanGeometry } from '../core/walls.js';
import { snapRoomMove, snapRoomResize, roomsOverlap, findFreeRoomSpot } from '../core/roomSnap.js';
import {
  sameLine,
  alongOf,
  snapOp,
  freeSpot,
  fixSide,
  thumbOp,
} from '../core/openings.js';
import { moveBlocked } from '../core/clearance.js';
import { thumbSvg } from '../core/furnitureShapes2D.js';
import { OPK } from '../data/openingSpecs.js';
import { usePlanStore } from '../stores/usePlanStore.js';
import { useUiStore } from '../stores/useUiStore.js';
import { useI18n } from '../i18n/useI18n.js';

const HINT_OP_KEYS = {
  far: 'hintOpFar',
  short: 'hintOpShort',
  taken: 'hintOpTaken',
  end: 'hintOpEnd',
  none: 'hintOpNone',
};

const dragCtx = {
  svgRef: null,
  toPlan: null,
  over2d: null,
  view3dRef: null,
  floorPoint3d: null,
  over3d: null,
  getPlanGeometry: null,
};

const dragChip = ref(null); // { x, y, svgHtml, visible }
const ghostRoom = ref(null); // { x, y, w, h, kind, en, ar, overlap }
const ghostOp = ref(null); // { op, ok }
const ghostFurn = ref(null); // { type, L, W, x, y }
const snapGuides = ref([]); // Array<{ o: 'h'|'v', c, a1, a2 }>
const activeDrag = ref(null);
const isDragging = computed(() => Boolean(activeDrag.value));

function getGeom() {
  const provided = dragCtx.getPlanGeometry?.();
  if (provided) return provided;
  const { rooms, openEdges } = usePlanStore();
  return computePlanGeometry(rooms.value, openEdges.value);
}

function showOpHint(why, stay = false) {
  const { setHint } = useUiStore();
  const { t } = useI18n();
  if (!why) {
    setHint(null);
    return;
  }
  const key = HINT_OP_KEYS[why] || 'hintOpTaken';
  setHint(t(key), stay ? 0 : 1600);
}

function showBlockedHint(on) {
  const { setHint } = useUiStore();
  const { t } = useI18n();
  setHint(on ? t('hintBlocked') : null, 0);
}

function roomChipHtml(preset, across, deep) {
  const w = Math.max(0.4, across);
  const h = Math.max(0.4, deep);
  const pad = Math.max(w, h) * 0.14;
  const vb = `${m(-pad)} ${m(-pad)} ${m(w + 2 * pad)} ${m(h + 2 * pad)}`;
  const floorCls =
    preset.kind === 'terrace'
      ? 'floor terr'
      : preset.kind === 'hall'
        ? 'floor hall'
        : preset.kind === 'void'
          ? 'floor void'
          : 'floor';
  const edgeCls = preset.kind === 'terrace' ? 'rail' : 'wall';
  const xLines =
    preset.kind === 'void'
      ? `<line x1="0" y1="0" x2="${m(w)}" y2="${m(h)}" class="x-line"/><line x1="${m(w)}" y1="0" x2="0" y2="${m(h)}" class="x-line"/>`
      : '';
  return `<svg viewBox="${vb}" aria-hidden="true"><rect x="0" y="0" width="${m(w)}" height="${m(h)}" class="${floorCls}"/>${xLines}<rect x="0" y="0" width="${m(w)}" height="${m(h)}" class="${edgeCls}"/></svg>`;
}

function snapDrawPoint(pt, rooms, stepSize, anchorX = null, anchorY = null, threshold = 0.2) {
  const rects = [];
  for (const r of rooms || []) {
    for (const rr of getRoomRects(r)) rects.push(rr);
  }

  let bestX = null;
  let bestY = null;
  for (const [ox, oy, ow, oh] of rects) {
    for (const tx of [ox, ox + ow]) {
      const dx = Math.abs(pt.x - tx);
      if (dx <= threshold && (!bestX || dx < bestX.d)) {
        bestX = { d: dx, val: tx, oy, oh };
      }
    }
    for (const ty of [oy, oy + oh]) {
      const dy = Math.abs(pt.y - ty);
      if (dy <= threshold && (!bestY || dy < bestY.d)) {
        bestY = { d: dy, val: ty, ox, ow };
      }
    }
  }

  const x = r2(bestX ? bestX.val : snapTo(pt.x, stepSize));
  const y = r2(bestY ? bestY.val : snapTo(pt.y, stepSize));
  const guides = [];

  if (bestX) {
    const yLo = anchorY != null ? Math.min(y, anchorY) : y;
    const yHi = anchorY != null ? Math.max(y, anchorY) : y;
    guides.push({
      o: 'v',
      c: r2(bestX.val),
      a1: r2(Math.min(yLo, bestX.oy)),
      a2: r2(Math.max(yHi, bestX.oy + bestX.oh)),
    });
  }
  if (bestY) {
    const xLo = anchorX != null ? Math.min(x, anchorX) : x;
    const xHi = anchorX != null ? Math.max(x, anchorX) : x;
    guides.push({
      o: 'h',
      c: r2(bestY.val),
      a1: r2(Math.min(xLo, bestY.ox)),
      a2: r2(Math.max(xHi, bestY.ox + bestY.ow)),
    });
  }

  return { x, y, guides };
}

function clearFeedback() {
  dragChip.value = null;
  ghostRoom.value = null;
  ghostOp.value = null;
  ghostFurn.value = null;
  snapGuides.value = [];
}

function isNewMode(mode) {
  return mode === 'newRoom' || mode === 'newOp' || mode === 'newFurn' || mode === 'drawRoom';
}

// ---- Move handlers ----

function moveNewRoom(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'newRoom') return;
  const { rooms } = usePlanStore();
  const { is3d } = useUiStore();
  const over = !is3d.value && Boolean(dragCtx.over2d?.(e));

  dragChip.value = {
    x: e.clientX,
    y: e.clientY,
    svgHtml: d.svgHtml,
    visible: !over,
  };

  if (!over || !dragCtx.toPlan) {
    ghostRoom.value = null;
    snapGuides.value = [];
    d.cand = null;
    return;
  }

  const p = dragCtx.toPlan(e);
  const st = step(e);
  const rawX = p.x - d.across / 2;
  const rawY = p.y - d.deep / 2;
  const sn = snapRoomMove([rawX, rawY, d.across, d.deep], rooms.value, st);
  const candRect = [sn.x, sn.y, sn.w, sn.h];
  const overlap = rooms.value.some(r =>
    getRoomRects(r).some(rr => roomsOverlap(candRect, rr)),
  );

  ghostRoom.value = {
    x: sn.x,
    y: sn.y,
    w: sn.w,
    h: sn.h,
    kind: d.preset.kind,
    en: d.preset.en,
    ar: d.preset.ar,
    overlap,
  };
  snapGuides.value = sn.guides;
  d.cand = {
    x: sn.x,
    y: sn.y,
    across: sn.w,
    deep: sn.h,
    preset: d.preset,
  };
}

function endNewRoom(d, cancel) {
  clearFeedback();
  if (cancel || !d?.cand) return;
  const { addRoom } = usePlanStore();
  const { select } = useUiStore();
  const created = addRoom({
    kind: d.cand.preset.kind,
    en: d.cand.preset.en,
    ar: d.cand.preset.ar,
    x: d.cand.x,
    y: d.cand.y,
    across: d.cand.across,
    deep: d.cand.deep,
  });
  if (created) select('room', created.id);
}

function moveNewOp(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'newOp') return;
  const { rooms, openings } = usePlanStore();
  const { is3d } = useUiStore();

  const over = is3d.value ? Boolean(dragCtx.over3d?.(e)) : Boolean(dragCtx.over2d?.(e));
  const p = !over
    ? null
    : is3d.value
      ? dragCtx.floorPoint3d?.(e)
      : dragCtx.toPlan?.(e);

  const geom = getGeom();
  const sn = p ? snapOp(p, d.width, step(e), geom.SEGS, openings.value, null) : null;
  d.cand = sn && sn.ok ? sn : null;

  const why = p ? (sn.ok ? null : sn.why) : null;
  if (why !== d.why) {
    d.why = why;
    showOpHint(why, true);
  }

  const onWall = !is3d.value && sn && sn.a1 != null;
  dragChip.value = {
    x: e.clientX,
    y: e.clientY,
    svgHtml: d.svgHtml,
    visible: !onWall,
  };

  if (onWall) {
    const op = {
      kind: d.opKind,
      o: sn.o,
      c: sn.c,
      a1: sn.a1,
      a2: sn.a2,
      hs: true,
      side: 1,
    };
    fixSide(op, rooms.value, sn.across ? Math.sign(sn.across) : 1);
    ghostOp.value = { op, ok: Boolean(sn.ok) };
  } else {
    ghostOp.value = null;
  }
}

function endNewOp(d, cancel) {
  clearFeedback();
  if (d?.why) showOpHint(null);
  if (cancel || !d?.cand) return;
  const { rooms, addOpening } = usePlanStore();
  const { select } = useUiStore();
  const op = {
    kind: d.opKind,
    o: d.cand.o,
    c: d.cand.c,
    a1: d.cand.a1,
    a2: d.cand.a2,
    hs: true,
    side: 1,
  };
  fixSide(op, rooms.value, d.cand.across ? Math.sign(d.cand.across) : 1);
  const created = addOpening(op);
  if (created) select('opening', created.id);
}

function moveNewFurn(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'newFurn') return;
  const { is3d } = useUiStore();

  const over = is3d.value ? Boolean(dragCtx.over3d?.(e)) : Boolean(dragCtx.over2d?.(e));

  if (is3d.value) {
    const p = over ? dragCtx.floorPoint3d?.(e) : null;
    const st = step(e);
    d.over = Boolean(p);
    d.pos = p ? { x: snapTo(p.x, st), y: snapTo(p.y, st) } : null;
    dragChip.value = {
      x: e.clientX,
      y: e.clientY,
      svgHtml: d.svgHtml,
      visible: true,
    };
    ghostFurn.value = null;
    return;
  }

  d.over = over;
  dragChip.value = {
    x: e.clientX,
    y: e.clientY,
    svgHtml: d.svgHtml,
    visible: !over,
  };

  if (over && dragCtx.toPlan) {
    const p = dragCtx.toPlan(e);
    const st = step(e);
    d.pos = { x: snapTo(p.x, st), y: snapTo(p.y, st) };
    ghostFurn.value = {
      type: d.type,
      L: d.L,
      W: d.W,
      x: d.pos.x,
      y: d.pos.y,
    };
  } else {
    d.pos = null;
    ghostFurn.value = null;
  }
}

function endNewFurn(d, cancel) {
  clearFeedback();
  if (cancel || !d?.over || !d?.pos) return;
  const { addFurniture } = usePlanStore();
  const { select } = useUiStore();
  const created = addFurniture({
    type: d.type,
    L: d.L,
    W: d.W,
    x: d.pos.x,
    y: d.pos.y,
    rot: 0,
    flip: false,
  });
  if (created) select('furniture', created.id);
}

function moveDrawRoom(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'drawRoom' || !dragCtx.toPlan) return;
  const { rooms } = usePlanStore();
  const { setRoomDraft } = useUiStore();

  const p = dragCtx.toPlan(e);
  const st = step(e);
  const sn = snapDrawPoint(p, rooms.value, st, d.startX, d.startY);
  const x = r2(Math.min(d.startX, sn.x));
  const y = r2(Math.min(d.startY, sn.y));
  const w = r2(Math.abs(sn.x - d.startX));
  const h = r2(Math.abs(sn.y - d.startY));

  setRoomDraft({ x, y, w, h });
  snapGuides.value = sn.guides;
}

function endDrawRoom(d, cancel) {
  const { rooms, addRoom } = usePlanStore();
  const { roomDraft, setRoomDraft, setTool, select } = useUiStore();
  const draft = roomDraft.value;
  setRoomDraft(null);
  snapGuides.value = [];

  if (cancel || !draft || draft.w < 0.4 || draft.h < 0.4) return;
  const n = rooms.value.length + 1;
  const created = addRoom({
    kind: 'room',
    en: `Room ${n}`,
    ar: `غرفة ${n}`,
    x: draft.x,
    y: draft.y,
    across: draft.w,
    deep: draft.h,
  });
  setTool('select');
  if (created) select('room', created.id);
}

function moveExistingRoom(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'moveRoom' || !dragCtx.toPlan) return;
  if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < 3) {
    return;
  }
  const { rooms, snapshot, updateRoomRect } = usePlanStore();
  if (!d.snapshotted) {
    snapshot();
    d.snapshotted = true;
  }
  const p = dragCtx.toPlan(e);
  const st = step(e);
  const otherRooms = rooms.value.filter(r => r.id !== d.roomId);
  const rawX = d.origRect[0] + (p.x - d.startPt.x);
  const rawY = d.origRect[1] + (p.y - d.startPt.y);
  const res = snapRoomMove([rawX, rawY, d.origRect[2], d.origRect[3]], otherRooms, st);

  updateRoomRect(d.roomId, d.rectIdx, [res.x, res.y, res.w, res.h], {
    record: false,
    save: false,
  });
  snapGuides.value = res.guides;
  d.moved = true;
}

function moveResizeRoom(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'resizeRoom' || !dragCtx.toPlan) return;
  if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < 2) {
    return;
  }
  const { rooms, snapshot, updateRoomRect } = usePlanStore();
  if (!d.snapshotted) {
    snapshot();
    d.snapshotted = true;
  }
  const p = dragCtx.toPlan(e);
  const st = step(e);
  const otherRooms = rooms.value.filter(r => r.id !== d.roomId);
  const res = snapRoomResize(d.origRect, d.dir, p, otherRooms, st);

  updateRoomRect(d.roomId, d.rectIdx, res.rect, {
    record: false,
    save: false,
  });
  snapGuides.value = res.guides;
  d.moved = true;
}

function moveExistingOp(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'moveOp' || !dragCtx.toPlan) return;
  if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < 3) {
    return;
  }
  const { rooms, openings, snapshot, updateOpening } = usePlanStore();
  const op = openings.value.find(o => o.id === d.opId);
  if (!op) return;

  const p = dragCtx.toPlan(e);
  const w = op.a2 - op.a1;
  const geom = getGeom();
  const sn = snapOp(p, w, step(e), geom.SEGS, openings.value, op.id, d.offA, d.offO);

  if (!sn.ok) {
    if (d.why !== sn.why) {
      d.why = sn.why;
      showOpHint(sn.why, true);
    }
    return;
  }
  if (d.why) {
    d.why = null;
    showOpHint(null);
  }
  if (sameLine(sn, op) && near(sn.a1, op.a1)) return;

  if (!d.snapshotted) {
    snapshot();
    d.snapshotted = true;
  }
  const turned = !sameLine(sn, op);
  const patch = {
    o: sn.o,
    c: sn.c,
    a1: sn.a1,
    a2: sn.a2,
  };
  if (turned) {
    const cand = { ...op, ...patch };
    patch.side = fixSide(cand, rooms.value, op.side);
  }
  updateOpening(op.id, patch, { record: false, save: false });
  d.moved = true;
}

function moveExistingFurn(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'moveFurn' || !dragCtx.toPlan) return;
  if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < 3) {
    return;
  }
  const { furniture, snapshot, updateFurniture } = usePlanStore();
  const it = furniture.value.find(i => i.id === d.itemId);
  if (!it) return;

  if (!d.snapshotted) {
    snapshot();
    d.snapshotted = true;
  }
  const p = dragCtx.toPlan(e);
  const st = step(e);
  const geom = getGeom();
  const res = moveBlocked(
    it,
    snapTo(p.x + d.dx, st),
    snapTo(p.y + d.dy, st),
    geom.WALLS,
  );
  if (res.blocked !== d.blocked) {
    d.blocked = res.blocked;
    showBlockedHint(res.blocked);
  }
  updateFurniture(it.id, { x: res.x, y: res.y }, { record: false, save: false });
  d.moved = true;
}

function moveResizeFurn(e) {
  const d = activeDrag.value;
  if (!d || d.mode !== 'resizeFurn' || !dragCtx.toPlan) return;
  if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < 2) {
    return;
  }
  const { furniture, snapshot, updateFurniture } = usePlanStore();
  const it = furniture.value.find(i => i.id === d.itemId);
  if (!it) return;

  if (!d.snapshotted) {
    snapshot();
    d.snapshotted = true;
  }
  const p = dragCtx.toPlan(e);
  const st = step(e);
  const a = (it.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const f = it.flip ? -1 : 1;
  const vx = p.x - it.x;
  const vy = p.y - it.y;
  const lx = f * (vx * c + vy * s);
  const ly = -vx * s + vy * c;
  const nL = clampSize(snapTo(lx + it.L / 2, st));
  const nW = clampSize(snapTo(ly + it.W / 2, st));
  const wx = (f * (nL - it.L)) / 2;
  const wy = (nW - it.W) / 2;
  const nx = r2(it.x + wx * c - wy * s);
  const ny = r2(it.y + wx * s + wy * c);

  updateFurniture(
    it.id,
    { x: nx, y: ny, L: nL, W: nW },
    { record: false, save: false },
  );
  d.moved = true;
}

function finishDrag(e, cancel) {
  const d = activeDrag.value;
  if (!d) return;
  activeDrag.value = null;

  if (d.mode === 'newRoom') {
    if (e && !cancel) {
      activeDrag.value = d;
      moveNewRoom(e);
      activeDrag.value = null;
    }
    endNewRoom(d, cancel);
  } else if (d.mode === 'newOp') {
    if (e && !cancel) {
      activeDrag.value = d;
      moveNewOp(e);
      activeDrag.value = null;
    }
    endNewOp(d, cancel);
  } else if (d.mode === 'newFurn') {
    if (e && !cancel) {
      activeDrag.value = d;
      moveNewFurn(e);
      activeDrag.value = null;
    }
    endNewFurn(d, cancel);
  } else if (d.mode === 'drawRoom') {
    if (e && !cancel) {
      activeDrag.value = d;
      moveDrawRoom(e);
      activeDrag.value = null;
    }
    endDrawRoom(d, cancel);
  } else if (d.mode === 'moveRoom' || d.mode === 'resizeRoom') {
    snapGuides.value = [];
    if (d.moved) usePlanStore().scheduleSave();
  } else if (d.mode === 'moveOp') {
    if (d.why) showOpHint(null);
    if (d.moved) usePlanStore().scheduleSave();
  } else if (d.mode === 'moveFurn' || d.mode === 'resizeFurn') {
    if (d.blocked) showBlockedHint(false);
    if (d.moved) usePlanStore().scheduleSave();
  }
}

function abortDrag() {
  if (activeDrag.value) {
    finishDrag(null, true);
  }
  clearFeedback();
  useUiStore().setRoomDraft(null);
}

// Install global listeners once so pointer releases outside the canvas never leave a stuck drag
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener(
    'pointermove',
    e => {
      const d = activeDrag.value;
      if (!d || e.pointerId !== d.pid) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        finishDrag(null, false);
        return;
      }
      if (d.mode === 'newRoom') moveNewRoom(e);
      else if (d.mode === 'newOp') moveNewOp(e);
      else if (d.mode === 'newFurn') moveNewFurn(e);
      else if (d.mode === 'drawRoom') moveDrawRoom(e);
      else if (d.mode === 'moveRoom') moveExistingRoom(e);
      else if (d.mode === 'resizeRoom') moveResizeRoom(e);
      else if (d.mode === 'moveOp') moveExistingOp(e);
      else if (d.mode === 'moveFurn') moveExistingFurn(e);
      else if (d.mode === 'resizeFurn') moveResizeFurn(e);
    },
    true,
  );

  window.addEventListener(
    'pointerup',
    e => {
      const d = activeDrag.value;
      if (d && e.pointerId === d.pid) {
        finishDrag(e, false);
      }
    },
    true,
  );

  window.addEventListener(
    'pointercancel',
    e => {
      const d = activeDrag.value;
      if (d && e.pointerId === d.pid) {
        finishDrag(null, isNewMode(d.mode));
      }
    },
    true,
  );

  window.addEventListener('blur', () => {
    const d = activeDrag.value;
    if (d) {
      finishDrag(null, isNewMode(d.mode));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activeDrag.value) {
      finishDrag(null, isNewMode(activeDrag.value.mode));
    }
  });
}

// ---- Public starters & helpers ----

function initDragContext(partialCtx = {}) {
  for (const [k, v] of Object.entries(partialCtx)) {
    if (v !== undefined) {
      dragCtx[k] = v;
    }
  }
}

function startPaletteDrag(payload, e) {
  if (!payload || !e || e.button !== 0) return;
  e.preventDefault();
  abortDrag();
  const { isMeasuring, setTool } = useUiStore();
  if (isMeasuring.value) setTool('select');

  if (payload.kind === 'newRoom') {
    const across = Number(payload.across ?? payload.preset?.across ?? 3.5);
    const deep = Number(payload.deep ?? payload.preset?.deep ?? 3.5);
    const svgHtml = roomChipHtml(payload.preset, across, deep);
    activeDrag.value = {
      mode: 'newRoom',
      pid: e.pointerId,
      preset: payload.preset,
      across,
      deep,
      svgHtml,
      cand: null,
    };
    moveNewRoom(e);
  } else if (payload.kind === 'newOp') {
    const opKind = payload.opKind;
    const width = Number(payload.width ?? OPK[opKind]?.w ?? 0.8);
    const svgHtml = thumbOp(opKind, width);
    activeDrag.value = {
      mode: 'newOp',
      pid: e.pointerId,
      opKind,
      width,
      svgHtml,
      cand: null,
      why: null,
    };
    moveNewOp(e);
  } else if (payload.kind === 'newFurn') {
    const svgHtml = thumbSvg(payload.type, payload.L, payload.W);
    activeDrag.value = {
      mode: 'newFurn',
      pid: e.pointerId,
      type: payload.type,
      L: payload.L,
      W: payload.W,
      svgHtml,
      over: false,
      pos: null,
    };
    moveNewFurn(e);
  }
}

function startDrawRoom(e) {
  const { activeTool, setRoomDraft } = useUiStore();
  if (activeTool.value !== 'draw-room' || !e || e.button !== 0) return;
  if (!dragCtx.toPlan) return;
  e.preventDefault();
  abortDrag();

  const { rooms } = usePlanStore();
  const p = dragCtx.toPlan(e);
  const st = step(e);
  const sn = snapDrawPoint(p, rooms.value, st);
  setRoomDraft({ x: sn.x, y: sn.y, w: 0, h: 0 });
  snapGuides.value = sn.guides;

  activeDrag.value = {
    mode: 'drawRoom',
    pid: e.pointerId,
    startX: sn.x,
    startY: sn.y,
  };
}

function startMoveRoom(room, rectIdx, e) {
  const { isMeasuring, isDrawingRoom, select } = useUiStore();
  if (isMeasuring.value || isDrawingRoom.value || !e || e.button !== 0) return;
  if (!dragCtx.toPlan) return;
  e.stopPropagation();
  e.preventDefault();
  abortDrag();

  select('room', room.id);
  const rects = getRoomRects(room);
  const orig = rects[rectIdx];
  if (!orig) return;
  const p = dragCtx.toPlan(e);

  activeDrag.value = {
    mode: 'moveRoom',
    pid: e.pointerId,
    roomId: room.id,
    rectIdx,
    origRect: [...orig],
    startPt: p,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    snapshotted: false,
  };
}

function startResizeRoom(room, rectIdx, dir, e) {
  const { isMeasuring, isDrawingRoom } = useUiStore();
  if (isMeasuring.value || isDrawingRoom.value || !e || e.button !== 0) return;
  if (!dragCtx.toPlan) return;
  e.stopPropagation();
  e.preventDefault();
  abortDrag();

  const rects = getRoomRects(room);
  const orig = rects[rectIdx];
  if (!orig) return;

  activeDrag.value = {
    mode: 'resizeRoom',
    pid: e.pointerId,
    roomId: room.id,
    rectIdx,
    dir,
    origRect: [...orig],
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    snapshotted: false,
  };
}

function startMoveOp(op, e) {
  const { isMeasuring, isDrawingRoom, select } = useUiStore();
  if (isMeasuring.value || isDrawingRoom.value || !e || e.button !== 0) return;
  if (!dragCtx.toPlan) return;
  e.stopPropagation();
  e.preventDefault();
  abortDrag();

  select('opening', op.id);
  const p = dragCtx.toPlan(e);

  activeDrag.value = {
    mode: 'moveOp',
    pid: e.pointerId,
    opId: op.id,
    offA: (op.a1 + op.a2) / 2 - alongOf(op.o, p.x, p.y),
    offO: op.o,
    why: null,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    snapshotted: false,
  };
}

function startMoveFurn(item, e) {
  const { isMeasuring, isDrawingRoom, select } = useUiStore();
  if (isMeasuring.value || isDrawingRoom.value || !e || e.button !== 0) return;
  if (!dragCtx.toPlan) return;
  e.stopPropagation();
  e.preventDefault();
  abortDrag();

  select('furniture', item.id);
  const p = dragCtx.toPlan(e);

  activeDrag.value = {
    mode: 'moveFurn',
    pid: e.pointerId,
    itemId: item.id,
    dx: item.x - p.x,
    dy: item.y - p.y,
    blocked: false,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    snapshotted: false,
  };
}

function startResizeFurn(item, e) {
  const { isMeasuring, isDrawingRoom } = useUiStore();
  if (isMeasuring.value || isDrawingRoom.value || !e || e.button !== 0) return;
  if (!dragCtx.toPlan) return;
  e.stopPropagation();
  e.preventDefault();
  abortDrag();

  activeDrag.value = {
    mode: 'resizeFurn',
    pid: e.pointerId,
    itemId: item.id,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    snapshotted: false,
  };
}

export function addPaletteItemAtCenter(payload, centerPt, geom) {
  if (!payload) return null;
  const { rooms, openings, openEdges, addRoom, addOpening, addFurniture } = usePlanStore();
  const { isMeasuring, setTool, select } = useUiStore();
  if (isMeasuring.value) setTool('select');

  const g = geom || dragCtx.getPlanGeometry?.() || computePlanGeometry(rooms.value, openEdges.value);
  const center = centerPt || { x: g.bounds.centerX, y: g.bounds.centerY };

  if (payload.kind === 'room' || payload.kind === 'newRoom') {
    const preset = payload.preset;
    const across = Number(payload.across ?? preset?.across ?? 3.5);
    const deep = Number(payload.deep ?? preset?.deep ?? 3.5);
    const rect = findFreeRoomSpot(across, deep, rooms.value, center);
    const created = addRoom({
      kind: preset.kind,
      en: preset.en,
      ar: preset.ar,
      x: rect[0],
      y: rect[1],
      across: rect[2],
      deep: rect[3],
    });
    if (created) select('room', created.id);
    return created;
  }

  if (payload.kind === 'opening' || payload.kind === 'newOp') {
    const opKind = payload.opKind;
    const width = Number(payload.width ?? OPK[opKind]?.w ?? 0.8);
    const spot = freeSpot(center, width, g.SEGS, openings.value);
    if (!spot) {
      showOpHint('none', false);
      return null;
    }
    const op = {
      kind: opKind,
      o: spot.o,
      c: spot.c,
      a1: spot.a1,
      a2: spot.a2,
      hs: true,
      side: 1,
    };
    fixSide(op, rooms.value, 1);
    const created = addOpening(op);
    if (created) select('opening', created.id);
    return created;
  }

  if (payload.kind === 'furniture' || payload.kind === 'newFurn') {
    const created = addFurniture({
      type: payload.type,
      L: payload.L,
      W: payload.W,
      x: snapTo(center.x, 0.05),
      y: snapTo(center.y, 0.05),
      rot: 0,
      flip: false,
    });
    if (created) select('furniture', created.id);
    return created;
  }

  return null;
}

export function useDragLifecycle() {
  return {
    initDragContext,
    dragChip,
    ghostRoom,
    ghostOp,
    ghostFurn,
    snapGuides,
    isDragging,
    startPaletteDrag,
    startDrawRoom,
    startMoveRoom,
    startResizeRoom,
    startMoveOp,
    startMoveFurn,
    startResizeFurn,
    abortDrag,
    addPaletteItemAtCenter,
  };
}
