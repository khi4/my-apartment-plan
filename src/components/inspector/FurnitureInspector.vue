<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import {
  toHex6,
  isSameColor,
  useColorPickerSession,
} from '../../composables/useStyleControls.js';
import { FURN_MIN, FURN_MAX, FURNITURE_BY_TYPE } from '../../data/furnitureCatalog.js';
import {
  FURNITURE_TEXTURES,
  FURNITURE_COLOR_SWATCHES,
  resolveFurnitureStyle,
} from '../../data/materialPresets.js';
import { fmt, clampSize } from '../../core/scale.js';
import { gapsFor } from '../../core/clearance.js';

const DIRS = [
  ['left', '←'],
  ['right', '→'],
  ['up', '↑'],
  ['down', '↓'],
];

const props = defineProps({
  item: {
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
  furniture,
  snapshot,
  updateFurniture,
  rotateFurniture,
  flipFurniture,
  duplicateFurniture,
  removeFurniture,
  resetFurnitureStyle,
} = usePlanStore();
const { select, clearSelection } = useUiStore();

const editingL = ref(false);
const draftL = ref('');
const editingW = ref(false);
const draftW = ref('');
let snapshottedInSession = false;

const { onColorInput, onColorChange, resetColorSession } = useColorPickerSession(
  snapshot,
  (patch, opts) => updateFurniture(props.item.id, patch, opts),
);

watch(
  () => props.item.id,
  () => {
    editingL.value = false;
    draftL.value = '';
    editingW.value = false;
    draftW.value = '';
    snapshottedInSession = false;
    resetColorSession();
  },
);

const itemLabel = computed(() => {
  const def = FURNITURE_BY_TYPE[props.item.type];
  if (!def) return props.item.type;
  return isAr.value ? def.ar : def.en;
});

const furnStyle = computed(() => resolveFurnitureStyle(props.item));
const hasCustomFinish = computed(() =>
  Boolean(props.item.color || props.item.accentColor || props.item.texture),
);

function setFurnFinish(patch) {
  resetColorSession();
  updateFurniture(props.item.id, patch);
}

function handleResetFinish() {
  resetColorSession();
  resetFurnitureStyle(props.item.id);
}

const gaps = computed(() =>
  gapsFor(props.item, furniture.value, props.planGeometry?.WALLS || []),
);

const gapWarnings = computed(() => {
  const g = gaps.value;
  if (!g) return [];
  return [g.wall && t('overlapWall'), g.item && t('overlapItem')].filter(Boolean);
});

function fmtGap(d) {
  return Number.isFinite(d) && d < 100 ? fmt(d) : '–';
}

function parseNum(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function applySize(key, val) {
  const clamped = clampSize(val);
  if (clamped === props.item[key]) return;
  if (!snapshottedInSession) {
    snapshot();
    snapshottedInSession = true;
  }
  updateFurniture(props.item.id, { [key]: clamped }, { record: false, save: true });
}

function onLFocus() {
  editingL.value = true;
  draftL.value = fmt(props.item.L);
  snapshottedInSession = false;
}

function onLInput(event) {
  const raw = event.target.value;
  draftL.value = raw;
  const v = parseNum(raw);
  if (v !== null && v >= FURN_MIN && v <= FURN_MAX) {
    applySize('L', v);
  }
}

function onLBlur(event) {
  const v = parseNum(event.target.value);
  editingL.value = false;
  if (v !== null) applySize('L', v);
  snapshottedInSession = false;
}

function onWFocus() {
  editingW.value = true;
  draftW.value = fmt(props.item.W);
  snapshottedInSession = false;
}

function onWInput(event) {
  const raw = event.target.value;
  draftW.value = raw;
  const v = parseNum(raw);
  if (v !== null && v >= FURN_MIN && v <= FURN_MAX) {
    applySize('W', v);
  }
}

function onWBlur(event) {
  const v = parseNum(event.target.value);
  editingW.value = false;
  if (v !== null) applySize('W', v);
  snapshottedInSession = false;
}

function handleDuplicate() {
  const copy = duplicateFurniture(props.item.id);
  if (copy) select('furniture', copy.id);
}

function handleRemove() {
  removeFurniture(props.item.id);
  clearSelection();
}
</script>

<template>
  <div>
    <div class="cap">
      <span>{{ t('selected') }}</span>
      <button type="button" class="add" @click="clearSelection()">{{ t('done') }}</button>
    </div>

    <div class="insp-name">{{ itemLabel }}</div>

    <div class="dims">
      <label>
        <span>{{ t('L') }}</span>
        <input
          type="number"
          :min="FURN_MIN"
          :max="FURN_MAX"
          step="0.05"
          inputmode="decimal"
          dir="ltr"
          :aria-label="t('inspLenAria')"
          :value="editingL ? draftL : fmt(item.L)"
          @focus="onLFocus"
          @input="onLInput"
          @blur="onLBlur"
          @keydown.enter="$event.target.blur()"
        />
      </label>
      <label>
        <span>{{ t('W') }}</span>
        <input
          type="number"
          :min="FURN_MIN"
          :max="FURN_MAX"
          step="0.05"
          inputmode="decimal"
          dir="ltr"
          :aria-label="t('inspWidAria')"
          :value="editingW ? draftW : fmt(item.W)"
          @focus="onWFocus"
          @input="onWInput"
          @blur="onWBlur"
          @keydown.enter="$event.target.blur()"
        />
      </label>
      <span>{{ t('m') }}</span>
    </div>

    <div class="acts">
      <button type="button" class="act" @click="rotateFurniture(item.id, 90)">{{ t('rot') }}</button>
      <button type="button" class="act" @click="flipFurniture(item.id)">{{ t('flip') }}</button>
      <button type="button" class="act" @click="handleDuplicate">{{ t('dup') }}</button>
      <button type="button" class="act" @click="handleRemove">{{ t('del') }}</button>
    </div>

    <div class="gaps">
      <div class="cap"><span>{{ t('gapsTitle') }}</span></div>
      <div class="gap-row" :title="t('gapsNote')">
        <span
          v-for="[dirKey, arrow] in DIRS"
          :key="dirKey"
          :title="t('dir_' + dirKey)"
        >
          {{ arrow }} <b>{{ fmtGap(gaps?.sides?.[dirKey]?.d) }}</b>
        </span>
        <span>{{ t('m') }}</span>
      </div>
      <p v-if="gapWarnings.length" class="warn">{{ gapWarnings.join(' · ') }}</p>
    </div>

    <div class="gaps">
      <div class="cap"><span>{{ t('furnFinishes') }}</span></div>
      <div class="style-group furn-style-group">
        <label class="insp-field">
          <span>{{ t('furnTexture') }}</span>
          <select
            class="inline-input"
            :value="furnStyle.texture"
            @change="setFurnFinish({ texture: $event.target.value })"
          >
            <option v-for="tex in FURNITURE_TEXTURES" :key="tex.id" :value="tex.id">
              {{ t(tex.labelKey) }}
            </option>
          </select>
        </label>

        <span class="style-sublabel">{{ t('furnPrimaryColor') }}</span>
        <div class="swatch-row">
          <button
            v-for="hex in FURNITURE_COLOR_SWATCHES"
            :key="'fp-' + hex"
            type="button"
            class="swatch"
            :style="{ backgroundColor: hex }"
            :title="hex"
            :aria-label="`${t('furnPrimaryColor')} ${hex}`"
            :aria-pressed="String(isSameColor(furnStyle.color, hex))"
            @click="setFurnFinish({ color: hex })"
          />
          <input
            type="color"
            class="color-pick"
            :value="toHex6(furnStyle.color, '#b98b56')"
            :title="t('customColor')"
            :aria-label="`${t('furnPrimaryColor')} - ${t('customColor')}`"
            @input="onColorInput('primary', { color: $event.target.value })"
            @change="onColorChange('primary', { color: $event.target.value })"
          />
        </div>

        <span class="style-sublabel">{{ t('furnAccentColor') }}</span>
        <div class="swatch-row">
          <button
            v-for="hex in FURNITURE_COLOR_SWATCHES"
            :key="'fa-' + hex"
            type="button"
            class="swatch"
            :style="{ backgroundColor: hex }"
            :title="hex"
            :aria-label="`${t('furnAccentColor')} ${hex}`"
            :aria-pressed="String(isSameColor(furnStyle.accentColor, hex))"
            @click="setFurnFinish({ accentColor: hex })"
          />
          <input
            type="color"
            class="color-pick"
            :value="toHex6(furnStyle.accentColor, '#8d7b68')"
            :title="t('customColor')"
            :aria-label="`${t('furnAccentColor')} - ${t('customColor')}`"
            @input="onColorInput('accent', { accentColor: $event.target.value })"
            @change="onColorChange('accent', { accentColor: $event.target.value })"
          />
        </div>

        <div class="style-actions">
          <button
            type="button"
            class="act"
            :disabled="!hasCustomFinish"
            @click="handleResetFinish"
          >
            {{ t('resetStyle') }}
          </button>
        </div>
      </div>
    </div>

    <p class="small">{{ t('inspHint') }}</p>
  </div>
</template>

<style scoped>
.furn-style-group {
  margin-top: 8px;
  padding-top: 0;
  border-top: 0;
}
</style>
