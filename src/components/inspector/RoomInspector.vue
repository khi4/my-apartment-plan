<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import {
  toHex6,
  isSameColor,
  useColorPickerSession,
  useTimedFeedback,
} from '../../composables/useStyleControls.js';
import { SPACE_KINDS, ROOM_MIN_SIZE, ROOM_MAX_SIZE } from '../../data/roomPresets.js';
import {
  WALL_TEXTURES,
  FLOOR_TEXTURES,
  WALL_COLOR_SWATCHES,
  FLOOR_COLOR_SWATCHES,
  resolveRoomWallStyle,
  resolveRoomFloorStyle,
} from '../../data/materialPresets.js';
import { fmt, r2, clampRoomSize } from '../../core/scale.js';
import { getRoomRects } from '../../core/walls.js';

const props = defineProps({
  room: {
    type: Object,
    required: true,
  },
  planGeometry: {
    type: Object,
    default: null,
  },
});

const { isAr, t } = useI18n();
const {
  sceneStyle,
  snapshot,
  updateRoom,
  updateRoomRect,
  swapRoomDims,
  duplicateRoom,
  removeRoom,
  toggleOpenEdge,
  applyWallStyleToAllRooms,
  applyFloorStyleToAllRooms,
  resetRoomStyle,
} = usePlanStore();
const { select, clearSelection } = useUiStore();

// Track active numeric field key (`${rectIdx}-${field}`) so typing isn't overwritten mid-entry
const editingKey = ref(null);
const draftVal = ref('');
let snapshottedInSession = false;

const { activeTag: appliedTag, triggerFeedback, clearFeedback } = useTimedFeedback();
const { onColorInput, onColorChange, resetColorSession } = useColorPickerSession(
  snapshot,
  (patch, opts) => updateRoom(props.room.id, patch, opts),
);

watch(
  () => props.room.id,
  () => {
    editingKey.value = null;
    draftVal.value = '';
    snapshottedInSession = false;
    resetColorSession();
    clearFeedback();
  },
);

const displayName = computed(() => (isAr.value ? props.room.ar || props.room.en : props.room.en || props.room.ar));
const rects = computed(() => getRoomRects(props.room));
const wallStyle = computed(() => resolveRoomWallStyle(props.room, sceneStyle.value));
const floorStyle = computed(() => resolveRoomFloorStyle(props.room, sceneStyle.value));
const hasCustomFinish = computed(() =>
  Boolean(
    props.room.wallColor ||
      props.room.wallTexture ||
      props.room.floorColor ||
      props.room.floorTexture,
  ),
);

function setRoomFinish(patch) {
  resetColorSession();
  updateRoom(props.room.id, patch);
}

function handleApplyWallAll() {
  resetColorSession();
  applyWallStyleToAllRooms(wallStyle.value);
  triggerFeedback('wall');
}

function handleApplyFloorAll() {
  resetColorSession();
  applyFloorStyleToAllRooms({
    ...floorStyle.value,
    includeTerraces: props.room.kind === 'terrace',
  });
  triggerFeedback('floor');
}

function handleResetFinish() {
  resetColorSession();
  clearFeedback();
  resetRoomStyle(props.room.id);
}

const sharedBoundaries = computed(() => {
  const edges = props.planGeometry?.sharedEdges;
  if (!Array.isArray(edges)) return [];
  return edges
    .filter(edge => edge.roomA?.id === props.room.id || edge.roomB?.id === props.room.id)
    .map((edge, idx) => {
      const neighbor = edge.roomA.id === props.room.id ? edge.roomB : edge.roomA;
      const neighborName = isAr.value ? neighbor.ar || neighbor.en : neighbor.en || neighbor.ar;
      const length = fmt(Math.abs(edge.a2 - edge.a1));
      return {
        key: `${edge.o}-${edge.c}-${edge.a1}-${edge.a2}-${idx}`,
        edge,
        neighborName,
        length,
      };
    });
});

function onNameChange(langKey, rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) return;
  if (trimmed !== props.room[langKey]) {
    updateRoom(props.room.id, { [langKey]: trimmed });
  }
}

function fieldValue(rect, idx, fieldIdx) {
  const key = `${idx}-${fieldIdx}`;
  if (editingKey.value === key) return draftVal.value;
  return fmt(rect[fieldIdx]);
}

