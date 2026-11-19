/**
 * Shared color normalization, undo-batched color-picker sessions,
 * and auto-clearing feedback state for 3D material & finish controls.
 */

import { ref, onBeforeUnmount } from 'vue';

/**
 * Normalizes a `#rgb` or `#rrggbb` CSS hex string to 6-digit lowercase `#rrggbb`
 * required by native `<input type="color">` controls.
 */
export function toHex6(color, fallback = '#ffffff') {
  if (typeof color !== 'string') return fallback;
  const s = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return fallback;
}

/**
 * Case-insensitive hex color comparison handling `#rgb` and `#rrggbb`.
 */
export function isSameColor(a, b) {
  return toHex6(a, '') === toHex6(b, '');
}

/**
 * Creates an undo-aware color picker handler pair (`onColorInput`, `onColorChange`, `resetColorSession`)
 * so dragging a native `<input type="color">` records only one history snapshot per drag session.
 */
export function useColorPickerSession(snapshot, applyPatch) {
  let activeKey = null;

  function onColorInput(key, patch) {
    if (activeKey !== key) {
      snapshot();
      activeKey = key;
    }
    applyPatch(patch, { record: false, save: true });
  }

  function onColorChange(key, patch) {
    if (activeKey !== key) {
      snapshot();
    }
    applyPatch(patch, { record: false, save: true });
    activeKey = null;
  }

  function resetColorSession() {
    activeKey = null;
  }

  return {
    onColorInput,
    onColorChange,
    resetColorSession,
  };
}

/**
 * Manages a temporary status tag (e.g. "Applied to all") that clears automatically
 * and cleans up its timer on component unmount.
 */
export function useTimedFeedback(durationMs = 1800) {
  const activeTag = ref(null);
  let timer = null;

  function clearFeedback() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    activeTag.value = null;
  }

  function triggerFeedback(tag) {
    activeTag.value = tag;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      activeTag.value = null;
      timer = null;
    }, durationMs);
  }

  onBeforeUnmount(clearFeedback);

  return {
    activeTag,
    triggerFeedback,
    clearFeedback,
  };
}
