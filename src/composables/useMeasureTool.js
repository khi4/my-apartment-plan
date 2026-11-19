/**
 * Interactive 2D measurement tool composable.
 * Places snapped point-to-point dimension segments on the SVG plan.
 */

import { snapTo, step } from '../core/scale.js';
import { useUiStore } from '../stores/useUiStore.js';

export function useMeasureTool(toPlanFn) {
  const {
    isMeasuring,
    measureSegments,
    measurePending,
    measureCursor,
    clearMeasure,
  } = useUiStore();

  function snapEventPoint(e) {
    const raw = typeof toPlanFn === 'function' ? toPlanFn(e) : { x: 0, y: 0 };
    const st = step(e);
    return {
      x: snapTo(raw.x, st),
      y: snapTo(raw.y, st),
    };
  }

  function onPointerDown(e) {
    if (!isMeasuring.value) return false;
    if (e && e.button !== 0) return false;
    const p = snapEventPoint(e);
    if (!measurePending.value) {
      measurePending.value = p;
      measureCursor.value = null;
    } else {
      measureSegments.value = [...measureSegments.value, [measurePending.value, p]];
      measurePending.value = null;
      measureCursor.value = null;
    }
    return true;
  }

  function onPointerMove(e) {
    if (!isMeasuring.value || !measurePending.value) return false;
    measureCursor.value = snapEventPoint(e);
    return true;
  }

  function cancelPending() {
    if (!measurePending.value && !measureCursor.value) return false;
    measurePending.value = null;
    measureCursor.value = null;
    return true;
  }

  function clearAll() {
    clearMeasure();
  }

  function onKeyDown(e) {
    if (!e) return false;
    if (e.key === 'Escape' && measurePending.value) {
      cancelPending();
      return true;
    }
    const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    if (k === 'c' || e.code === 'KeyC') {
      clearMeasure();
      return true;
    }
    return false;
  }

  return {
    onPointerDown,
    onPointerMove,
    cancelPending,
    clearAll,
    onKeyDown,
  };
}
