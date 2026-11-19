<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { FURNITURE_BY_TYPE } from '../../data/furnitureCatalog.js';
import { RENDER_MODES } from '../../data/materialPresets.js';
import InspectorPanel from '../inspector/InspectorPanel.vue';
import BuilderPalette from '../palette/BuilderPalette.vue';

defineProps({
  planGeometry: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['start-drag', 'add']);

const { isAr, t } = useI18n();
const {
  rooms,
  openings,
  furniture,
  sceneStyle,
  saveStatus,
  snapshot,
  updateSceneStyle,
  clearFurniture,
  clearOpenings,
  clearRooms,
} = usePlanStore();
const uiStore = useUiStore();
const {
  is3d,
  gridOn,
  selection,
  paletteSection,
  sidebarOpen,
  inspectorCollapsed,
  showLabels,
  showFurniture,
  showOpenings,
  goToOpen,
  layersOpen,
  focusedRoomId,
  toggleSidebar,
  setInspectorCollapsed,
  toggleInspectorCollapsed,
  toggleGrid,
  toggleLabels,
  toggleFurnitureLayer,
  toggleOpeningsLayer,
  toggleGoTo,
  toggleLayers,
  focusRoom,
  select,
  setHotRoom,
  clearSelection,
  clearMeasure,
} = uiStore;

const showCompass = uiStore.showCompass ?? ref(true);
const toggleCompass =
  uiStore.toggleCompass ??
  (() => {
    showCompass.value = !showCompass.value;
  });

const collapseBtnRef = ref(null);
const expandFabRef = ref(null);
const sidebarScrollRef = ref(null);
const paletteSecRef = ref(null);

const ARM_TIMEOUT_MS = 3500;

const furnArmed = ref(false);
const opsArmed = ref(false);
const roomsArmed = ref(false);
let furnTimer = null;
let opsTimer = null;
let roomsTimer = null;

const layerSwitches = [
  { id: 'labels', labelKey: 'layerLabels', active: showLabels, toggle: toggleLabels },
  { id: 'grid', labelKey: 'grid', active: gridOn, toggle: toggleGrid },
  { id: 'furniture', labelKey: 'layerFurniture', active: showFurniture, toggle: toggleFurnitureLayer },
  { id: 'openings', labelKey: 'layerOpenings', active: showOpenings, toggle: toggleOpeningsLayer },
  { id: 'compass', labelKey: 'layerCompass', active: showCompass, toggle: toggleCompass },
];

const atmospherePresets = [
  { id: 'daylight', timeOfDay: 11.5 },
  { id: 'golden', timeOfDay: 17.75 },
  { id: 'evening', timeOfDay: 20.5 },
  { id: 'studio', timeOfDay: 11.5 },
];

const selectionBadge = computed(() => {
  const sel = selection.value;
  if (!sel) return '';
  if (sel.kind === 'room') {
    const r = rooms.value.find(item => item.id === sel.id);
    if (!r) return '';
    return isAr.value ? r.ar || r.en : r.en || r.ar;
  }
  if (sel.kind === 'opening') {
    const op = openings.value.find(item => item.id === sel.id);
    return op ? t('op_' + op.kind) : '';
  }
  if (sel.kind === 'furniture') {
    const fn = furniture.value.find(item => item.id === sel.id);
    if (!fn) return '';
    const def = FURNITURE_BY_TYPE[fn.type];
    return def ? (isAr.value ? def.ar : def.en) : fn.type;
  }
  return '';
});

// Auto-expand the inspector whenever the user selects an item, opening, or room
watch(selection, (nextSel, prevSel) => {
  if (!nextSel) return;
  if (!prevSel || nextSel.kind !== prevSel.kind || nextSel.id !== prevSel.id) {
    setInspectorCollapsed(false);
  }
});

// Keep BuilderPalette visible when jumping directly via bottom-dock quick buttons
watch(paletteSection, async () => {
  await nextTick();
  const scroller = sidebarScrollRef.value;
  const palEl = paletteSecRef.value;
  if (!scroller || !palEl) return;
  const scrollerRect = scroller.getBoundingClientRect();
  const palRect = palEl.getBoundingClientRect();
  if (palRect.top < scrollerRect.top || palRect.top > scrollerRect.bottom - 72) {
    scroller.scrollBy({ top: palRect.top - scrollerRect.top, behavior: 'smooth' });
  }
});

function selectOverview() {
  focusRoom(null);
  clearSelection();
}

function selectRoomFocus(roomId) {
  focusRoom(roomId);
  select('room', roomId);
}

let atmoTweenRaf = null;

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

function cancelAtmosphereTween() {
  if (atmoTweenRaf !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(atmoTweenRaf);
  }
  atmoTweenRaf = null;
}

function selectAtmosphere(preset) {
  cancelAtmosphereTween();
  const targetTime = clampAndRoundTime(Number(preset.timeOfDay));
  if (!Number.isFinite(targetTime)) return;

  const rawCur = Number(sceneStyle.value?.timeOfDay);
  const fromTime = clampAndRoundTime(Number.isFinite(rawCur) ? rawCur : 11.5);
  const curPreset = sceneStyle.value?.lightingPreset;
  if (Math.abs(targetTime - fromTime) < 0.005 && curPreset === preset.id) {
    return;
  }

  snapshot();

  if (
    typeof requestAnimationFrame === 'undefined' ||
    prefersReducedMotion() ||
    Math.abs(targetTime - fromTime) < 0.01
  ) {
    updateSceneStyle(
      { lightingPreset: preset.id, timeOfDay: targetTime },
      { record: false, save: true },
    );
    return;
  }

  const durationMs = 260;
  let startAt = null;
  let lastWrittenTime = fromTime;
  let hasWritten = curPreset !== preset.id;

  if (hasWritten) {
    updateSceneStyle(
      { lightingPreset: preset.id, timeOfDay: fromTime },
      { record: false, save: true },
    );
  }

  const step = now => {
    const curStoredTime = Number(sceneStyle.value?.timeOfDay);
    const curStoredPreset = sceneStyle.value?.lightingPreset;
    if (
      hasWritten &&
      (curStoredPreset !== preset.id ||
        !Number.isFinite(curStoredTime) ||
        Math.abs(curStoredTime - lastWrittenTime) > 0.005)
    ) {
      atmoTweenRaf = null;
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
      atmoTweenRaf = null;
      updateSceneStyle(
        { lightingPreset: preset.id, timeOfDay: targetTime },
        { record: false, save: true },
      );
      return;
    }

    const eased = 1 - Math.pow(1 - progress, 3);
    const nextTime = clampAndRoundTime(fromTime + (targetTime - fromTime) * eased);
    lastWrittenTime = nextTime;
    hasWritten = true;
    updateSceneStyle(
      { lightingPreset: preset.id, timeOfDay: nextTime },
      { record: false, save: true },
    );
    atmoTweenRaf = requestAnimationFrame(step);
  };

  atmoTweenRaf = requestAnimationFrame(step);
}

async function handleCollapseSidebar() {
  if (!sidebarOpen.value) return;
  toggleSidebar();
  await nextTick();
  expandFabRef.value?.focus();
}

async function handleExpandSidebar() {
  if (sidebarOpen.value) return;
  toggleSidebar();
  await nextTick();
  collapseBtnRef.value?.focus();
}

function disarmFurn() {
  clearTimeout(furnTimer);
  furnTimer = null;
  furnArmed.value = false;
}

function disarmOps() {
  clearTimeout(opsTimer);
  opsTimer = null;
  opsArmed.value = false;
}

function disarmRooms() {
  clearTimeout(roomsTimer);
  roomsTimer = null;
  roomsArmed.value = false;
}

function handleClearFurniture() {
  if (!furniture.value.length) return;
  if (furnArmed.value) {
    disarmFurn();
    clearFurniture();
    if (selection.value?.kind === 'furniture') clearSelection();
  } else {
    furnArmed.value = true;
    furnTimer = setTimeout(disarmFurn, ARM_TIMEOUT_MS);
  }
}

function handleClearOpenings() {
  if (!openings.value.length) return;
  if (opsArmed.value) {
    disarmOps();
    clearOpenings();
    if (selection.value?.kind === 'opening') clearSelection();
  } else {
    opsArmed.value = true;
    opsTimer = setTimeout(disarmOps, ARM_TIMEOUT_MS);
  }
}

function handleClearRooms() {
  if (!rooms.value.length) return;
  if (roomsArmed.value) {
    disarmRooms();
    clearRooms();
    clearSelection();
    clearMeasure();
    focusRoom(null);
  } else {
    roomsArmed.value = true;
    roomsTimer = setTimeout(disarmRooms, ARM_TIMEOUT_MS);
  }
}

onBeforeUnmount(() => {
  cancelAtmosphereTween();
  disarmFurn();
  disarmOps();
  disarmRooms();
});
</script>

<template>
  <aside
    ref="sidebarScrollRef"
    class="hud-right-stack"
    :class="{ collapsed: !sidebarOpen }"
    :aria-hidden="String(!sidebarOpen)"
    :inert="!sidebarOpen"
    :aria-label="t('sidebarTitle')"
  >
    <!-- Card 1: Go to Quick-Focus -->
    <section class="glass-card goto-card" :aria-label="t('goTo')">
      <div class="stack-card-head">
        <span class="cap">{{ t('goTo') }}</span>
        <div class="stack-card-actions">
          <button
            type="button"
            class="pill-chip stack-icon-btn"
            :aria-expanded="String(goToOpen)"
            :aria-label="t(goToOpen ? 'collapseSection' : 'expandSection')"
            :title="t(goToOpen ? 'collapseSection' : 'expandSection')"
            @click="toggleGoTo()"
          >
            <svg
              class="section-chevron"
              :class="{ open: goToOpen }"
              viewBox="0 0 12 12"
              aria-hidden="true"
            >
              <path d="M3 4.5 6 7.5 9 4.5" />
            </svg>
          </button>

          <button
            ref="collapseBtnRef"
            type="button"
            class="pill-chip stack-icon-btn sidebar-collapse-btn"
            :aria-label="t('collapseSidebar')"
            :title="t('collapseSidebar')"
            @click="handleCollapseSidebar"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path :d="isAr ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5'" />
            </svg>
          </button>
        </div>
      </div>

      <div
        class="collapsible-grid"
        :class="{ 'is-collapsed': !goToOpen }"
        :aria-hidden="String(!goToOpen)"
        :inert="!goToOpen"
      >
        <div class="collapsible-inner">
          <div class="goto-pills">
            <button
              type="button"
              class="pill-chip"
              :class="{ active: !focusedRoomId && !selection }"
              :aria-pressed="String(!focusedRoomId && !selection)"
              @click="selectOverview"
            >
              {{ t('overview') }}
            </button>

            <button
              v-for="r in rooms"
              :key="r.id"
              type="button"
              class="pill-chip"
              :class="{
                active:
                  focusedRoomId === r.id ||
                  (selection?.kind === 'room' && selection?.id === r.id),
              }"
              :aria-pressed="
                String(
                  focusedRoomId === r.id ||
                    (selection?.kind === 'room' && selection?.id === r.id),
                )
              "
              @click="selectRoomFocus(r.id)"
              @pointerenter="setHotRoom(r.id)"
              @pointerleave="setHotRoom(null)"
            >
              {{ isAr ? r.ar || r.en : r.en || r.ar }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Card 2: Layers & 3D Style -->
    <section class="glass-card layers-card" :aria-label="t('layersTitle')">
      <div class="stack-card-head">
        <span class="cap">{{ t('layersTitle') }}</span>
        <div class="stack-card-actions">
          <button
            type="button"
            class="pill-chip stack-icon-btn"
            :aria-expanded="String(layersOpen)"
            :aria-label="t(layersOpen ? 'collapseSection' : 'expandSection')"
            :title="t(layersOpen ? 'collapseSection' : 'expandSection')"
            @click="toggleLayers()"
          >
            <svg
              class="section-chevron"
              :class="{ open: layersOpen }"
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
        :class="{ 'is-collapsed': !layersOpen }"
        :aria-hidden="String(!layersOpen)"
        :inert="!layersOpen"
      >
        <div class="collapsible-inner">
          <div class="layers-body">
            <div class="layers-switch-grid">
              <div
                v-for="item in layerSwitches"
                :key="item.id"
                class="layer-switch-item"
              >
                <span class="layer-switch-label" @click="item.toggle()">
                  {{ t(item.labelKey) }}
                </span>
                <button
                  type="button"
                  class="ios-switch"
                  role="switch"
                  :aria-checked="String(item.active.value)"
                  :aria-label="t(item.labelKey)"
                  @click="item.toggle()"
                ></button>
              </div>
            </div>

            <div v-if="is3d" class="layers-style-sec">
              <div class="layers-style-group">
                <span class="cap">{{ t('renderStyle') }}</span>
                <div class="layers-pill-row" role="group" :aria-label="t('renderStyle')">
                  <button
                    v-for="mode in RENDER_MODES"
                    :key="mode"
                    type="button"
                    class="pill-chip"
                    :class="{ active: sceneStyle.renderMode === mode }"
                    :aria-pressed="String(sceneStyle.renderMode === mode)"
                    @click="updateSceneStyle({ renderMode: mode })"
                  >
                    {{ t(mode === 'realistic' ? 'modeRealistic' : 'modeBlueprint') }}
                  </button>
                </div>
              </div>

              <div class="layers-style-group">
                <span class="cap">{{ t('lighting') }}</span>
                <div class="layers-pill-row" role="group" :aria-label="t('lighting')">
                  <button
                    v-for="preset in atmospherePresets"
                    :key="preset.id"
                    type="button"
                    class="pill-chip"
                    :class="{ active: sceneStyle.lightingPreset === preset.id }"
                    :aria-pressed="String(sceneStyle.lightingPreset === preset.id)"
                    @click="selectAtmosphere(preset)"
                  >
                    {{ t('light_' + preset.id) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Card 3: Builder & Inspector -->
    <section class="glass-card builder-card" :aria-label="t('sidebarTitle')">
      <div class="sidebar-head">
        <div class="sidebar-head-title">
          <span class="cap">{{ t('sidebarTitle') }}</span>
          <span class="save">{{ t('save_' + saveStatus) }}</span>
        </div>
      </div>

      <div class="sidebar-scroll">
        <div v-if="selection" class="panel-sec insp-slot">
          <div class="cap insp-collapse-bar">
            <span class="insp-collapse-title">
              <span>{{ t('selected') }}</span>
              <span v-if="selectionBadge" class="badge insp-sel-badge">{{ selectionBadge }}</span>
            </span>
            <span class="insp-collapse-actions">
              <button
                v-if="selection"
                type="button"
                class="add"
                @click="clearSelection()"
              >
                {{ t('done') }}
              </button>
              <button
                type="button"
                class="add insp-toggle-btn"
                :aria-expanded="String(!inspectorCollapsed)"
                :aria-label="t(inspectorCollapsed ? 'expandSection' : 'collapseSection')"
                @click="toggleInspectorCollapsed()"
              >
                <span>{{ t(inspectorCollapsed ? 'expandSection' : 'collapseSection') }}</span>
                <svg
                  class="insp-chevron"
                  :class="{ open: !inspectorCollapsed }"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                >
                  <path d="M3 4.5 6 7.5 9 4.5" />
                </svg>
              </button>
            </span>
          </div>

          <div
            class="collapsible-grid"
            :class="{ 'is-collapsed': inspectorCollapsed }"
            :aria-hidden="String(inspectorCollapsed)"
            :inert="inspectorCollapsed"
          >
            <div class="collapsible-inner">
              <div class="insp-body">
                <InspectorPanel :plan-geometry="planGeometry" />
              </div>
            </div>
          </div>
        </div>

        <div ref="paletteSecRef" class="panel-sec">
          <BuilderPalette
            @start-drag="(payload, ev) => emit('start-drag', payload, ev)"
            @add="payload => emit('add', payload)"
          />
        </div>

        <div class="panel-sec cleanup-list">
          <div class="cleanup-item">
            <button
              type="button"
              class="act"
              :disabled="!furniture.length"
              :aria-pressed="String(furnArmed)"
              @click="handleClearFurniture"
            >
              {{ furnArmed ? t('clearArmed', furniture.length) : t('clearAll') }}
            </button>
            <p class="small">
              {{ furniture.length ? t('count', furniture.length) : t('countNone') }}
            </p>
          </div>

          <div class="cleanup-item">
            <button
              type="button"
              class="act"
              :disabled="!openings.length"
              :aria-pressed="String(opsArmed)"
              @click="handleClearOpenings"
            >
              {{ opsArmed ? t('resetOpsArmed', openings.length) : t('resetOps') }}
            </button>
            <p class="small">
              {{ openings.length ? t('opsCount', openings.length) : t('opsNone') }}
            </p>
          </div>

          <div class="cleanup-item">
            <button
              type="button"
              class="act"
              :disabled="!rooms.length"
              :aria-pressed="String(roomsArmed)"
              @click="handleClearRooms"
            >
              {{ roomsArmed ? t('clearRoomsArmed', rooms.length) : t('clearRooms') }}
            </button>
            <p class="small">
              {{ rooms.length ? t('roomsCount', rooms.length) : t('roomsCountNone') }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </aside>

  <button
    v-show="!sidebarOpen"
    ref="expandFabRef"
    type="button"
    class="glass-card sidebar-chevron-fab"
    :aria-label="t('expandSidebar')"
    :title="t('expandSidebar')"
    @click="handleExpandSidebar"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path :d="isAr ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8 10 12.5'" />
    </svg>
    <span v-if="selection" class="fab-dot" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.stack-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stack-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.stack-icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--r-xs);
}
.stack-icon-btn svg {
  width: 13px;
  height: 13px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.section-chevron {
  transition: transform 0.2s ease;
}
.section-chevron.open {
  transform: rotate(180deg);
}

.goto-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 0;
  padding-top: 8px;
}
.goto-pills .pill-chip {
  padding: 4px 9px;
  font-size: 11.5px;
}

.layers-body {
  display: grid;
  gap: 10px;
  margin-top: 0;
  padding-top: 8px;
}
.layers-switch-grid {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.layer-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.layer-switch-label {
  font-size: 12.5px;
  line-height: 1.3;
  color: var(--ink);
  cursor: pointer;
  user-select: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.layers-style-sec {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--glass-divider);
}
.layers-style-group {
  display: grid;
  gap: 5px;
}
.layers-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.layers-pill-row .pill-chip {
  padding: 4px 8px;
  font-size: 11.5px;
}

.sidebar-head-title {
  flex-wrap: wrap;
  gap: 2px 8px;
}
.insp-collapse-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.insp-collapse-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.insp-sel-badge {
  max-width: 118px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.insp-collapse-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.insp-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.insp-chevron {
  width: 12px;
  height: 12px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}
.insp-chevron.open {
  transform: rotate(180deg);
}
.insp-body {
  margin-top: 0;
  padding-top: 8px;
}
.insp-body :deep(> div > .cap:first-child) {
  display: none;
}
.cleanup-list {
  display: grid;
  gap: 12px;
}
.cleanup-item + .cleanup-item {
  padding-top: 10px;
  border-top: 1px solid var(--glass-divider);
}
</style>
