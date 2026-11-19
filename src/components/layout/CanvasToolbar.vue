<script setup>
import { computed, ref, onBeforeUnmount } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { fmt } from '../../core/scale.js';
import { getRoomRects } from '../../core/walls.js';

const props = defineProps({
  position: {
    type: String,
    default: 'bottom',
    validator: v => v === 'top' || v === 'bottom',
  },
  section: {
    type: String,
    default: null,
  },
  zoom: {
    type: Number,
    default: null,
  },
});

const { isAr, t } = useI18n();
const { rooms, sceneStyle, roomArea, snapshot, updateSceneStyle } = usePlanStore();
const {
  is3d,
  walking,
  activeTool,
  isMeasuring,
  isDrawingRoom,
  hotRoomId,
  coordP,
  hintMessage,
  sidebarOpen,
  roomsTableOpen,
  timeOpen,
  measureSegments,
  measurePending,
  setWalking,
  setTool,
  setSidebarOpen,
  setPaletteSection,
  toggleMeasure,
  toggleDrawRoom,
  toggleRoomsTable,
  toggleTimeOpen,
  clearMeasure,
  sendCameraCommand,
} = useUiStore();

const TIME_STOPS = [
  { id: 'dawn', time: 6.5, preset: 'daylight' },
  { id: 'noon', time: 11.5, preset: 'daylight' },
  { id: 'dusk', time: 18.0, preset: 'golden' },
  { id: 'night', time: 21.0, preset: 'evening' },
];

let todDragActive = false;
let todTweenRaf = null;
const todTweening = ref(false);

const effectivePos = computed(() => props.section || props.position);

const showTimeSlider = computed(
  () => is3d.value && sceneStyle.value?.renderMode !== 'blueprint',
);

const currentTimeOfDay = computed(() => {
  const raw = Number(sceneStyle.value?.timeOfDay);
  return Number.isFinite(raw) ? raw : 11.5;
});

