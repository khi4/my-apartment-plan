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
import { OPK, OP_KINDS } from '../../data/openingSpecs.js';
import {
  DOOR_TEXTURES,
  DOOR_COLOR_SWATCHES,
  resolveDoorStyle,
} from '../../data/materialPresets.js';
import { fmt, r2 } from '../../core/scale.js';
import {
  segOf,
  swingBlocked,
  validateOpWidthChange,
  validateOpKindChange,
} from '../../core/openings.js';

const HINT_OP = {
  far: 'hintOpFar',
  short: 'hintOpShort',
  taken: 'hintOpTaken',
  end: 'hintOpEnd',
  none: 'hintOpNone',
};

const props = defineProps({
  opening: {
    type: Object,
    required: true,
  },
  planGeometry: {
    type: Object,
    default: null,
  },
});

const { t } = useI18n();
const {
  rooms,
  openings,
  furniture,
  sceneStyle,
  snapshot,
  updateOpening,
  removeOpening,
  applyDoorStyleToAllOpenings,
} = usePlanStore();
const { clearSelection, setHint } = useUiStore();

const editingWidth = ref(false);
const draftWidth = ref('');
let snapshottedInSession = false;

const { activeTag: appliedTag, triggerFeedback, clearFeedback } = useTimedFeedback();
const { onColorInput, onColorChange, resetColorSession } = useColorPickerSession(
  snapshot,
  (patch, opts) => updateOpening(props.opening.id, patch, opts),
);

watch(
  () => props.opening.id,
  () => {
    editingWidth.value = false;
    draftWidth.value = '';
    snapshottedInSession = false;
    resetColorSession();
    clearFeedback();
  },
);

const spec = computed(() => OPK[props.opening.kind] || OPK.door);
const currentWidth = computed(() => r2(props.opening.a2 - props.opening.a1));
const segs = computed(() => props.planGeometry?.SEGS || []);
const seg = computed(() => segOf(props.opening, segs.value));
const hasSwingHit = computed(() => swingBlocked(props.opening, furniture.value));
const endArrows = computed(() => (props.opening.o === 'h' ? ['←', '→'] : ['↑', '↓']));
const doorStyle = computed(() => resolveDoorStyle(props.opening, sceneStyle.value));
const hasCustomFinish = computed(() =>
  Boolean(props.opening.color || props.opening.frameColor || props.opening.texture),
);

function setOpeningFinish(patch) {
  resetColorSession();
  updateOpening(props.opening.id, patch);
}

function handleApplyAllDoors() {
  resetColorSession();
  applyDoorStyleToAllOpenings(doorStyle.value);
  triggerFeedback('doors');
}

function handleResetFinish() {
  resetColorSession();
  clearFeedback();
  updateOpening(props.opening.id, { color: null, frameColor: null, texture: null });
}

