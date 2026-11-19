<script setup>
import { ref, computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { OPK } from '../../data/openingSpecs.js';
import { fmt, r2 } from '../../core/scale.js';
import { thumbOp } from '../../core/openings.js';

const props = defineProps({
  opKind: {
    type: String,
    required: true,
    validator: v => Boolean(OPK[v]),
  },
});

const emit = defineEmits(['add', 'start-drag']);

const { t } = useI18n();
const { opPaletteWidths, setOpPaletteWidth } = usePlanStore();

const editingWidth = ref(false);
const draftWidth = ref('');

const spec = computed(() => OPK[props.opKind]);
const label = computed(() => t('op_' + props.opKind));
const width = computed(() => opPaletteWidths[props.opKind] ?? spec.value.w);
const thumbSvgHtml = computed(() => thumbOp(props.opKind, width.value));

function parseNum(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function clampOpWidth(v) {
  return Math.min(spec.value.max, Math.max(spec.value.min, r2(v)));
}

function onWidthFocus() {
  editingWidth.value = true;
  draftWidth.value = fmt(width.value);
}

function onWidthInput(event) {
  const raw = event.target.value;
  draftWidth.value = raw;
  const v = parseNum(raw);
  if (v !== null && v >= spec.value.min && v <= spec.value.max) {
    setOpPaletteWidth(props.opKind, clampOpWidth(v));
  }
}

function onWidthBlur(event) {
  editingWidth.value = false;
  const v = parseNum(event.target.value);
  if (v !== null) {
    setOpPaletteWidth(props.opKind, clampOpWidth(v));
  }
}

function emitAdd() {
  emit('add', {
    kind: 'opening',
    opKind: props.opKind,
    width: width.value,
  });
}

function onEnterWidth(event) {
  const v = parseNum(event.target.value);
  if (v !== null) {
    setOpPaletteWidth(props.opKind, clampOpWidth(v));
  }
  emitAdd();
}

function onThumbPointerDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  emit(
    'start-drag',
    {
      kind: 'newOp',
      opKind: props.opKind,
      width: width.value,
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
      :aria-label="t('opDragAria', label)"
      v-html="thumbSvgHtml"
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
          <span>{{ t('widthLab') }}</span>
          <input
            type="number"
            :min="spec.min"
            :max="spec.max"
            step="0.05"
            inputmode="decimal"
            dir="ltr"
            :aria-label="t('widAria', label)"
            :value="editingWidth ? draftWidth : fmt(width)"
            @focus="onWidthFocus"
            @input="onWidthInput"
            @blur="onWidthBlur"
            @keydown.enter.prevent="onEnterWidth"
          />
        </label>
        <span>{{ t('m') }}</span>
      </div>
    </div>
  </div>
</template>
