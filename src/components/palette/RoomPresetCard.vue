<script>
let nextUid = 0;
</script>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { ROOM_MIN_SIZE, ROOM_MAX_SIZE } from '../../data/roomPresets.js';
import { m, fmt, clampRoomSize } from '../../core/scale.js';

const props = defineProps({
  preset: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['add', 'start-drag']);

const uid = ++nextUid;
const dotsPatternId = `room-dots-${uid}`;
const hatchPatternId = `room-hatch-${uid}`;

const { isAr, t } = useI18n();
const { roomPaletteSizes, setRoomPaletteSize } = usePlanStore();

const editingAcross = ref(false);
const draftAcross = ref('');
const editingDeep = ref(false);
const draftDeep = ref('');

const label = computed(() => (isAr.value ? props.preset.ar : props.preset.en));

const across = computed(() => roomPaletteSizes[props.preset.id]?.[0] ?? props.preset.across);
const deep = computed(() => roomPaletteSizes[props.preset.id]?.[1] ?? props.preset.deep);

const svgGeometry = computed(() => {
  const w = Math.max(ROOM_MIN_SIZE, across.value);
  const h = Math.max(ROOM_MIN_SIZE, deep.value);
  const pad = Math.max(w, h) * 0.14;
  const vb = `${m(-pad)} ${m(-pad)} ${m(w + 2 * pad)} ${m(h + 2 * pad)}`;
  return {
    vb,
    w: m(w),
    h: m(h),
  };
});

const floorClass = computed(() => {
  if (props.preset.kind === 'terrace') return 'floor terr';
  if (props.preset.kind === 'hall') return 'floor hall';
  if (props.preset.kind === 'void') return 'floor void';
  return 'floor';
});

const floorFillStyle = computed(() => {
  if (props.preset.kind === 'terrace') return { fill: `url(#${dotsPatternId})` };
  if (props.preset.kind === 'void') return { fill: `url(#${hatchPatternId})` };
  return undefined;
});

function parseDim(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function onAcrossFocus() {
  editingAcross.value = true;
  draftAcross.value = fmt(across.value);
}

function onAcrossInput(event) {
  const raw = event.target.value;
  draftAcross.value = raw;
  const v = parseDim(raw);
  if (v !== null && v >= ROOM_MIN_SIZE && v <= ROOM_MAX_SIZE) {
    setRoomPaletteSize(props.preset.id, clampRoomSize(v), null);
  }
}

function onAcrossBlur(event) {
  editingAcross.value = false;
  const v = parseDim(event.target.value);
  if (v !== null) {
    setRoomPaletteSize(props.preset.id, clampRoomSize(v), null);
  }
}

function onDeepFocus() {
  editingDeep.value = true;
  draftDeep.value = fmt(deep.value);
}

function onDeepInput(event) {
  const raw = event.target.value;
  draftDeep.value = raw;
  const v = parseDim(raw);
  if (v !== null && v >= ROOM_MIN_SIZE && v <= ROOM_MAX_SIZE) {
    setRoomPaletteSize(props.preset.id, null, clampRoomSize(v));
  }
}

function onDeepBlur(event) {
  editingDeep.value = false;
  const v = parseDim(event.target.value);
  if (v !== null) {
    setRoomPaletteSize(props.preset.id, null, clampRoomSize(v));
  }
}

function emitAdd() {
  emit('add', {
    kind: 'room',
    preset: props.preset,
    across: across.value,
    deep: deep.value,
  });
}

function onEnterDim(event, which) {
  const v = parseDim(event.target.value);
  if (v !== null) {
    if (which === 'across') setRoomPaletteSize(props.preset.id, clampRoomSize(v), null);
    else setRoomPaletteSize(props.preset.id, null, clampRoomSize(v));
  }
  emitAdd();
}

function onThumbPointerDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  emit(
    'start-drag',
    {
      kind: 'newRoom',
      preset: props.preset,
      across: across.value,
      deep: deep.value,
    },
    event,
  );
}
</script>

<template>
  <div class="pi">
    <div
      class="thumb room-thumb"
      tabindex="0"
      role="button"
      :aria-label="t('roomDragAria', label)"
      @pointerdown="onThumbPointerDown"
      @keydown.enter.prevent="emitAdd"
      @keydown.space.prevent="emitAdd"
    >
      <svg :viewBox="svgGeometry.vb" aria-hidden="true">
        <defs>
          <pattern
            v-if="preset.kind === 'terrace'"
            :id="dotsPatternId"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <rect width="16" height="16" class="pat-bg" />
            <circle cx="8" cy="8" r="1.5" class="pat-dot" />
          </pattern>
          <pattern
            v-else-if="preset.kind === 'void'"
            :id="hatchPatternId"
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="14" height="14" class="pat-bg" />
            <line x1="0" y1="0" x2="0" y2="14" class="pat-ln" />
          </pattern>
        </defs>
        <rect
          x="0"
          y="0"
          :width="svgGeometry.w"
          :height="svgGeometry.h"
          :class="floorClass"
          :style="floorFillStyle"
        />
        <template v-if="preset.kind === 'void'">
          <line x1="0" y1="0" :x2="svgGeometry.w" :y2="svgGeometry.h" class="x-line" />
          <line :x1="svgGeometry.w" y1="0" x2="0" :y2="svgGeometry.h" class="x-line" />
        </template>
        <rect
          x="0"
          y="0"
          :width="svgGeometry.w"
          :height="svgGeometry.h"
          :class="preset.kind === 'terrace' ? 'rail' : 'wall'"
        />
      </svg>
    </div>

    <div>
      <div class="pi-name">
        <span class="pi-label">{{ label }}</span>
        <button type="button" class="add" @click="emitAdd">{{ t('add') }}</button>
      </div>
      <div class="pi-meta">
        <span class="kind-pill" :data-kind="preset.kind">{{ t('kind_' + preset.kind) }}</span>
      </div>
      <div class="dims">
        <label>
          <span>{{ t('acrossLab') }}</span>
          <input
            type="number"
            :min="ROOM_MIN_SIZE"
            :max="ROOM_MAX_SIZE"
            step="0.05"
            inputmode="decimal"
            dir="ltr"
            :aria-label="t('acrossAria', label)"
            :value="editingAcross ? draftAcross : fmt(across)"
            @focus="onAcrossFocus"
            @input="onAcrossInput"
            @blur="onAcrossBlur"
            @keydown.enter.prevent="onEnterDim($event, 'across')"
          />
        </label>
        <label>
          <span>{{ t('deepLab') }}</span>
          <input
            type="number"
            :min="ROOM_MIN_SIZE"
            :max="ROOM_MAX_SIZE"
            step="0.05"
            inputmode="decimal"
            dir="ltr"
            :aria-label="t('deepAria', label)"
            :value="editingDeep ? draftDeep : fmt(deep)"
            @focus="onDeepFocus"
            @input="onDeepInput"
            @blur="onDeepBlur"
            @keydown.enter.prevent="onEnterDim($event, 'deep')"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pi-meta {
  margin-top: 3px;
}
.room-thumb :deep(.wall) {
  stroke-width: 2;
}
.room-thumb :deep(.rail) {
  stroke-width: 1.8;
}
</style>
