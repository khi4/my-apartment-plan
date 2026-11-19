<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { fmt } from '../../core/scale.js';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useThreeScene, computeTimeOfDayLighting } from '../../three/useThreeScene.js';
import WalkHudOverlay from './WalkHudOverlay.vue';

const props = defineProps({
  planGeometry: {
    type: Object,
    required: true,
  },
});

const { lang, isAr, t } = useI18n();
const planStore = usePlanStore();
const uiStore = useUiStore();

const mountRef = ref(null);
const labelsRef = ref(null);
const walkHudRef = ref(null);
const isDragging = ref(false);
const stepTimers = new Map();

const mapCanvasRef = computed(() => walkHudRef.value?.mapCanvasRef ?? null);

const isRealistic = computed(
  () => (planStore.sceneStyle.value?.renderMode || 'realistic') === 'realistic',
);

const skyLighting = computed(() => {
  const style = planStore.sceneStyle.value;
  const preset = style?.lightingPreset || 'daylight';
  const fallbackTime = preset === 'golden' ? 17.75 : preset === 'evening' ? 20.5 : 11.5;
  return computeTimeOfDayLighting(
    style?.timeOfDay ?? fallbackTime,
    uiStore.look.value,
    preset,
    style?.northDeg ?? 0,
  );
});

const view3dStyle = computed(() => {
  if (!isRealistic.value) return undefined;
  const l = skyLighting.value;
  const skyMid = l.skyMid || l.skyTop;
  return {
    background: `linear-gradient(180deg, ${l.skyTop} 0%, ${skyMid} 54%, ${l.skyBottom} 100%)`,
  };
});

const watermarkStyle = computed(() => ({
  color: 'rgba(255, 255, 255, 0.72)',
  textShadow: '0 2px 10px rgba(0, 0, 0, 0.16)',
}));

const statusMessage = computed(() => {
  if (uiStore.threeStatus.value === 'loading') return t('v3Loading');
  if (uiStore.threeStatus.value === 'error') return t('v3Fail');
  return '';
});

const sceneCtrl = useThreeScene({
  containerRef: mountRef,
  mapCanvasRef,
  labelsContainerRef: labelsRef,
  getState: () => ({
    rooms: planStore.rooms.value,
    openEdges: planStore.openEdges.value,
    openings: planStore.openings.value,
    furniture: planStore.furniture.value,
    sceneStyle: planStore.sceneStyle.value,
    geometry: props.planGeometry,
    selId: uiStore.selection.value?.kind === 'furniture' ? uiStore.selection.value.id : null,
    selOpId: uiStore.selection.value?.kind === 'opening' ? uiStore.selection.value.id : null,
    selRoomId: uiStore.selection.value?.kind === 'room' ? uiStore.selection.value.id : null,
    hotRoomId: uiStore.hotRoomId.value,
    gridOn: uiStore.gridOn.value,
  }),
  uiStore,
  planStore,
  t,
  isAr,
  onDragChange: dragging => {
    isDragging.value = dragging;
  },
});

function onPadDown(dir) {
  if (stepTimers.has(dir)) {
    clearTimeout(stepTimers.get(dir));
    stepTimers.delete(dir);
  }
  sceneCtrl.setPadHeld(dir, true);
}

function onPadUp(dir) {
  sceneCtrl.setPadHeld(dir, false);
}

function onPadStep(dir) {
  sceneCtrl.setPadHeld(dir, true);
  if (stepTimers.has(dir)) clearTimeout(stepTimers.get(dir));
  const timer = setTimeout(() => {
    stepTimers.delete(dir);
    sceneCtrl.setPadHeld(dir, false);
  }, 280);
  stepTimers.set(dir, timer);
}

function onWindowKeyUp(e) {
  sceneCtrl.walkKey(e, false);
}

// Sync room geometry and open edges
watch(
  [planStore.rooms, planStore.openEdges, () => props.planGeometry],
  () => {
    sceneCtrl.syncGeometry();
    sceneCtrl.relabel();
    sceneCtrl.paintHot();
  },
  { deep: true },
);

// Sync global and per-item 3D finishes, render mode, and lighting atmosphere
watch(
  planStore.sceneStyle,
  () => {
    sceneCtrl.syncStyle();
  },
  { deep: true },
);

// Sync doors and windows
watch(
  planStore.openings,
  () => {
    sceneCtrl.syncOpenings();
    sceneCtrl.relabel();
  },
  { deep: true },
);

// Sync furniture meshes and selection highlights
watch(
  [planStore.furniture, uiStore.selection],
  () => {
    sceneCtrl.syncFurniture();
    sceneCtrl.paintHot();
  },
  { deep: true },
);

// Sync room hover highlight
watch(uiStore.hotRoomId, () => {
  sceneCtrl.paintHot();
});

// Sync White / Black theme colors
watch(uiStore.look, async () => {
  await nextTick();
  sceneCtrl.recolor();
});

// Sync grid visibility
watch(uiStore.gridOn, on => {
  sceneCtrl.setGrid(Boolean(on));
});

