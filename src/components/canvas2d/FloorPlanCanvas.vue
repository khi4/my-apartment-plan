<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { getRoomRects } from '../../core/walls.js';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useCanvasPanZoom } from '../../composables/useCanvasPanZoom.js';
import { useMeasureTool } from '../../composables/useMeasureTool.js';
import { useDragLifecycle } from '../../composables/useDragLifecycle.js';
import RoomsLayer from './RoomsLayer.vue';
import OpeningsLayer from './OpeningsLayer.vue';
import GridAndRulersLayer from './GridAndRulersLayer.vue';
import RoomLabelsLayer from './RoomLabelsLayer.vue';
import FurnitureLayer from './FurnitureLayer.vue';
import SelectionAndGapsLayer from './SelectionAndGapsLayer.vue';
import MeasureLayer from './MeasureLayer.vue';
import CompassRoseLayer from './CompassRoseLayer.vue';

const props = defineProps({
  planGeometry: {
    type: Object,
    required: true,
  },
  visibleCenterRef: {
    type: [Object, Function],
    default: null,
  },
});

const emit = defineEmits(['zoom-change']);

const { t } = useI18n();
const { rooms, isEmpty, loadTemplate } = usePlanStore();
const uiStore = useUiStore();
const {
  is3d,
  isMeasuring,
  isDrawingRoom,
  gridOn,
  cameraCommand,
  setTool,
  clearSelection,
  clearMeasure,
  setCoord,
} = uiStore;

const showLabels = computed(() => uiStore.showLabels?.value ?? true);
const showFurniture = computed(() => uiStore.showFurniture?.value ?? true);
const showOpenings = computed(() => uiStore.showOpenings?.value ?? true);
const showCompass = computed(() => uiStore.showCompass?.value ?? true);

const svgRef = ref(null);
const boundsRef = computed(() => props.planGeometry?.bounds);

const {
  vb,
  zoomFactor,
  viewBoxString,
  isPanning,
  spacePressed,
  visibleCenter,
  fitToBounds,
  focusRect,
  zoomBy,
  toPlan,
  overSvg,
  onSvgPointerDown: onPanPointerDown,
} = useCanvasPanZoom(svgRef, boundsRef);

const {
  onPointerDown: measurePointerDown,
  onPointerMove: measurePointerMove,
} = useMeasureTool(toPlan);

const {
  initDragContext,
  startDrawRoom,
  abortDrag,
} = useDragLifecycle();

const svgStyle = computed(() => {
  const style = {
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };
  if (isPanning.value) {
    style.cursor = 'grabbing';
  } else if (spacePressed.value) {
    style.cursor = 'grab';
  }
  return style;
});

function syncVisibleCenterRef() {
  if (!props.visibleCenterRef) return;
  const center = visibleCenter();
  if (typeof props.visibleCenterRef === 'function') {
    props.visibleCenterRef(center);
  } else if (typeof props.visibleCenterRef === 'object' && 'value' in props.visibleCenterRef) {
    props.visibleCenterRef.value = center;
  }
}

watch(
  zoomFactor,
  z => {
    emit('zoom-change', z);
    syncVisibleCenterRef();
  },
  { immediate: true },
);

watch(viewBoxString, () => {
  syncVisibleCenterRef();
});

watch(
  () => cameraCommand.value.seq,
  () => {
    if (is3d.value) return;
    const action = cameraCommand.value.action;
    if (action === 'zoomIn') zoomBy(1.25);
    else if (action === 'zoomOut') zoomBy(0.8);
    else if (action === 'fit' || action === 'reset') fitToBounds();
  },
);

watch(
  () => uiStore.focusRoomCommand?.value?.seq,
  seq => {
    if (!seq || is3d.value) return;
    const cmd = uiStore.focusRoomCommand?.value;
    const roomId = cmd?.roomId !== undefined ? cmd.roomId : (cmd?.id ?? null);
    if (!roomId) {
      fitToBounds();
      return;
    }
    const room = rooms.value.find(r => r.id === roomId);
    if (!room) return;
    const rects = getRoomRects(room);
    if (!rects.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [rx, ry, rw, rh] of rects) {
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx + rw);
      maxY = Math.max(maxY, ry + rh);
    }
    focusRect([minX, minY, maxX - minX, maxY - minY]);
  },
);

