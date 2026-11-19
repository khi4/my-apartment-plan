<script>
import { S, m, r2 } from '../../core/scale.js';

export function computePlanGridBounds(bounds) {
  const b = bounds || {};
  const minX = Number.isFinite(b.minX) ? b.minX : 0;
  const minY = Number.isFinite(b.minY) ? b.minY : 0;
  const maxX = Number.isFinite(b.maxX) ? b.maxX : 14;
  const maxY = Number.isFinite(b.maxY) ? b.maxY : 11;

  return {
    gx0: Math.min(0, Math.floor(minX)),
    gy0: Math.min(0, Math.floor(minY)),
    gx1: Math.max(14, Math.ceil(maxX)),
    gy1: Math.max(11, Math.ceil(maxY)),
    planMinX: minX,
    planMaxY: maxY,
  };
}

/**
 * Compute viewport-filling infinite grid lines in meter intervals,
 * automatically coarsening step size at wide zoom-outs to keep SVG DOM fast.
 */
export function computeViewportGrid(bounds, viewBox) {
  const gb = computePlanGridBounds(bounds);
  let vx0 = gb.gx0;
  let vy0 = gb.gy0;
  let vx1 = gb.gx1;
  let vy1 = gb.gy1;

  if (
    viewBox &&
    Number.isFinite(viewBox.x) &&
    Number.isFinite(viewBox.y) &&
    Number.isFinite(viewBox.w) &&
    Number.isFinite(viewBox.h) &&
    viewBox.w > 0 &&
    viewBox.h > 0
  ) {
    const rawVx0 = Math.floor(viewBox.x / S) - 1;
    const rawVy0 = Math.floor(viewBox.y / S) - 1;
    const rawVx1 = Math.ceil((viewBox.x + viewBox.w) / S) + 1;
    const rawVy1 = Math.ceil((viewBox.y + viewBox.h) / S) + 1;
    vx0 = Math.min(gb.gx0, rawVx0);
    vy0 = Math.min(gb.gy0, rawVy0);
    vx1 = Math.max(gb.gx1, rawVx1);
    vy1 = Math.max(gb.gy1, rawVy1);
  }

  const spanM = Math.max(vx1 - vx0, vy1 - vy0);
  const stepM = spanM <= 65 ? 0.5 : spanM <= 160 ? 1 : 2;

  const vLines = [];
  const hLines = [];

  if (stepM === 0.5) {
    for (let i = vx0 * 2; i <= vx1 * 2; i++) {
      const v = i / 2;
      vLines.push({
        key: i,
        v,
        major: i % 2 === 0,
        x: m(v),
        y1: m(vy0),
        y2: m(vy1),
      });
    }
    for (let i = vy0 * 2; i <= vy1 * 2; i++) {
      const v = i / 2;
      hLines.push({
        key: i,
        v,
        major: i % 2 === 0,
        y: m(v),
        x1: m(vx0),
        x2: m(vx1),
      });
    }
  } else {
    const startX = Math.floor(vx0 / stepM) * stepM;
    const endX = Math.ceil(vx1 / stepM) * stepM;
    for (let v = startX; v <= endX; v += stepM) {
      vLines.push({
        key: v,
        v,
        major: true,
        x: m(v),
        y1: m(vy0),
        y2: m(vy1),
      });
    }
    const startY = Math.floor(vy0 / stepM) * stepM;
    const endY = Math.ceil(vy1 / stepM) * stepM;
    for (let v = startY; v <= endY; v += stepM) {
      hLines.push({
        key: v,
        v,
        major: true,
        y: m(v),
        x1: m(vx0),
        x2: m(vx1),
      });
    }
  }

  return { vx0, vy0, vx1, vy1, spanM, stepM, vLines, hLines };
}
</script>

<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';

const props = defineProps({
  bounds: {
    type: Object,
    default: () => ({ minX: 0, minY: 0, maxX: 14, maxY: 11 }),
  },
  viewBox: {
    type: Object,
    default: null,
  },
  gridOn: {
    type: Boolean,
    default: true,
  },
});

const { t } = useI18n();

const gridBounds = computed(() => computePlanGridBounds(props.bounds));

const viewportGrid = computed(() => {
  if (!props.gridOn) {
    return { vLines: [], hLines: [] };
  }
  return computeViewportGrid(props.bounds, props.viewBox);
});

const rulerVLines = computed(() => {
  const { gx0, gx1 } = gridBounds.value;
  const out = [];
  for (let i = gx0 * 2; i <= gx1 * 2; i++) {
    const v = i / 2;
    out.push({
      key: i,
      v,
      major: i % 2 === 0,
      x: m(v),
    });
  }
  return out;
});

