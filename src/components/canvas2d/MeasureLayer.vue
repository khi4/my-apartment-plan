<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { m, fmt } from '../../core/scale.js';

const { isAr, t } = useI18n();
const { measureSegments, measurePending, measureCursor } = useUiStore();

const allPairs = computed(() => {
  const list = [...measureSegments.value];
  if (measurePending.value && measureCursor.value) {
    list.push([measurePending.value, measureCursor.value]);
  }
  return list.map(([a, b], idx) => ({
    key: idx,
    ax: m(a.x),
    ay: m(a.y),
    bx: m(b.x),
    by: m(b.y),
    mx: m((a.x + b.x) / 2),
    my: m((a.y + b.y) / 2) - 12,
    label: `${fmt(Math.hypot(b.x - a.x, b.y - a.y))} ${t('m')}`,
  }));
});

const singlePending = computed(() =>
  measurePending.value && !measureCursor.value
    ? { x: m(measurePending.value.x), y: m(measurePending.value.y) }
    : null,
);
</script>

<template>
  <g id="measure" pointer-events="none">
    <template v-for="seg in allPairs" :key="seg.key">
      <line :x1="seg.ax" :y1="seg.ay" :x2="seg.bx" :y2="seg.by" class="m-line" />
      <circle :cx="seg.ax" :cy="seg.ay" r="6" class="m-dot" />
      <circle :cx="seg.bx" :cy="seg.by" r="6" class="m-dot" />
      <text
        :x="seg.mx"
        :y="seg.my"
        class="m-text"
        text-anchor="middle"
        :direction="isAr ? 'rtl' : 'ltr'"
      >
        {{ seg.label }}
      </text>
    </template>

    <circle
      v-if="singlePending"
      :cx="singlePending.x"
      :cy="singlePending.y"
      r="6"
      class="m-dot"
    />
  </g>
</template>
