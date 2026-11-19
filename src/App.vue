<script setup>
import { ref, computed, watch } from 'vue';
import { computePlanGeometry } from './core/walls.js';
import { useI18n } from './i18n/useI18n.js';
import { usePlanStore } from './stores/usePlanStore.js';
import { useUiStore } from './stores/useUiStore.js';
import { useDragLifecycle } from './composables/useDragLifecycle.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';

import AppHeader from './components/layout/AppHeader.vue';
import CanvasToolbar from './components/layout/CanvasToolbar.vue';
import StudioSidebar from './components/layout/StudioSidebar.vue';
import FloorPlanCanvas from './components/canvas2d/FloorPlanCanvas.vue';
import FloorPlan3DView from './components/canvas3d/FloorPlan3DView.vue';
import RoomsSummaryTable from './components/summary/RoomsSummaryTable.vue';
import ProjectDataModal from './components/summary/ProjectDataModal.vue';

const { lang, t } = useI18n();
const { rooms, openEdges } = usePlanStore();
const { is3d } = useUiStore();

const planGeometry = computed(() =>
  computePlanGeometry(rooms.value, openEdges.value),
);

const hasOpened3d = ref(is3d.value);
watch(is3d, val => {
  if (val) hasOpened3d.value = true;
});

watch(
  lang,
  () => {
    if (typeof document !== 'undefined') {
      document.title = t('docTitle');
    }
  },
  { immediate: true },
);

const zoom2d = ref(1);
const visibleCenter2d = ref({ x: 7, y: 5.5 });
const view3dRef = ref(null);
const canvas2dRef = ref(null);

const {
  initDragContext,
  dragChip,
  startPaletteDrag,
  addPaletteItemAtCenter,
} = useDragLifecycle();

watch(
  view3dRef,
  comp => {
    if (comp) {
      initDragContext({
        view3dRef: comp,
        floorPoint3d: e => comp.floorPoint(e),
        over3d: e => {
          const el = comp.$el;
          if (!el || typeof el.getBoundingClientRect !== 'function') return false;
          const r = el.getBoundingClientRect();
          return (
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          );
        },
      });
    } else {
      initDragContext({
        view3dRef: null,
        floorPoint3d: null,
        over3d: null,
      });
    }
  },
  { immediate: true },
);

useKeyboardShortcuts({
  getPlanGeometry: () => planGeometry.value,
  onWalkKey: (e, isDown) => view3dRef.value?.walkKey(e, isDown) || false,
});

function handlePaletteAdd(payload) {
  const centerPt = is3d.value
    ? view3dRef.value?.center() || {
        x: planGeometry.value.bounds.centerX,
        y: planGeometry.value.bounds.centerY,
      }
    : canvas2dRef.value?.visibleCenter() || visibleCenter2d.value;
  addPaletteItemAtCenter(payload, centerPt, planGeometry.value);
}

function handlePaletteStartDrag(payload, pointerEvent) {
  startPaletteDrag(payload, pointerEvent);
}
</script>

<template>
  <div class="app-viewport">
    <main class="viewport-stage" :aria-label="t('planLabel')">
      <FloorPlanCanvas
        v-show="!is3d"
        ref="canvas2dRef"
        :plan-geometry="planGeometry"
        :visible-center-ref="visibleCenter2d"
        @zoom-change="zoom2d = $event"
      />
      <FloorPlan3DView
        v-if="hasOpened3d"
        v-show="is3d"
        ref="view3dRef"
        :plan-geometry="planGeometry"
      />
    </main>

    <div class="hud-layer">
      <AppHeader />
      <CanvasToolbar position="top" :zoom="is3d ? null : zoom2d" />
      <RoomsSummaryTable />
      <CanvasToolbar position="bottom" :zoom="is3d ? null : zoom2d" />
      <StudioSidebar
        :plan-geometry="planGeometry"
        @add="handlePaletteAdd"
        @start-drag="handlePaletteStartDrag"
      />
    </div>

    <ProjectDataModal />
    <div
      v-if="dragChip && dragChip.visible"
      class="chip"
      :style="{ left: dragChip.x + 'px', top: dragChip.y + 'px' }"
      v-html="dragChip.svgHtml"
    />
  </div>
</template>