const rulerHLines = computed(() => {
  const { gy0, gy1 } = gridBounds.value;
  const out = [];
  for (let i = gy0 * 2; i <= gy1 * 2; i++) {
    const v = i / 2;
    out.push({
      key: i,
      v,
      major: i % 2 === 0,
      y: m(v),
    });
  }
  return out;
});

const scaleBar = computed(() => {
  const { gx0, planMinX, planMaxY } = gridBounds.value;
  const b = props.bounds || {};
  const minX = Number.isFinite(b.minX) ? b.minX : 0;
  const maxX = Number.isFinite(b.maxX) ? b.maxX : 14;
  const planWidth = Math.max(2, maxX - minX);
  const totalMeters = planWidth <= 5 ? 2 : planWidth <= 11 ? 4 : planWidth <= 20 ? 6 : 10;
  const step = totalMeters === 10 ? 2 : 1;
  const count = totalMeters / step;

  const sbX = planMinX >= 0 && planMinX <= 2 ? 0 : Math.max(gx0, Math.floor(planMinX));
  const sbY = r2(planMaxY + 0.57);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({
      i,
      x: m(sbX + i * step),
      y: m(sbY),
      w: m(step),
      h: m(0.11),
      cls: i % 2 ? 'sb-b' : 'sb-a',
    });
  }
  const ticks = [];
  for (let i = 0; i <= count; i++) {
    const val = i * step;
    ticks.push({
      i,
      x: m(sbX + val),
      y: m(sbY + 0.33),
      label: i === count ? `${totalMeters} ${t('m')}` : String(val),
    });
  }
  return { blocks, ticks };
});
</script>

<template>
  <g id="grid-and-rulers" pointer-events="none">
    <g v-if="gridOn" id="grid">
      <line
        v-for="l in viewportGrid.vLines"
        :key="'vg-' + l.key"
        :x1="l.x"
        :y1="l.y1"
        :x2="l.x"
        :y2="l.y2"
        class="gridl"
        :class="{ major: l.major }"
      />
      <line
        v-for="l in viewportGrid.hLines"
        :key="'hg-' + l.key"
        :x1="l.x1"
        :y1="l.y"
        :x2="l.x2"
        :y2="l.y"
        class="gridl"
        :class="{ major: l.major }"
      />
    </g>

    <g id="rulers" class="ruler">
      <!-- Top horizontal ruler -->
      <line
        :x1="m(gridBounds.gx0)"
        :y1="m(gridBounds.gy0 - 0.5)"
        :x2="m(gridBounds.gx1)"
        :y2="m(gridBounds.gy0 - 0.5)"
      />
      <template v-for="l in rulerVLines" :key="'xr-' + l.key">
        <line
          :x1="l.x"
          :y1="m(gridBounds.gy0 - 0.5)"
          :x2="l.x"
          :y2="m(gridBounds.gy0 - (l.major ? 0.68 : 0.6))"
        />
        <text
          v-if="l.major"
          :x="l.x"
          :y="m(gridBounds.gy0 - 0.76)"
          text-anchor="middle"
        >
          {{ l.v }}
        </text>
      </template>
      <text
        :x="m(gridBounds.gx1 + 0.12)"
        :y="m(gridBounds.gy0 - 0.76)"
        text-anchor="start"
      >
        {{ t('m') }}
      </text>

      <!-- Left vertical ruler -->
      <line
        :x1="m(gridBounds.gx0 - 0.5)"
        :y1="m(gridBounds.gy0)"
        :x2="m(gridBounds.gx0 - 0.5)"
        :y2="m(gridBounds.gy1)"
      />
      <template v-for="l in rulerHLines" :key="'yr-' + l.key">
        <line
          :x1="m(gridBounds.gx0 - 0.5)"
          :y1="l.y"
          :x2="m(gridBounds.gx0 - (l.major ? 0.68 : 0.6))"
          :y2="l.y"
        />
        <text
          v-if="l.major"
          :x="m(gridBounds.gx0 - 0.74)"
          :y="m(l.v + 0.06)"
          text-anchor="end"
        >
          {{ l.v }}
        </text>
      </template>

      <!-- Adaptive scale bar below plan -->
      <rect
        v-for="b in scaleBar.blocks"
        :key="'sb-' + b.i"
        :x="b.x"
        :y="b.y"
        :width="b.w"
        :height="b.h"
        :class="b.cls"
      />
      <text
        v-for="tk in scaleBar.ticks"
        :key="'sbt-' + tk.i"
        :x="tk.x"
        :y="tk.y"
        text-anchor="middle"
      >
        {{ tk.label }}
      </text>
    </g>
  </g>
</template>
