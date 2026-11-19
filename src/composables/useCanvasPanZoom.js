/**
 * Reactive 2D SVG canvas pan, zoom, coordinate projection, and fit-to-bounds composable.
 * Plan coordinates are in meters; SVG viewBox coordinates are in centimeters (1 m = 100 units).
 */

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { S, m, r2, snapTo } from '../core/scale.js';

const PAD_LEFT = 2.2;
const PAD_TOP = 2.0;
const PAD_RIGHT = 2.2;
const PAD_BOTTOM = 2.2;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 8.0;
const PAN_DRAG_THRESHOLD_PX = 4;

function normalizeBounds(bounds) {
  if (
    bounds &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  ) {
    return bounds;
  }
  return {
    minX: 0,
    minY: 0,
    maxX: 14,
    maxY: 11,
    width: 14,
    height: 11,
    centerX: 7,
    centerY: 5.5,
  };
}

/**
 * Compute an aspect-matched SVG viewBox (in cm) that frames the plan bounds
 * across 100% of the viewport at a true 1:1 metric scale.
 */
export function computeFitBox(bounds, vpSize = { w: 1200, h: 800 }) {
  const b = normalizeBounds(bounds);
  const rawW = Math.max(0, b.maxX - b.minX);
  const rawH = Math.max(0, b.maxY - b.minY);
  const minW = Math.max(2, rawW);
  const minH = Math.max(2, rawH);
  const cx = Number.isFinite(Number(b.centerX)) ? Number(b.centerX) : (b.minX + b.maxX) / 2;
  const cy = Number.isFinite(Number(b.centerY)) ? Number(b.centerY) : (b.minY + b.maxY) / 2;
  const compassR = Math.max(5.2, Math.hypot((rawW || 14) / 2, (rawH || 11) / 2) + 1.45);
  const compassPadX = compassR + 0.75;
  const compassPadTop = compassR + 0.85;
  const compassPadBottom = compassR + 0.95;

  const leftM = Math.min(b.minX - PAD_LEFT, cx - compassPadX);
  const topM = Math.min(b.minY - PAD_TOP, cy - compassPadTop);
  const rightM = Math.max(b.minX + minW + PAD_RIGHT, cx + compassPadX);
  const bottomM = Math.max(b.minY + minH + PAD_BOTTOM, cy + compassPadBottom);

  const contentX = m(leftM);
  const contentY = m(topM);
  const contentW = m(rightM - leftM);
  const contentH = m(bottomM - topM);

  const vpW = vpSize && Number.isFinite(vpSize.w) && vpSize.w > 0 ? vpSize.w : 1200;
  const vpH = vpSize && Number.isFinite(vpSize.h) && vpSize.h > 0 ? vpSize.h : 800;
  const targetAspect = Math.max(0.2, vpW / vpH);

  let x = contentX;
  let y = contentY;
  let w = contentW;
  let h = contentH;

  if (contentW / contentH < targetAspect) {
    w = contentH * targetAspect;
    x = contentX + contentW / 2 - w / 2;
  } else {
    h = contentW / targetAspect;
    y = contentY + contentH / 2 - h / 2;
  }

  return { x, y, w, h };
}

/**
 * Compute an aspect-matched SVG viewBox (in cm) centered on a room rect `[x, y, w, h]`
 * (in meters) with comfortable surrounding padding.
 */
