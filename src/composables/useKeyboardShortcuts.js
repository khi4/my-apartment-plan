/**
 * Global keyboard shortcut handler for 2D/3D editing, undo/redo, selection nudging/actions,
 * tool switching, zoom/fit, and walk-mode delegation.
 */

import { onMounted, onBeforeUnmount } from 'vue';
import { r2 } from '../core/scale.js';
import { getRoomRects, computePlanGeometry } from '../core/walls.js';
import { moveBlocked } from '../core/clearance.js';
import { slideOp } from '../core/openings.js';
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

function isEditableTarget(target) {
  if (!target || typeof target.tagName !== 'string') return false;
  if (target.isContentEditable) return true;
  return /^(input|textarea|select)$/i.test(target.tagName);
}

function keyMatch(e, letter) {
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (k === letter) return true;
  // Support non-Latin keyboard layouts (e.g. Arabic IME) via physical key code
  if (!/^[a-z]$/i.test(k)) {
    return e.code === 'Key' + letter.toUpperCase();
  }
  return false;
}

export function useKeyboardShortcuts({ getPlanGeometry, onWalkKey } = {}) {
  const { t } = useI18n();
  const planStore = usePlanStore();
  const uiStore = useUiStore();

  let nudgePush = { key: null, acc: 0 };

  function getGeom() {
    const g = getPlanGeometry?.();
    if (g) return g;
    return computePlanGeometry(planStore.rooms.value, planStore.openEdges.value);
  }

  function pruneMissingSelection() {
    const sel = uiStore.selection.value;
    if (!sel) return;
    const exists =
      (sel.kind === 'room' && planStore.rooms.value.some(r => r.id === sel.id)) ||
      (sel.kind === 'opening' && planStore.openings.value.some(o => o.id === sel.id)) ||
      (sel.kind === 'furniture' && planStore.furniture.value.some(f => f.id === sel.id));
    if (!exists) uiStore.clearSelection();
  }

  function nudgeFurniture(it, dx, dy, stepSize) {
    const WALLS = getGeom().WALLS || [];
    const key = (dx ? 'x' : 'y') + Math.sign(dx || dy);
    const pass = nudgePush.key === key && nudgePush.acc > 0.35 ? 0 : 0.35;
    const res = moveBlocked(it, it.x + dx, it.y + dy, WALLS, pass);

    if (pass === 0) {
      nudgePush = { key: null, acc: 0 };
    } else if (res.blocked) {
      if (nudgePush.key !== key) nudgePush = { key, acc: 0 };
      nudgePush.acc += stepSize;
      uiStore.setHint(t('hintBlocked'), 1200);
    } else {
      nudgePush = { key: null, acc: 0 };
    }

    if (res.x !== it.x || res.y !== it.y) {
      planStore.updateFurniture(it.id, { x: res.x, y: res.y });
    }
  }

  function handleFurnitureKey(e, it) {
    const st = e.shiftKey ? 0.01 : 0.05;
    if (keyMatch(e, 'r')) {
      planStore.rotateFurniture(it.id, 90);
      return true;
    }
    if (keyMatch(e, 'f')) {
      planStore.flipFurniture(it.id);
      return true;
    }
    if (keyMatch(e, 'd')) {
      const copy = planStore.duplicateFurniture(it.id);
      if (copy) uiStore.select('furniture', copy.id);
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      planStore.removeFurniture(it.id);
      uiStore.clearSelection();
      return true;
    }
    if (e.key === 'Escape') {
      uiStore.clearSelection();
      return true;
    }
    if (e.key === 'ArrowLeft') {
      nudgeFurniture(it, -st, 0, st);
      return true;
    }
    if (e.key === 'ArrowRight') {
      nudgeFurniture(it, st, 0, st);
      return true;
    }
    if (e.key === 'ArrowUp') {
      nudgeFurniture(it, 0, -st, st);
      return true;
    }
    if (e.key === 'ArrowDown') {
      nudgeFurniture(it, 0, st, st);
      return true;
    }
    return false;
  }

  function handleOpeningKey(e, op) {
    const st = e.shiftKey ? 0.01 : 0.05;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      planStore.removeOpening(op.id);
      uiStore.clearSelection();
      return true;
    }
    if (e.key === 'Escape') {
      uiStore.clearSelection();
      return true;
    }
    if (keyMatch(e, 'f')) {
      if (op.kind === 'door') {
        planStore.updateOpening(op.id, { hs: !op.hs });
      }
      return true;
    }
    if (keyMatch(e, 's')) {
      if (op.kind === 'door') {
        planStore.updateOpening(op.id, { side: op.side === -1 ? 1 : -1 });
      }
      return true;
    }

    const dirMap = {
      ArrowLeft: op.o === 'h' ? -1 : 0,
      ArrowRight: op.o === 'h' ? 1 : 0,
      ArrowUp: op.o === 'v' ? -1 : 0,
      ArrowDown: op.o === 'v' ? 1 : 0,
    };
    const dir = dirMap[e.key];
    if (dir !== undefined) {
      if (dir !== 0) {
        const res = slideOp(op, dir * st, getGeom().SEGS, planStore.openings.value);
        if (res.ok) {
          planStore.updateOpening(op.id, { a1: res.a1, a2: res.a2 });
        } else {
          uiStore.setHint(t(HINT_OP_KEYS[res.why] || 'hintOpTaken'), 1600);
        }
      }
      return true;
    }
    return false;
  }

  function handleRoomKey(e, room) {
    const st = e.shiftKey ? 0.01 : 0.05;
    if (keyMatch(e, 'r')) {
      planStore.swapRoomDims(room.id);
      return true;
    }
    if (keyMatch(e, 'd')) {
      const copy = planStore.duplicateRoom(room.id);
      if (copy) uiStore.select('room', copy.id);
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      planStore.removeRoom(room.id);
      uiStore.clearSelection();
      return true;
    }
    if (e.key === 'Escape') {
      uiStore.clearSelection();
      return true;
    }

    const deltas = {
      ArrowLeft: [-st, 0],
      ArrowRight: [st, 0],
      ArrowUp: [0, -st],
      ArrowDown: [0, st],
    };
    const delta = deltas[e.key];
    if (delta) {
      const primary = getRoomRects(room)[0];
      if (primary) {
        planStore.updateRoomRect(room.id, 0, [
          r2(primary[0] + delta[0]),
          r2(primary[1] + delta[1]),
          primary[2],
          primary[3],
        ]);
      }
      return true;
    }
    return false;
  }

  function handleSelectionKey(e) {
    const sel = uiStore.selection.value;
    if (!sel) return false;
    if (sel.kind === 'furniture') {
      const it = planStore.furniture.value.find(i => i.id === sel.id);
      return it ? handleFurnitureKey(e, it) : false;
    }
    if (sel.kind === 'opening') {
      if (uiStore.is3d.value) return false;
      const op = planStore.openings.value.find(o => o.id === sel.id);
      return op ? handleOpeningKey(e, op) : false;
    }
    if (sel.kind === 'room') {
      if (uiStore.is3d.value) return false;
      const room = planStore.rooms.value.find(r => r.id === sel.id);
      return room ? handleRoomKey(e, room) : false;
    }
    return false;
  }

  function onKeyDown(e) {
    // Allow Escape even inside inputs/modals
    if (e.key === 'Escape' && uiStore.projectModalOpen.value) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      uiStore.setProjectModalOpen(false);
      return;
    }

    if (isEditableTarget(e.target)) {
      if (e.key === 'Escape' && e.target instanceof HTMLElement) {
        e.target.blur();
      }
      return;
    }

    // Undo / Redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y)
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      if (keyMatch(e, 'z')) {
        e.preventDefault();
        if (e.shiftKey) {
          if (planStore.redo()) pruneMissingSelection();
        } else {
          if (planStore.undo()) pruneMissingSelection();
        }
        return;
      }
      if (keyMatch(e, 'y') && !e.shiftKey) {
        e.preventDefault();
        if (planStore.redo()) pruneMissingSelection();
        return;
      }
      return;
    }

    if (e.altKey) return;

    // Walk mode keys take priority over selection nudging
    if (uiStore.walking.value && onWalkKey?.(e, true)) {
      e.preventDefault();
      return;
    }

    if (handleSelectionKey(e)) {
      e.preventDefault();
      return;
    }

    // Escape fallbacks when nothing is selected
    if (e.key === 'Escape') {
      if (uiStore.walking.value) {
        uiStore.setWalking(false);
        e.preventDefault();
      } else if (uiStore.isDrawingRoom.value) {
        uiStore.setRoomDraft(null);
        uiStore.setTool('select');
        e.preventDefault();
      } else if (uiStore.isMeasuring.value) {
        if (uiStore.measurePending.value) {
          uiStore.measurePending.value = null;
          uiStore.measureCursor.value = null;
        } else {
          uiStore.setTool('select');
        }
        e.preventDefault();
      }
      return;
    }

    // Global & mode-specific tool/view shortcuts
    if (keyMatch(e, 'g')) {
      uiStore.toggleGrid();
      e.preventDefault();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      uiStore.sendCameraCommand('zoomIn');
      e.preventDefault();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      uiStore.sendCameraCommand('zoomOut');
      e.preventDefault();
      return;
    }
    if (e.key === '0') {
      uiStore.sendCameraCommand(uiStore.is3d.value ? 'reset' : 'fit');
      e.preventDefault();
      return;
    }

    if (uiStore.is3d.value) {
      if (keyMatch(e, 'w') && !uiStore.walking.value) {
        uiStore.setWalking(true);
        e.preventDefault();
      } else if (keyMatch(e, 't')) {
        uiStore.sendCameraCommand('top');
        e.preventDefault();
      }
      return;
    }

    // 2D-only tool shortcuts
    if (keyMatch(e, 'v')) {
      uiStore.setTool('select');
      e.preventDefault();
    } else if (keyMatch(e, 'b')) {
      uiStore.toggleDrawRoom();
      e.preventDefault();
    } else if (keyMatch(e, 'm')) {
      uiStore.toggleMeasure();
      e.preventDefault();
    } else if (keyMatch(e, 'c')) {
      uiStore.clearMeasure();
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    if (uiStore.walking.value && onWalkKey) {
      onWalkKey(e, false);
    }
  }

  onMounted(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  });

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });
}