function parseNum(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function onRectFocus(idx, fieldIdx, rect) {
  editingKey.value = `${idx}-${fieldIdx}`;
  draftVal.value = fmt(rect[fieldIdx]);
  snapshottedInSession = false;
}

function applyRectField(idx, fieldIdx, val, clampDim) {
  const cur = rects.value[idx];
  if (!cur) return;
  const nextVal = clampDim ? clampRoomSize(val) : r2(val);
  if (nextVal === cur[fieldIdx]) return;
  const nextRect = [...cur];
  nextRect[fieldIdx] = nextVal;
  if (!snapshottedInSession) {
    snapshot();
    snapshottedInSession = true;
  }
  updateRoomRect(props.room.id, idx, nextRect, { record: false, save: true });
}

function onRectInput(idx, fieldIdx, event) {
  const raw = event.target.value;
  draftVal.value = raw;
  const v = parseNum(raw);
  if (v === null) return;
  const isSize = fieldIdx === 2 || fieldIdx === 3;
  if (isSize) {
    if (v >= ROOM_MIN_SIZE && v <= ROOM_MAX_SIZE) {
      applyRectField(idx, fieldIdx, v, true);
    }
  } else {
    applyRectField(idx, fieldIdx, v, false);
  }
}

function onRectBlur(idx, fieldIdx, event) {
  const v = parseNum(event.target.value);
  editingKey.value = null;
  if (v !== null) {
    const isSize = fieldIdx === 2 || fieldIdx === 3;
    applyRectField(idx, fieldIdx, v, isSize);
  }
  snapshottedInSession = false;
}

function handleDuplicate() {
  const copy = duplicateRoom(props.room.id);
  if (copy) select('room', copy.id);
}

function handleRemove() {
  removeRoom(props.room.id);
  clearSelection();
}
</script>

<template>
  <div>
    <div class="cap">
      <span>{{ t('selected') }}</span>
      <button type="button" class="add" @click="clearSelection()">{{ t('done') }}</button>
    </div>

    <div class="insp-name">{{ displayName }}</div>

    <div class="insp-fields">
      <div class="insp-grid-2">
        <label class="insp-field">
          <span>{{ t('nameEn') }}</span>
          <input
            class="inline-input"
            type="text"
            dir="ltr"
            :value="room.en"
            @change="onNameChange('en', $event.target.value)"
            @keydown.enter="$event.target.blur()"
          />
        </label>
        <label class="insp-field">
          <span>{{ t('nameAr') }}</span>
          <input
            class="inline-input"
            type="text"
            dir="rtl"
            :value="room.ar"
            @change="onNameChange('ar', $event.target.value)"
            @keydown.enter="$event.target.blur()"
          />
        </label>
      </div>

      <label class="insp-field">
        <span>{{ t('spaceType') }}</span>
        <select
          class="inline-input"
          :value="room.kind"
          @change="updateRoom(room.id, { kind: $event.target.value })"
        >
          <option v-for="k in SPACE_KINDS" :key="k" :value="k">
            {{ t('kind_' + k) }}
          </option>
        </select>
      </label>

      <p v-if="rects.length > 1" class="small">
        {{ t('multiPart') }}
      </p>

      <div
        v-for="(rect, idx) in rects"
        :key="idx"
        class="rect-block"
      >
        <div v-if="rects.length > 1" class="cap part-head">
          <span>{{ t('partLabel', idx + 1) }}</span>
        </div>
        <div class="insp-grid-2">
          <label class="insp-field">
            <span>{{ t('acrossLab') }} ({{ t('m') }})</span>
            <input
              class="inline-input num-input"
              type="number"
              :min="ROOM_MIN_SIZE"
              :max="ROOM_MAX_SIZE"
              step="0.05"
              inputmode="decimal"
              dir="ltr"
              :value="fieldValue(rect, idx, 2)"
              @focus="onRectFocus(idx, 2, rect)"
              @input="onRectInput(idx, 2, $event)"
              @blur="onRectBlur(idx, 2, $event)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <label class="insp-field">
            <span>{{ t('deepLab') }} ({{ t('m') }})</span>
            <input
              class="inline-input num-input"
              type="number"
              :min="ROOM_MIN_SIZE"
              :max="ROOM_MAX_SIZE"
              step="0.05"
              inputmode="decimal"
              dir="ltr"
              :value="fieldValue(rect, idx, 3)"
              @focus="onRectFocus(idx, 3, rect)"
              @input="onRectInput(idx, 3, $event)"
              @blur="onRectBlur(idx, 3, $event)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <label class="insp-field">
            <span>{{ t('posX') }}</span>
            <input
              class="inline-input num-input"
              type="number"
              step="0.05"
              inputmode="decimal"
              dir="ltr"
              :value="fieldValue(rect, idx, 0)"
              @focus="onRectFocus(idx, 0, rect)"
              @input="onRectInput(idx, 0, $event)"
              @blur="onRectBlur(idx, 0, $event)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <label class="insp-field">
            <span>{{ t('posY') }}</span>
            <input
              class="inline-input num-input"
              type="number"
              step="0.05"
              inputmode="decimal"
              dir="ltr"
              :value="fieldValue(rect, idx, 1)"
              @focus="onRectFocus(idx, 1, rect)"
              @input="onRectInput(idx, 1, $event)"
              @blur="onRectBlur(idx, 1, $event)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
        </div>
      </div>
    </div>

    <div class="acts">
      <button type="button" class="act" @click="swapRoomDims(room.id)">{{ t('swapDims') }}</button>
      <button type="button" class="act" @click="handleDuplicate">{{ t('dup') }}</button>
      <button type="button" class="act" @click="handleRemove">{{ t('del') }}</button>
    </div>

    <div class="gaps">
      <div class="cap"><span>{{ t('sharedWalls') }}</span></div>
      <p v-if="!sharedBoundaries.length" class="small">{{ t('sharedWallsEmpty') }}</p>
      <div v-else class="shared-edge-list">
        <div v-for="b in sharedBoundaries" :key="b.key" class="shared-edge-row">
          <span>
            {{ b.neighborName }}
            <span class="num" dir="ltr">({{ b.length }} {{ t('m') }})</span>
          </span>
          <button
            type="button"
            class="act"
            :aria-pressed="String(Boolean(b.edge.isOpen))"
            @click="toggleOpenEdge(b.edge.o, b.edge.c, b.edge.a1, b.edge.a2)"
          >
            {{ b.edge.isOpen ? t('edgeOpen') : t('edgeWall') }}
          </button>
        </div>
      </div>
      <p class="small">{{ t('roomHint') }}</p>
    </div>

    <div class="gaps">
      <div class="cap"><span>{{ t('roomFinishes') }}</span></div>

      <div class="style-group room-style-group">
        <label class="insp-field">
          <span>{{ t('wallTexture') }}</span>
          <select
            class="inline-input"
            :value="wallStyle.texture"
            @change="setRoomFinish({ wallTexture: $event.target.value })"
          >
            <option v-for="tex in WALL_TEXTURES" :key="tex.id" :value="tex.id">
              {{ t(tex.labelKey) }}
            </option>
          </select>
        </label>
        <span class="style-sublabel">{{ t('wallColor') }}</span>
        <div class="swatch-row">
          <button
            v-for="hex in WALL_COLOR_SWATCHES"
            :key="'rw-' + hex"
            type="button"
            class="swatch"
            :style="{ backgroundColor: hex }"
            :title="hex"
            :aria-label="`${t('wallColor')} ${hex}`"
            :aria-pressed="String(isSameColor(wallStyle.color, hex))"
            @click="setRoomFinish({ wallColor: hex })"
          />
          <input
            type="color"
            class="color-pick"
            :value="toHex6(wallStyle.color, '#f2ede2')"
            :title="t('customColor')"
            :aria-label="`${t('wallColor')} - ${t('customColor')}`"
            @input="onColorInput('wall', { wallColor: $event.target.value })"
            @change="onColorChange('wall', { wallColor: $event.target.value })"
          />
        </div>
        <div class="style-actions">
          <button type="button" class="act" @click="handleApplyWallAll">
            {{ t('applyAllRooms') }}
          </button>
          <span v-if="appliedTag === 'wall'" class="style-feedback" role="status">
            {{ t('appliedToAll') }}
          </span>
        </div>
      </div>

      <div class="style-group">
        <label class="insp-field">
          <span>{{ t('floorTexture') }}</span>
          <select
            class="inline-input"
            :value="floorStyle.texture"
            @change="setRoomFinish({ floorTexture: $event.target.value })"
          >
            <option v-for="tex in FLOOR_TEXTURES" :key="tex.id" :value="tex.id">
              {{ t(tex.labelKey) }}
            </option>
          </select>
        </label>
        <span class="style-sublabel">{{ t('floorColor') }}</span>
        <div class="swatch-row">
          <button
            v-for="hex in FLOOR_COLOR_SWATCHES"
            :key="'rf-' + hex"
            type="button"
            class="swatch"
            :style="{ backgroundColor: hex }"
            :title="hex"
            :aria-label="`${t('floorColor')} ${hex}`"
            :aria-pressed="String(isSameColor(floorStyle.color, hex))"
            @click="setRoomFinish({ floorColor: hex })"
          />
          <input
            type="color"
            class="color-pick"
            :value="toHex6(floorStyle.color, '#c89b68')"
            :title="t('customColor')"
            :aria-label="`${t('floorColor')} - ${t('customColor')}`"
            @input="onColorInput('floor', { floorColor: $event.target.value })"
            @change="onColorChange('floor', { floorColor: $event.target.value })"
          />
        </div>
        <div class="style-actions">
          <button type="button" class="act" @click="handleApplyFloorAll">
            {{ t('applyAllFloors') }}
          </button>
          <span v-if="appliedTag === 'floor'" class="style-feedback" role="status">
            {{ t('appliedToAll') }}
          </span>
        </div>
      </div>

      <div v-if="hasCustomFinish" class="style-actions">
        <button type="button" class="act" @click="handleResetFinish">
          {{ t('resetStyle') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.num-input {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
}
.rect-block + .rect-block {
  padding-top: 8px;
  border-top: 1px solid var(--faint);
}
.part-head {
  margin-bottom: 4px;
}
.room-style-group {
  margin-top: 8px;
  padding-top: 0;
  border-top: 0;
}
</style>