function onSvgPointerDownCapture(e) {
  if (e.target?.closest?.('.compass-interactive')) return;
  if (
    e.button === 1 ||
    e.button === 2 ||
    (e.button === 0 && (e.altKey || spacePressed.value))
  ) {
    onPanPointerDown(e);
  }
}

function onSvgPointerDown(e) {
  if (e.target?.closest?.('.compass-interactive')) return;
  if (
    onPanPointerDown(e, {
      allowLeftBgPan: !isMeasuring.value && !isDrawingRoom.value,
      onPlainClick: () => {
        abortDrag();
        clearSelection();
      },
    })
  ) {
    return;
  }
  if (isMeasuring.value) {
    measurePointerDown(e);
    return;
  }
  if (isDrawingRoom.value) {
    if (e.button === 0) startDrawRoom(e);
    return;
  }
  if (e.button === 0) {
    abortDrag();
    clearSelection();
  }
}

function onSvgPointerMove(e) {
  setCoord(toPlan(e));
  if (isMeasuring.value) {
    measurePointerMove(e);
  }
}

function onSvgPointerLeave() {
  setCoord(null);
}

function startDrawingEmpty() {
  setTool('draw-room');
}

async function loadStarter(templateId) {
  if (loadTemplate(templateId)) {
    clearSelection();
    clearMeasure();
    await nextTick();
    fitToBounds();
  }
}

onMounted(() => {
  initDragContext({
    svgRef,
    toPlan,
    over2d: overSvg,
    getPlanGeometry: () => props.planGeometry,
  });
  syncVisibleCenterRef();
});

onBeforeUnmount(() => {
  initDragContext({
    svgRef: null,
    toPlan: null,
    over2d: null,
  });
});

defineExpose({
  toPlan,
  visibleCenter,
  fitToBounds,
  focusRect,
  zoomBy,
  zoomFactor,
});
</script>

<template>
  <div class="plan-stage">
    <div class="plan-scroll">
      <svg
        id="plan"
        ref="svgRef"
        :viewBox="viewBoxString"
        preserveAspectRatio="xMidYMid meet"
        :class="{
          measuring: isMeasuring,
          'drawing-room': isDrawingRoom,
        }"
        :style="svgStyle"
        role="img"
        :aria-label="t('planAria')"
        @pointerdown.capture="onSvgPointerDownCapture"
        @pointerdown="onSvgPointerDown"
        @pointermove="onSvgPointerMove"
        @pointerleave="onSvgPointerLeave"
      >
        <defs>
          <pattern
            id="hatch"
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="14" height="14" class="pat-bg" />
            <line x1="0" y1="0" x2="0" y2="14" class="pat-ln" />
          </pattern>
          <pattern
            id="dots"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <rect width="16" height="16" class="pat-bg" />
            <circle cx="8" cy="8" r="1.5" class="pat-dot" />
          </pattern>
        </defs>

        <!-- Exact SVG layer order from bottom to top -->
        <RoomsLayer :plan-geometry="planGeometry" />
        <OpeningsLayer v-show="showOpenings" mode="symbols" :plan-geometry="planGeometry" />
        <GridAndRulersLayer
          :bounds="planGeometry.bounds"
          :view-box="vb"
          :grid-on="gridOn"
        />
        <RoomLabelsLayer v-show="showLabels" :rooms="rooms" />
        <OpeningsLayer v-show="showOpenings" mode="handles" :plan-geometry="planGeometry" />
        <FurnitureLayer v-show="showFurniture" />
        <OpeningsLayer v-show="showOpenings" mode="warnings" :plan-geometry="planGeometry" />
        <CompassRoseLayer
          v-if="showCompass && !isEmpty"
          :bounds="planGeometry.bounds"
          :to-plan="toPlan"
        />
        <SelectionAndGapsLayer :plan-geometry="planGeometry" />
        <MeasureLayer />
      </svg>
    </div>

    <div v-if="isEmpty" class="empty-canvas-overlay">
      <div class="empty-canvas-card">
        <h3>{{ t('emptyCanvasTitle') }}</h3>
        <p>{{ t('emptyCanvasDesc') }}</p>
        <div class="empty-canvas-actions">
          <button type="button" class="btn btn-ink" @click="startDrawingEmpty">
            {{ t('emptyCanvasDraw') }}
          </button>
          <button type="button" class="btn" @click="loadStarter('studio')">
            {{ t('emptyCanvasStudio') }}
          </button>
          <button type="button" class="btn" @click="loadStarter('apartment')">
            {{ t('emptyCanvasApartment') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
