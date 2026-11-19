<script setup>
import { ref, computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { FURN_MIN, FURN_MAX } from '../../data/furnitureCatalog.js';
import { fmt, clampSize } from '../../core/scale.js';
import { thumbSvg } from '../../core/furnitureShapes2D.js';

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['add', 'start-drag']);

const { isAr, t } = useI18n();
const { furnPaletteSizes, setFurnPaletteSize } = usePlanStore();

const editingL = ref(false);
const draftL = ref('');
const editingW = ref(false);
const draftW = ref('');

const label = computed(() => (isAr.value ? props.item.ar : props.item.en));
const L = computed(() => furnPaletteSizes[props.item.type]?.[0] ?? props.item.length);
const W = computed(() => furnPaletteSizes[props.item.type]?.[1] ?? props.item.width);
const thumbHtml = computed(() => thumbSvg(props.item.type, L.value, W.value));

function parseNum(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function onLFocus() {
  editingL.value = true;
  draftL.value = fmt(L.value);
}

function onLInput(event) {
  const raw = event.target.value;
  draftL.value = raw;
  const v = parseNum(raw);
  if (v !== null && v >= FURN_MIN && v <= FURN_MAX) {
    setFurnPaletteSize(props.item.type, clampSize(v), null);
  }
}

function onLBlur(event) {
  editingL.value = false;
  const v = parseNum(event.target.value);
  if (v !== null) {
    setFurnPaletteSize(props.item.type, clampSize(v), null);
  }
}

function onWFocus() {
  editingW.value = true;
  draftW.value = fmt(W.value);
}

function onWInput(event) {
  const raw = event.target.value;
  draftW.value = raw;
  const v = parseNum(raw);
  if (v !== null && v >= FURN_MIN && v <= FURN_MAX) {
    setFurnPaletteSize(props.item.type, null, clampSize(v));
  }
}

function onWBlur(event) {
  editingW.value = false;
  const v = parseNum(event.target.value);
  if (v !== null) {
    setFurnPaletteSize(props.item.type, null, clampSize(v));
  }
}

function emitAdd() {
  emit('add', {
    kind: 'furniture',
    type: props.item.type,
    L: L.value,
    W: W.value,
  });
}

function onEnterDim(event, which) {
  const v = parseNum(event.target.value);
  if (v !== null) {
    if (which === 'L') setFurnPaletteSize(props.item.type, clampSize(v), null);
    else setFurnPaletteSize(props.item.type, null, clampSize(v));
  }
  emitAdd();
}

function onThumbPointerDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  emit(
    'start-drag',
    {
      kind: 'newFurn',
      type: props.item.type,
      L: L.value,
      W: W.value,
    },
    event,
  );
}
</script>

<template>
  <div class="pi">
    <div
      class="thumb"
      tabindex="0"
      role="button"
      :aria-label="t('dragAria', label)"
      v-html="thumbHtml"
      @pointerdown="onThumbPointerDown"
      @keydown.enter.prevent="emitAdd"
      @keydown.space.prevent="emitAdd"
    ></div>

    <div>
      <div class="pi-name">
        <span class="pi-label">{{ label }}</span>
        <button type="button" class="add" @click="emitAdd">{{ t('add') }}</button>
      </div>
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
            :aria-label="t('lenAria', label)"
            :value="editingL ? draftL : fmt(L)"
            @focus="onLFocus"
            @input="onLInput"
            @blur="onLBlur"
            @keydown.enter.prevent="onEnterDim($event, 'L')"
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
            :aria-label="t('widAria', label)"
            :value="editingW ? draftW : fmt(W)"
            @focus="onWFocus"
            @input="onWInput"
            @blur="onWBlur"
            @keydown.enter.prevent="onEnterDim($event, 'W')"
          />
        </label>
      </div>
    </div>
  </div>
</template>