export function computeFocusBox(rect, bounds, vpSize = { w: 1200, h: 800 }) {
  let x;
  let y;
  let w;
  let h;
  if (Array.isArray(rect) && rect.length >= 4) {
    [x, y, w, h] = rect.map(Number);
  } else if (rect && typeof rect === 'object') {
    if (Number.isFinite(Number(rect.w)) && Number.isFinite(Number(rect.h))) {
      x = Number(rect.x);
      y = Number(rect.y);
      w = Number(rect.w);
      h = Number(rect.h);
    } else if (Number.isFinite(Number(rect.maxX)) && Number.isFinite(Number(rect.maxY))) {
      x = Number(rect.minX);
      y = Number(rect.minY);
      w = Number(rect.maxX) - x;
      h = Number(rect.maxY) - y;
    }
  }
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    return computeFitBox(bounds, vpSize);
  }

  const padX = Math.max(1.0, w * 0.38);
  const padY = Math.max(1.0, h * 0.38);
  const contentX = m(x - padX);
  const contentY = m(y - padY);
  const contentW = m(w + padX * 2);
  const contentH = m(h + padY * 2);

  const vpW = vpSize && Number.isFinite(vpSize.w) && vpSize.w > 0 ? vpSize.w : 1200;
  const vpH = vpSize && Number.isFinite(vpSize.h) && vpSize.h > 0 ? vpSize.h : 800;
  const targetAspect = Math.max(0.2, vpW / vpH);

  let bx = contentX;
  let by = contentY;
  let bw = contentW;
  let bh = contentH;

  if (contentW / contentH < targetAspect) {
    bw = contentH * targetAspect;
    bx = contentX + contentW / 2 - bw / 2;
  } else {
    bh = contentW / targetAspect;
    by = contentY + contentH / 2 - bh / 2;
  }

  const base = computeFitBox(bounds, { w: vpW, h: vpH });
  const zoom = base.w / Math.max(1, bw);
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  if (clampedZoom !== zoom) {
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    bw = base.w / clampedZoom;
    bh = bw / targetAspect;
    bx = cx - bw / 2;
    by = cy - bh / 2;
  }

  return { x: bx, y: by, w: bw, h: bh };
}

const easeInOutQuad = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function isInputTarget(target) {
  if (!target || typeof target.tagName !== 'string') return false;
  if (target.isContentEditable) return true;
  return /^(input|textarea|select|button)$/i.test(target.tagName);
}