const formattedTime = computed(() => {
  const totalMins = Math.round(currentTimeOfDay.value * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
});

function tr(key, fallback, ...args) {
  const res = t(key, ...args);
  return res === key ? fallback : res;
}

const northDeg = computed(() => {
  const raw = Number(sceneStyle.value?.northDeg);
  if (!Number.isFinite(raw)) return 0;
  return ((Math.round(raw) % 360) + 360) % 360;
});

const northBearingLabel = computed(() =>
  tr('northBearing', `N ${northDeg.value}°`, northDeg.value),
);

function updateNorthDelta(delta) {
  const next = ((northDeg.value + delta) % 360 + 360) % 360;
  if (next === northDeg.value) return;
  snapshot();
  updateSceneStyle({ northDeg: next }, { record: false, save: true });
}

function resetNorth() {
  if (northDeg.value === 0) return;
  snapshot();
  updateSceneStyle({ northDeg: 0 }, { record: false, save: true });
}

const activeHint = computed(() => {
  if (hintMessage.value) return hintMessage.value;
  if (is3d.value) return t(walking.value ? 'hintWalk' : 'hint3d');
  if (isDrawingRoom.value) return t('hintDrawRoom');
  if (isMeasuring.value) return t('hintMeasure');
  return t('panHint2d');
});

const hotRoomInfo = computed(() => {
  if (!hotRoomId.value) return null;
  const r = rooms.value.find(item => item.id === hotRoomId.value);
  if (!r) return null;
  const name = isAr.value ? (r.ar || r.en) : (r.en || r.ar);
  const rects = getRoomRects(r);
  const dims = rects.length === 1 ? `${fmt(rects[0][2])} × ${fmt(rects[0][3])}` : null;
  const area = fmt(roomArea(r));
  return { name, dims, area };
});

function presetForTime(timeVal) {
  if (timeVal >= 19.25) return 'evening';
  if (timeVal >= 16.75) return 'golden';
  return 'daylight';
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clampAndRoundTime(val) {
  return Math.round(Math.min(21.5, Math.max(5.5, val)) * 100) / 100;
}

function cancelTimeTween() {
  if (todTweenRaf !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(todTweenRaf);
  }
  todTweenRaf = null;
  todTweening.value = false;
}

function tweenTimeOfDay(targetTime, targetPreset) {
  cancelTimeTween();
  const target = clampAndRoundTime(Number(targetTime));
  if (!Number.isFinite(target)) return;

  const fromTime = clampAndRoundTime(currentTimeOfDay.value);
  const curPreset = sceneStyle.value?.lightingPreset;
  if (Math.abs(target - fromTime) < 0.005 && curPreset === targetPreset) {
    return;
  }

  snapshot();

  if (
    typeof requestAnimationFrame === 'undefined' ||
    prefersReducedMotion() ||
    Math.abs(target - fromTime) < 0.01
  ) {
    updateSceneStyle(
      { timeOfDay: target, lightingPreset: targetPreset },
      { record: false, save: true },
    );
    return;
  }

  const durationMs = 260;
  let startAt = null;
  let lastWrittenTime = fromTime;
  let hasWritten = curPreset !== targetPreset;
  todTweening.value = true;

  if (hasWritten) {
    updateSceneStyle(
      { timeOfDay: fromTime, lightingPreset: targetPreset },
      { record: false, save: true },
    );
  }

  const step = now => {
    const curStoredTime = Number(sceneStyle.value?.timeOfDay);
    const curStoredPreset = sceneStyle.value?.lightingPreset;
    if (
      hasWritten &&
      (curStoredPreset !== targetPreset ||
        !Number.isFinite(curStoredTime) ||
        Math.abs(curStoredTime - lastWrittenTime) > 0.005)
    ) {
      todTweenRaf = null;
      todTweening.value = false;
      return;
    }

    const ts =
      typeof now === 'number'
        ? now
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
    if (startAt === null) {
      startAt = ts - 16;
    }

    const progress = Math.min(1, Math.max(0, (ts - startAt) / durationMs));
    if (progress >= 1) {
      todTweenRaf = null;
      todTweening.value = false;
      updateSceneStyle(
        { timeOfDay: target, lightingPreset: targetPreset },
        { record: false, save: true },
      );
      return;
    }

    const eased = 1 - Math.pow(1 - progress, 3);
    const nextTime = clampAndRoundTime(fromTime + (target - fromTime) * eased);
    lastWrittenTime = nextTime;
    hasWritten = true;
    updateSceneStyle(
      { timeOfDay: nextTime, lightingPreset: targetPreset },
      { record: false, save: true },
    );
    todTweenRaf = requestAnimationFrame(step);
  };

  todTweenRaf = requestAnimationFrame(step);
}

function onTimeSlider(rawVal) {
  cancelTimeTween();
  const num = Number(rawVal);
  if (!Number.isFinite(num)) return;
  if (!todDragActive) {
    snapshot();
    todDragActive = true;
  }
  updateSceneStyle(
    { timeOfDay: num, lightingPreset: presetForTime(num) },
    { record: false, save: true },
  );
}

function onTimeSliderCommit(rawVal) {
  cancelTimeTween();
  const num = Number(rawVal);
  if (Number.isFinite(num)) {
    if (!todDragActive) snapshot();
    updateSceneStyle(
      { timeOfDay: num, lightingPreset: presetForTime(num) },
      { record: false, save: true },
    );
  }
  todDragActive = false;
}

function selectTimeStop(stop) {
  todDragActive = false;
  tweenTimeOfDay(stop.time, stop.preset);
}

function isStopActive(stop) {
  if (sceneStyle.value?.lightingPreset === 'studio') return false;
  return Math.abs(currentTimeOfDay.value - stop.time) < 0.15;
}

function openPalette(section) {
  if (!is3d.value && activeTool.value !== 'select') {
    setTool('select');
  }
  setSidebarOpen(true);
  setPaletteSection(section);
}

onBeforeUnmount(() => {
  cancelTimeTween();
});
</script>

<template>
  <div
    v-if="effectivePos === 'top'"
    class="corner-fab-stack"
    :class="{ compact: !sidebarOpen, 'is-3d': is3d }"
    role="toolbar"
    :aria-label="t('toolsGroup')"
  >
    <button
      type="button"
      class="is-round"
      :aria-label="t(is3d ? 'resetView' : 'zoomFit')"
      :title="t(is3d ? 'resetView' : 'zoomFit')"
      @click="sendCameraCommand(is3d ? 'reset' : 'fit')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 5.5V3a.5.5 0 0 1 .5-.5h2.5M10.5 2.5H13a.5.5 0 0 1 .5.5v2.5M13.5 10.5V13a.5.5 0 0 1-.5.5h-2.5M5.5 13.5H3a.5.5 0 0 1-.5-.5v-2.5" />
        <rect x="6" y="6" width="4" height="4" rx="0.6" />
      </svg>
    </button>

    <button
      v-if="is3d"
      type="button"
      :aria-label="t('topView')"
      :title="t('topView')"
      @click="sendCameraCommand('top')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3" y="3" width="10" height="10" rx="1.2" />
        <path d="M5.5 6.5h5M8 6.5v4" />
      </svg>
    </button>

    <button
      type="button"
      :aria-label="t('zoomIn')"
      :title="t('zoomIn')"
      @click="sendCameraCommand('zoomIn')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3.5v9M3.5 8h9" />
      </svg>
    </button>

    <button
      type="button"
      :aria-label="t('zoomOut')"
      :title="t('zoomOut')"
      @click="sendCameraCommand('zoomOut')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8h9" />
      </svg>
    </button>

    <button
      type="button"
      :class="{ active: roomsTableOpen }"
      :aria-pressed="String(roomsTableOpen)"
      :aria-label="t('toggleSpacesTable') + ' (' + rooms.length + ')'"
      :title="t('toggleSpacesTable') + ' (' + rooms.length + ')'"
      @click="toggleRoomsTable()"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 4.5h10M3 8h10M3 11.5h10" />
      </svg>
    </button>
  </div>

  <template v-else>
    <div
      v-if="showTimeSlider"
      class="glass-card time-slider-card"
      :class="{ 'is-collapsed': !timeOpen }"
      role="region"
      :aria-label="t('timeOfDay')"
    >
      <div class="cap tod-head">
        <span>{{ t('timeOfDay') }}</span>
        <div class="tod-head-end">
          <span class="tod-clock" dir="ltr">{{ formattedTime }}</span>
          <button
            type="button"
            class="pill-chip tod-toggle-btn"
            :aria-expanded="String(timeOpen)"
            :aria-label="t(timeOpen ? 'collapseSection' : 'expandSection')"
            :title="t(timeOpen ? 'collapseSection' : 'expandSection')"
            @click="toggleTimeOpen()"
          >
            <svg
              class="tod-chevron"
              :class="{ open: timeOpen }"
              viewBox="0 0 12 12"
              aria-hidden="true"
            >
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </button>
        </div>
      </div>

      <div
        class="collapsible-grid"
        :class="{ 'is-collapsed': !timeOpen }"
        :aria-hidden="String(!timeOpen)"
        :inert="!timeOpen"
      >
        <div class="collapsible-inner">
          <div class="tod-body">
            <input
              class="tod-range"
              type="range"
              min="5.5"
              max="21.5"
              :step="todTweening ? 'any' : '0.25'"
              :aria-label="t('timeOfDay')"
              :value="currentTimeOfDay"
              @input="onTimeSlider($event.target.value)"
              @change="onTimeSliderCommit($event.target.value)"
            />

            <div class="tod-stops">
              <button
                v-for="stop in TIME_STOPS"
                :key="stop.id"
                type="button"
                :class="{ active: isStopActive(stop) }"
                :aria-pressed="String(isStopActive(stop))"
                @click="selectTimeStop(stop)"
              >
                {{ t('tod_' + stop.id) }}
              </button>
            </div>

            <div class="tod-compass-row" role="group" :aria-label="tr('compassTitle', 'North Compass')">
              <button
                type="button"
                :aria-label="tr('compassRotateLeft', 'Rotate North -15°')"
                :title="tr('compassRotateLeft', 'Rotate North -15°')"
                @click="updateNorthDelta(-15)"
              >
                <span dir="ltr">-15°</span>
              </button>

              <button
                type="button"
                class="tod-compass-reset"
                :class="{ 'is-rotated': northDeg !== 0 }"
                :aria-label="`${tr('compassReset', 'Reset North')}: ${northBearingLabel}`"
                :title="tr('compassReset', 'Reset North')"
                @click="resetNorth"
              >
                <svg
                  class="tod-compass-needle"
                  viewBox="0 0 12 12"
                  :style="{ transform: `rotate(${northDeg}deg)` }"
                  aria-hidden="true"
                >
                  <polygon points="6,1 8.4,6 6,5 3.6,6" fill="currentColor" />
                  <polygon points="6,11 8.4,6 6,7 3.6,6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.55" />
                </svg>
                <span :dir="isAr ? 'rtl' : 'ltr'">{{ northBearingLabel }}</span>
              </button>

              <button
                type="button"
                :aria-label="tr('compassRotateRight', 'Rotate North +15°')"
                :title="tr('compassRotateRight', 'Rotate North +15°')"
                @click="updateNorthDelta(15)"
              >
                <span dir="ltr">+15°</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="glass-card bottom-dock"
      :class="{ expanded: !sidebarOpen, 'no-time-slider': !showTimeSlider }"
    >
      <div class="dock-actions" role="toolbar" :aria-label="t('toolsGroup')">
        <template v-if="!is3d">
          <button
            type="button"
            class="pill-chip"
            :class="{ active: activeTool === 'select' }"
            :aria-pressed="String(activeTool === 'select')"
            @click="setTool('select')"
          >
            {{ t('toolSelect') }}
          </button>

          <button
            type="button"
            class="pill-chip"
            :class="{ active: activeTool === 'draw-room' }"
            :aria-pressed="String(activeTool === 'draw-room')"
            @click="toggleDrawRoom()"
          >
            {{ t('toolDrawRoom') }}
          </button>

          <button
            type="button"
            class="pill-chip"
            @click="openPalette('spaces')"
          >
            {{ t('quickAddRoom') }}
          </button>

          <button
            type="button"
            class="pill-chip"
            @click="openPalette('openings')"
          >
            {{ t('quickAddOpening') }}
          </button>

          <button
            type="button"
            class="pill-chip"
            @click="openPalette('furniture')"
          >
            {{ t('quickAddFurn') }}
          </button>

          <button
            type="button"
            class="pill-chip"
            :class="{ active: activeTool === 'measure' }"
            :aria-pressed="String(activeTool === 'measure')"
            @click="toggleMeasure()"
          >
            {{ t('measure') }}
          </button>

          <button
            v-if="measureSegments.length || measurePending"
            type="button"
            class="pill-chip"
            @click="clearMeasure()"
          >
            {{ t('clear') }}
          </button>
        </template>

        <template v-else>
          <button
            type="button"
            class="pill-chip"
            :class="{ active: walking }"
            :aria-pressed="String(walking)"
            @click="setWalking(!walking)"
          >
            {{ t('walk') }}
          </button>
        </template>
      </div>

      <span class="dock-hint" :class="{ 'has-alert': Boolean(hintMessage) }">
        {{ activeHint }}
      </span>

      <span class="readout">
        <template v-if="hotRoomInfo">
          <span>{{ hotRoomInfo.name }}</span>
          <template v-if="hotRoomInfo.dims">
            · <span dir="ltr">{{ hotRoomInfo.dims }}</span> {{ t('m') }}
          </template>
          · <span dir="ltr">{{ hotRoomInfo.area }}</span> {{ t('m2') }}
        </template>
        <template v-else-if="coordP">
          <span dir="ltr">x {{ fmt(coordP.x) }} · y {{ fmt(coordP.y) }}</span> {{ t('m') }}
        </template>
        <template v-else>
          <span dir="ltr">x – · y –</span>
        </template>
      </span>
    </div>
  </template>
</template>

<style scoped>
.tod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  line-height: 1.3;
}
.tod-head-end {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.tod-clock {
  font-family: var(--f-body);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: -0.01em;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.tod-toggle-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--r-xs);
}
.tod-chevron {
  width: 12px;
  height: 12px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}
.tod-chevron.open {
  transform: rotate(180deg);
}
.tod-body {
  display: grid;
  gap: 8px;
  padding-top: 2px;
}
.dock-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.dock-actions .pill-chip {
  padding: 4px 9px;
}
.dock-hint {
  font-size: 12px;
  line-height: 1.35;
}
.dock-hint.has-alert {
  color: var(--warn);
  font-weight: 500;
}
.readout {
  margin-inline-start: auto;
}
@media (max-width: 820px) {
  .dock-hint:not(.has-alert) {
    display: none;
  }
}
</style>