function parseNum(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function showOpError(why) {
  setHint(t(HINT_OP[why] || 'hintOpTaken'), 1800);
}

function applyWidthChange(targetWidth, { recordOnce = false } = {}) {
  const clamped = Math.min(spec.value.max, Math.max(spec.value.min, r2(targetWidth)));
  if (Math.abs(clamped - currentWidth.value) < 1e-4) return;
  const res = validateOpWidthChange(props.opening, clamped, segs.value, openings.value);
  if (!res || !res.ok) {
    showOpError(res?.why);
    return;
  }
  const a1 = res.patch?.a1 ?? res.a1 ?? props.opening.a1;
  const a2 = res.patch?.a2 ?? res.a2 ?? r2(a1 + clamped);
  if (recordOnce) {
    if (!snapshottedInSession) {
      snapshot();
      snapshottedInSession = true;
    }
    updateOpening(props.opening.id, { a1, a2 }, { record: false, save: true });
  } else {
    updateOpening(props.opening.id, { a1, a2 });
  }
}

function onWidthFocus() {
  editingWidth.value = true;
  draftWidth.value = fmt(currentWidth.value);
  snapshottedInSession = false;
}

function onWidthInput(event) {
  const raw = event.target.value;
  draftWidth.value = raw;
  const v = parseNum(raw);
  if (v !== null && v >= spec.value.min && v <= spec.value.max) {
    applyWidthChange(v, { recordOnce: true });
  }
}

function onWidthBlur(event) {
  const v = parseNum(event.target.value);
  editingWidth.value = false;
  if (v !== null) {
    applyWidthChange(v, { recordOnce: true });
  }
  snapshottedInSession = false;
}

function onKindChange(nextKind) {
  if (nextKind === props.opening.kind) return;
  const res = validateOpKindChange(
    props.opening,
    nextKind,
    segs.value,
    openings.value,
    rooms.value,
  );
  if (!res || !res.ok) {
    showOpError(res?.why);
    return;
  }
  const patch = res.patch ?? {
    kind: res.kind ?? nextKind,
    a1: res.a1 ?? props.opening.a1,
    a2: res.a2 ?? props.opening.a2,
    ...(res.side !== undefined ? { side: res.side } : {}),
  };
  updateOpening(props.opening.id, patch);
}

function handleRemove() {
  removeOpening(props.opening.id);
  clearSelection();
}
</script>

<template>
  <div>
    <div class="cap">
      <span>{{ t('selected') }}</span>
      <button type="button" class="add" @click="clearSelection()">{{ t('done') }}</button>
    </div>

    <div class="insp-name">{{ t('op_' + opening.kind) }}</div>

    <div class="dims">
      <label>
        <span>{{ t('widthLab') }}</span>
        <input
          type="number"
          :min="spec.min"
          :max="spec.max"
          step="0.05"
          inputmode="decimal"
          dir="ltr"
          :aria-label="t('opWidAria')"
          :value="editingWidth ? draftWidth : fmt(currentWidth)"
          @focus="onWidthFocus"
          @input="onWidthInput"
          @blur="onWidthBlur"
          @keydown.enter="$event.target.blur()"
        />
      </label>
      <span>{{ t('m') }}</span>
    </div>

    <div class="acts" role="group" :aria-label="t('opKindAria')">
      <button
        v-for="k in OP_KINDS"
        :key="k"
        type="button"
        class="act"
        :aria-pressed="String(opening.kind === k)"
        @click="onKindChange(k)"
      >
        {{ t('op_' + k) }}
      </button>
    </div>

    <div class="acts">
      <template v-if="opening.kind === 'door'">
        <button
          type="button"
          class="act"
          @click="updateOpening(opening.id, { hs: !opening.hs })"
        >
          {{ t('opHinge') }}
        </button>
        <button
          type="button"
          class="act"
          @click="updateOpening(opening.id, { side: opening.side === -1 ? 1 : -1 })"
        >
          {{ t('opSwing') }}
        </button>
      </template>
      <button type="button" class="act" @click="handleRemove">{{ t('del') }}</button>
    </div>

    <div class="gaps">
      <div class="cap"><span>{{ t('opPos') }}</span></div>
      <div v-if="seg" class="gap-row" :title="t('opPosNote')">
        <span>{{ endArrows[0] }} <b>{{ fmt(Math.max(0, opening.a1 - seg.a)) }}</b></span>
        <span>{{ endArrows[1] }} <b>{{ fmt(Math.max(0, seg.b - opening.a2)) }}</b></span>
        <span>{{ t('m') }}</span>
      </div>
      <p v-if="hasSwingHit" class="warn hit">{{ t('swingHit') }}</p>
    </div>

    <div class="gaps">
      <div class="cap"><span>{{ t('doorFinishes') }}</span></div>
      <div class="style-group door-style-group">
        <label class="insp-field">
          <span>{{ t('doorTexture') }}</span>
          <select
            class="inline-input"
            :value="doorStyle.texture"
            @change="setOpeningFinish({ texture: $event.target.value })"
          >
            <option v-for="tex in DOOR_TEXTURES" :key="tex.id" :value="tex.id">
              {{ t(tex.labelKey) }}
            </option>
          </select>
        </label>

        <span class="style-sublabel">{{ t('doorColor') }}</span>
        <div class="swatch-row">
          <button
            v-for="hex in DOOR_COLOR_SWATCHES"
            :key="'od-' + hex"
            type="button"
            class="swatch"
            :style="{ backgroundColor: hex }"
            :title="hex"
            :aria-label="`${t('doorColor')} ${hex}`"
            :aria-pressed="String(isSameColor(doorStyle.color, hex))"
            @click="setOpeningFinish({ color: hex })"
          />
          <input
            type="color"
            class="color-pick"
            :value="toHex6(doorStyle.color, '#e6dfd1')"
            :title="t('customColor')"
            :aria-label="`${t('doorColor')} - ${t('customColor')}`"
            @input="onColorInput('doorColor', { color: $event.target.value })"
            @change="onColorChange('doorColor', { color: $event.target.value })"
          />
        </div>

        <span class="style-sublabel">{{ t('doorFrameColor') }}</span>
        <div class="swatch-row">
          <button
            v-for="hex in DOOR_COLOR_SWATCHES"
            :key="'of-' + hex"
            type="button"
            class="swatch"
            :style="{ backgroundColor: hex }"
            :title="hex"
            :aria-label="`${t('doorFrameColor')} ${hex}`"
            :aria-pressed="String(isSameColor(doorStyle.frameColor, hex))"
            @click="setOpeningFinish({ frameColor: hex })"
          />
          <input
            type="color"
            class="color-pick"
            :value="toHex6(doorStyle.frameColor, '#d4ccb8')"
            :title="t('customColor')"
            :aria-label="`${t('doorFrameColor')} - ${t('customColor')}`"
            @input="onColorInput('frameColor', { frameColor: $event.target.value })"
            @change="onColorChange('frameColor', { frameColor: $event.target.value })"
          />
        </div>

        <div class="style-actions">
          <button type="button" class="act" @click="handleApplyAllDoors">
            {{ t('applyAllDoors') }}
          </button>
          <span v-if="appliedTag === 'doors'" class="style-feedback" role="status">
            {{ t('appliedToAll') }}
          </span>
          <button
            v-if="hasCustomFinish"
            type="button"
            class="act"
            @click="handleResetFinish"
          >
            {{ t('resetStyle') }}
          </button>
        </div>
      </div>
    </div>

    <p class="small">{{ t('opHint') }}</p>
  </div>
</template>

<style scoped>
.door-style-group {
  margin-top: 8px;
  padding-top: 0;
  border-top: 0;
}
</style>