// Sync Walk mode toggle
watch(uiStore.walking, on => {
  sceneCtrl.walk(Boolean(on));
});

// Sync EN / AR room labels
watch(lang, async () => {
  await nextTick();
  sceneCtrl.relabel();
});

// Handle toolbar & keyboard camera commands
watch(
  () => uiStore.cameraCommand.value.seq,
  seq => {
    if (!seq) return;
    const action = uiStore.cameraCommand.value.action;
    if (action === 'zoomIn') sceneCtrl.zoom(0.8);
    else if (action === 'zoomOut') sceneCtrl.zoom(1.25);
    else if (action === 'top') sceneCtrl.top();
    else if (action === 'reset' || action === 'fit') sceneCtrl.reset();
    else if (action === 'walkToggle') uiStore.setWalking(!uiStore.walking.value);
  },
);

// Handle room focus commands
watch(
  () => uiStore.focusRoomCommand?.value?.seq,
  seq => {
    if (!seq) return;
    const cmd = uiStore.focusRoomCommand?.value;
    const roomId = cmd?.roomId !== undefined ? cmd.roomId : (cmd?.id ?? null);
    sceneCtrl.focusOnRoom(roomId);
  },
);

// Sync layer visibility toggles (labels, furniture, openings, compass)
watch(
  [
    () => uiStore.showLabels?.value ?? true,
    () => uiStore.showFurniture?.value ?? true,
    () => uiStore.showOpenings?.value ?? true,
    () => uiStore.showCompass?.value ?? true,
  ],
  ([showLabels, showFurniture, showOpenings, showCompass]) => {
    sceneCtrl.setLayersVisibility({ showLabels, showFurniture, showOpenings, showCompass });
  },
  { immediate: true },
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keyup', onWindowKeyUp);
  }

  watch(
    uiStore.is3d,
    is3 => {
      if (is3) {
        sceneCtrl.init().then(ready => {
          if (!ready || !uiStore.is3d.value) return;
          sceneCtrl.syncGeometry();
          sceneCtrl.syncOpenings();
          sceneCtrl.syncFurniture();
          sceneCtrl.recolor();
          sceneCtrl.relabel();
          sceneCtrl.setGrid(uiStore.gridOn.value);
          sceneCtrl.setLayersVisibility({
            showLabels: uiStore.showLabels?.value ?? true,
            showFurniture: uiStore.showFurniture?.value ?? true,
            showOpenings: uiStore.showOpenings?.value ?? true,
            showCompass: uiStore.showCompass?.value ?? true,
          });
          sceneCtrl.start();
        });
      } else {
        sceneCtrl.walk(false, true);
        sceneCtrl.stop();
      }
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keyup', onWindowKeyUp);
  }
  for (const timer of stepTimers.values()) {
    clearTimeout(timer);
  }
  stepTimers.clear();
  sceneCtrl.dispose();
});

defineExpose({
  floorPoint: e => sceneCtrl.floorPoint(e),
  center: () => sceneCtrl.center(),
  walkKey: (e, isDown) => sceneCtrl.walkKey(e, isDown),
  focusOnRoom: roomId => sceneCtrl.focusOnRoom(roomId),
  setLayersVisibility: opts => sceneCtrl.setLayersVisibility(opts),
  getSkyGradient: () => sceneCtrl.getSkyGradient(),
});
</script>

<template>
  <div
    class="view3d"
    :class="{ dragging: isDragging, walk: uiStore.walking.value }"
    :style="view3dStyle"
    role="application"
    :aria-label="t('view3dAria')"
  >
    <div ref="mountRef" class="v3-canvas"></div>
    <div
      v-show="!uiStore.walking.value && isRealistic"
      class="v3-watermark"
      dir="ltr"
      aria-hidden="true"
      :style="watermarkStyle"
    >
      {{ fmt(planStore.stats.value.totalArea) }} {{ t('m2') }}
    </div>
    <div
      ref="labelsRef"
      class="v3-labels"
      :hidden="uiStore.walking.value || !(uiStore.showLabels?.value ?? true)"
    ></div>
    <p v-if="statusMessage" class="v3-msg">{{ statusMessage }}</p>
    <WalkHudOverlay
      v-show="uiStore.walking.value"
      ref="walkHudRef"
      :room-name="uiStore.walkRoomName.value"
      @pad-down="onPadDown"
      @pad-up="onPadUp"
      @pad-step="onPadStep"
    />
  </div>
</template>

<style scoped>
.v3-canvas {
  position: absolute;
  inset: 0;
}
.v3-canvas :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}
.v3-watermark {
  position: absolute;
  top: max(74px, calc(64px + env(safe-area-inset-top, 0px)));
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  user-select: none;
  font-family: var(--f-display);
  font-weight: 600;
  font-size: clamp(22px, 2.8vw, 34px);
  line-height: 1;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 1;
  z-index: 2;
}
.v3-labels :deep(.l3[data-room-id]) {
  pointer-events: auto;
  cursor: pointer;
}
</style>