export function useCanvasPanZoom(svgRef, boundsRef) {
  const viewportSize = ref({ w: 1200, h: 800 });
  const fitBox = computed(() => computeFitBox(boundsRef?.value, viewportSize.value));
  const vb = ref({ ...fitBox.value });
  const hasManualZoom = ref(false);
  const isPanning = ref(false);
  const spacePressed = ref(false);

  const zoomFactor = computed(() => {
    const baseW = fitBox.value.w || 1;
    const curW = vb.value.w || baseW;
    return baseW / curW;
  });

  const viewBoxString = computed(
    () => `${r2(vb.value.x)} ${r2(vb.value.y)} ${r2(vb.value.w)} ${r2(vb.value.h)}`,
  );

  let focusAnimRaf = 0;

  function cancelViewBoxAnim() {
    if (focusAnimRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(focusAnimRaf);
    }
    focusAnimRaf = 0;
  }

  function animateToBox(targetBox, durationMs = 280) {
    cancelViewBoxAnim();
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      reducedMotion ||
      durationMs <= 0 ||
      typeof requestAnimationFrame !== 'function' ||
      typeof performance === 'undefined'
    ) {
      vb.value = { ...targetBox };
      return;
    }

    const startBox = { ...vb.value };
    const startTs = performance.now();
    const step = now => {
      const k = Math.min(1, Math.max(0, (now - startTs) / durationMs));
      const e = easeInOutQuad(k);
      vb.value = {
        x: startBox.x + (targetBox.x - startBox.x) * e,
        y: startBox.y + (targetBox.y - startBox.y) * e,
        w: startBox.w + (targetBox.w - startBox.w) * e,
        h: startBox.h + (targetBox.h - startBox.h) * e,
      };
      if (k < 1) {
        focusAnimRaf = requestAnimationFrame(step);
      } else {
        focusAnimRaf = 0;
      }
    };
    focusAnimRaf = requestAnimationFrame(step);
  }

  function fitToBounds() {
    cancelViewBoxAnim();
    vb.value = { ...fitBox.value };
    hasManualZoom.value = false;
  }

  function focusRect(rect, opts = {}) {
    const targetBox = computeFocusBox(rect, boundsRef?.value, viewportSize.value);
    hasManualZoom.value = true;
    animateToBox(targetBox, opts?.instant ? 0 : (opts?.durationMs ?? 280));
    return targetBox;
  }

  let hasObservedViewport = false;
  function handleViewportResize(nextW, nextH) {
    if (!Number.isFinite(nextW) || !Number.isFinite(nextH) || nextW <= 0 || nextH <= 0) {
      return;
    }
    const prevW = viewportSize.value.w;
    const prevH = viewportSize.value.h;
    if (
      hasObservedViewport &&
      Math.abs(nextW - prevW) < 0.5 &&
      Math.abs(nextH - prevH) < 0.5
    ) {
      return;
    }
    hasObservedViewport = true;
    viewportSize.value = { w: nextW, h: nextH };

    if (!hasManualZoom.value) {
      fitToBounds();
      return;
    }

    const cur = vb.value;
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    const targetAspect = Math.max(0.2, nextW / nextH);
    const pxPerUnit =
      prevW > 0 && cur.w > 0
        ? prevW / cur.w
        : prevH > 0 && cur.h > 0
          ? prevH / cur.h
          : 1;
    const adjH = Math.max(10, nextH / pxPerUnit);
    const adjW = adjH * targetAspect;

    vb.value = {
      x: cx - adjW / 2,
      y: cy - adjH / 2,
      w: adjW,
      h: adjH,
    };
  }

  function clientToSvg(clientX, clientY) {
    const svg = svgRef?.value;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect?.();
    const cur = vb.value;
    if (rect && rect.width > 0 && rect.height > 0 && cur && cur.w > 0 && cur.h > 0) {
      const scale = Math.min(rect.width / cur.w, rect.height / cur.h);
      if (scale > 0) {
        const drawnW = cur.w * scale;
        const drawnH = cur.h * scale;
        const offX = rect.left + (rect.width - drawnW) / 2;
        const offY = rect.top + (rect.height - drawnH) / 2;
        return {
          x: cur.x + (clientX - offX) / scale,
          y: cur.y + (clientY - offY) / scale,
        };
      }
    }
    if (typeof svg.createSVGPoint === 'function') {
      const ctm = svg.getScreenCTM?.();
      if (ctm) {
        try {
          const pt = svg.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          return pt.matrixTransform(ctm.inverse());
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  function toPlan(pointerEvent) {
    if (!pointerEvent) return { x: 0, y: 0 };
    const svgPt = clientToSvg(pointerEvent.clientX, pointerEvent.clientY);
    if (!svgPt) return { x: 0, y: 0 };
    return { x: svgPt.x / S, y: svgPt.y / S };
  }

  function overSvg(pointerEvent) {
    const svg = svgRef?.value;
    if (!svg || !pointerEvent) return false;
    const container = svg.closest?.('.plan-scroll') || svg;
    const r = container.getBoundingClientRect();
    const inBounds =
      pointerEvent.clientX >= r.left &&
      pointerEvent.clientX <= r.right &&
      pointerEvent.clientY >= r.top &&
      pointerEvent.clientY <= r.bottom;
    if (!inBounds) return false;
    if (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function') {
      const topEl = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
      if (topEl?.closest?.('.floating-sidebar, .glass-card, .modal-backdrop, .sidebar-chevron-fab')) {
        return false;
      }
    }
    return true;
  }

  function panBySvgDelta(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    cancelViewBoxAnim();
    vb.value = {
      ...vb.value,
      x: vb.value.x + dx,
      y: vb.value.y + dy,
    };
    hasManualZoom.value = true;
  }

  function zoomBy(factor, clientPoint = null) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    cancelViewBoxAnim();
    const cur = vb.value;
    const base = fitBox.value;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomFactor.value * factor));
    const newW = base.w / nextZoom;
    const newH = base.h / nextZoom;

    let anchorX = cur.x + cur.w / 2;
    let anchorY = cur.y + cur.h / 2;
    if (clientPoint && Number.isFinite(clientPoint.clientX) && Number.isFinite(clientPoint.clientY)) {
      const svgPt = clientToSvg(clientPoint.clientX, clientPoint.clientY);
      if (svgPt) {
        anchorX = svgPt.x;
        anchorY = svgPt.y;
      }
    }

    const u = cur.w ? (anchorX - cur.x) / cur.w : 0.5;
    const v = cur.h ? (anchorY - cur.y) / cur.h : 0.5;

    vb.value = {
      x: anchorX - u * newW,
      y: anchorY - v * newH,
      w: newW,
      h: newH,
    };
    hasManualZoom.value = true;
  }

  function visibleCenter() {
    const svg = svgRef?.value;
    if (svg) {
      const container = svg.closest?.('.plan-scroll') || svg;
      const r = container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const vw = typeof window !== 'undefined' ? window.innerWidth : r.right;
        const vh = typeof window !== 'undefined' ? window.innerHeight : r.bottom;
        const x1 = Math.max(r.left, 0);
        const y1 = Math.max(r.top, 0);
        const x2 = Math.min(r.right, vw);
        const y2 = Math.min(r.bottom, vh);
        if (x2 > x1 && y2 > y1) {
          const p = toPlan({ clientX: (x1 + x2) / 2, clientY: (y1 + y2) / 2 });
          return { x: snapTo(p.x, 0.05), y: snapTo(p.y, 0.05) };
        }
      }
    }
    return {
      x: snapTo((vb.value.x + vb.value.w / 2) / S, 0.05),
      y: snapTo((vb.value.y + vb.value.h / 2) / S, 0.05),
    };
  }

  // Auto-fit when bounds expand past the current view or change drastically (e.g. template swap)
  watch(
    () => normalizeBounds(boundsRef?.value),
    (next, prev) => {
      if (hasManualZoom.value) return;
      if (!prev) {
        fitToBounds();
        return;
      }
      const nextBox = computeFitBox(next, viewportSize.value);
      const cur = vb.value;
      const outgrewView =
        nextBox.x < cur.x - 1 ||
        nextBox.y < cur.y - 1 ||
        nextBox.x + nextBox.w > cur.x + cur.w + 1 ||
        nextBox.y + nextBox.h > cur.y + cur.h + 1;
      const prevW = Math.max(1, prev.maxX - prev.minX);
      const prevH = Math.max(1, prev.maxY - prev.minY);
      const nextW = Math.max(1, next.maxX - next.minX);
      const nextH = Math.max(1, next.maxY - next.minY);
      const grewDrastically = nextW > prevW * 1.6 || nextH > prevH * 1.6;
      const shiftedFar =
        Math.hypot(next.centerX - prev.centerX, next.centerY - prev.centerY) > 4;

      if (outgrewView || grewDrastically || shiftedFar) {
        fitToBounds();
      }
    },
  );

  // Active pan state
  let panState = null;
  let suppressContextMenuUntil = 0;

  function endPan() {
    if (!panState) return;
    panState = null;
    isPanning.value = false;
  }

  function onPanMove(e) {
    if (!panState || e.pointerId !== panState.pid) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      endPan();
      return;
    }

    const dist = Math.hypot(e.clientX - panState.startX, e.clientY - panState.startY);
    if (dist > PAN_DRAG_THRESHOLD_PX) {
      panState.hasMoved = true;
    }

    if (panState.threshold && !isPanning.value) {
      if (!panState.hasMoved) return;
      isPanning.value = true;
    }

    const pPrev = clientToSvg(panState.lastX, panState.lastY);
    const pNow = clientToSvg(e.clientX, e.clientY);
    if (pPrev && pNow) {
      panBySvgDelta(pPrev.x - pNow.x, pPrev.y - pNow.y);
    } else {
      const svg = svgRef?.value;
      const rect = svg?.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) {
        const dx = ((panState.lastX - e.clientX) * vb.value.w) / rect.width;
        const dy = ((panState.lastY - e.clientY) * vb.value.h) / rect.height;
        panBySvgDelta(dx, dy);
      }
    }
    panState.lastX = e.clientX;
    panState.lastY = e.clientY;
  }

  function onPanUp(e) {
    if (!panState || e.pointerId !== panState.pid) return;
    const state = panState;
    if (state.button === 2 && state.hasMoved) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      suppressContextMenuUntil = now + 300;
    }
    endPan();
    if (state.threshold && !state.hasMoved) {
      state.onPlainClick?.();
    }
  }

  function onPanCancel(e) {
    if (!panState || e.pointerId !== panState.pid) return;
    endPan();
  }

  function onContextMenu(e) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if ((panState && panState.button === 2 && panState.hasMoved) || now < suppressContextMenuUntil) {
      e.preventDefault();
      suppressContextMenuUntil = 0;
    }
  }

  function onSvgPointerDown(e, { allowLeftBgPan = false, onPlainClick = null } = {}) {
    if (!e) return false;
    suppressContextMenuUntil = 0;

    const isImmediatePan =
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && (e.altKey || spacePressed.value));

    if (isImmediatePan) {
      cancelViewBoxAnim();
      endPan();
      e.preventDefault?.();
      e.stopPropagation?.();
      panState = {
        pid: e.pointerId,
        button: e.button,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        hasMoved: false,
        threshold: false,
        onPlainClick: null,
      };
      isPanning.value = true;
      return true;
    }

    if (allowLeftBgPan && e.button === 0) {
      cancelViewBoxAnim();
      endPan();
      e.preventDefault?.();
      panState = {
        pid: e.pointerId,
        button: e.button,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        hasMoved: false,
        threshold: true,
        onPlainClick,
      };
      return true;
    }

    return false;
  }

  function onWheel(e) {
    if (!e) return;
    e.preventDefault?.();
    const dy =
      e.deltaMode === 1
        ? e.deltaY * 16
        : e.deltaMode === 2
          ? e.deltaY * 400
          : e.deltaY;
    if (!Number.isFinite(dy) || dy === 0) return;
    const sensitivity = e.ctrlKey ? 0.006 : 0.0025;
    const raw = Math.exp(-dy * sensitivity);
    const factor = Math.min(1.35, Math.max(0.75, raw));
    zoomBy(factor, { clientX: e.clientX, clientY: e.clientY });
  }

  function onWindowKeyDown(e) {
    if (e.code === 'Space' && !e.repeat && !isInputTarget(e.target)) {
      spacePressed.value = true;
    }
  }

  function onWindowKeyUp(e) {
    if (e.code === 'Space') {
      spacePressed.value = false;
    }
  }

  function onWindowBlur() {
    spacePressed.value = false;
    endPan();
  }

  let attachedSvgEl = null;
  let resizeObserver = null;

  function attachSvgObservers(el) {
    if (attachedSvgEl === el) return;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (attachedSvgEl) {
      attachedSvgEl.removeEventListener('wheel', onWheel);
    }
    attachedSvgEl = el || null;
    if (attachedSvgEl) {
      attachedSvgEl.addEventListener('wheel', onWheel, { passive: false });
      const rect = attachedSvgEl.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) {
        handleViewportResize(rect.width, rect.height);
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0];
          const cr = entry?.contentRect;
          const r = attachedSvgEl?.getBoundingClientRect?.();
          const w = cr?.width || r?.width || 0;
          const h = cr?.height || r?.height || 0;
          if (w > 0 && h > 0) {
            handleViewportResize(w, h);
          }
        });
        resizeObserver.observe(attachedSvgEl);
      }
    }
  }

  watch(
    () => svgRef?.value,
    el => attachSvgObservers(el),
    { immediate: true },
  );

  onMounted(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointermove', onPanMove, true);
    window.addEventListener('pointerup', onPanUp, true);
    window.addEventListener('pointercancel', onPanCancel, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('keyup', onWindowKeyUp);
    window.addEventListener('blur', onWindowBlur);
  });

  onBeforeUnmount(() => {
    cancelViewBoxAnim();
    attachSvgObservers(null);
    endPan();
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointermove', onPanMove, true);
    window.removeEventListener('pointerup', onPanUp, true);
    window.removeEventListener('pointercancel', onPanCancel, true);
    window.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onWindowKeyDown);
    window.removeEventListener('keyup', onWindowKeyUp);
    window.removeEventListener('blur', onWindowBlur);
  });

  return {
    vb,
    zoomFactor,
    viewBoxString,
    isPanning,
    spacePressed,
    viewportSize,
    visibleCenter,
    fitToBounds,
    focusRect,
    zoomBy,
    panBySvgDelta,
    toPlan,
    overSvg,
    onSvgPointerDown,
    onWheel,
  };
}
