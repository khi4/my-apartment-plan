<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useDragLifecycle } from '../../composables/useDragLifecycle.js';
import { m, fmt } from '../../core/scale.js';
import { P, doorGeom, opSvg, swingBlocked } from '../../core/openings.js';

const props = defineProps({
  mode: {
    type: String,
    required: true,
    validator: v => v === 'symbols' || v === 'handles' || v === 'warnings',
  },
  planGeometry: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();
const { openings, furniture } = usePlanStore();
const { startMoveOp } = useDragLifecycle();

const symbolEntries = computed(() =>
  openings.value.map(op => ({
    id: op.id,
    html: opSvg(op),
  })),
);

const handleEntries = computed(() =>
  openings.value.map(op => {
    const [x0, y0] = P(op.o, op.a1, op.c - 0.15);
    const [x1, y1] = P(op.o, op.a2, op.c + 0.15);
    const leaf = op.kind === 'door' ? doorGeom(op) : null;
    return {
      op,
      id: op.id,
      title: `${t('op_' + op.kind)} ${fmt(op.a2 - op.a1)} ${t('m')}`,
      x: m(Math.min(x0, x1)),
      y: m(Math.min(y0, y1)),
      w: m(Math.abs(x1 - x0)),
      h: m(Math.abs(y1 - y0)),
      leaf,
    };
  }),
);

const warningEntries = computed(() => {
  const out = [];
  for (const op of openings.value) {
    if (!swingBlocked(op, furniture.value)) continue;
    const g = doorGeom(op);
    out.push({
      id: op.id,
      d: `M${m(g.H[0])},${m(g.H[1])} L${m(g.tip[0])},${m(g.tip[1])} A${m(g.L)},${m(g.L)} 0 0 ${g.sweep} ${m(g.J[0])},${m(g.J[1])} Z`,
    });
  }
  return out;
});

const layerId = computed(() => {
  if (props.mode === 'symbols') return 'openings';
  if (props.mode === 'handles') return 'opening-handles';
  return 'swing-warnings';
});
</script>

<template>
  <g :id="layerId" :pointer-events="mode === 'handles' ? undefined : 'none'">
    <g v-if="mode === 'symbols'" id="opening-symbols">
      <g
        v-for="entry in symbolEntries"
        :key="entry.id"
        v-html="entry.html"
      />
    </g>

    <template v-else-if="mode === 'handles'">
      <g
        v-for="entry in handleEntries"
        :key="entry.id"
        class="op-hit"
        :data-op="entry.id"
        @pointerdown="startMoveOp(entry.op, $event)"
      >
        <title>{{ entry.title }}</title>
        <rect :x="entry.x" :y="entry.y" :width="entry.w" :height="entry.h" />
        <line
          v-if="entry.leaf"
          :x1="m(entry.leaf.H[0])"
          :y1="m(entry.leaf.H[1])"
          :x2="m(entry.leaf.tip[0])"
          :y2="m(entry.leaf.tip[1])"
        />
      </g>
    </template>

    <template v-else>
      <path
        v-for="w in warningEntries"
        :key="w.id"
        :d="w.d"
        class="swing-hit"
      />
    </template>
  </g>
</template>
