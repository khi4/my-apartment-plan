<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { S, m, fmt } from '../../core/scale.js';
import { getRoomRects } from '../../core/walls.js';

const props = defineProps({
  rooms: {
    type: Array,
    default: () => [],
  },
});

const { isAr, t } = useI18n();

function largestRect(rects) {
  let best = rects[0];
  let bestArea = -1;
  for (const r of rects) {
    const area = r[2] * r[3];
    if (area > bestArea) {
      bestArea = area;
      best = r;
    }
  }
  return best;
}

const roomLabels = computed(() => {
  const ar = isAr.value;
  const out = [];

  for (const room of props.rooms || []) {
    const rects = getRoomRects(room);
    if (!rects.length) continue;

    const main = largestRect(rects);
    const [rx, ry, rw, rh] = main;
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const totalArea = rects.reduce((sum, r) => sum + r[2] * r[3], 0);

    const primaryText = ar ? room.ar || room.en || '' : room.en || room.ar || '';
    const secondaryRaw = ar ? room.en || '' : room.ar || '';
    const secondaryText = secondaryRaw && secondaryRaw !== primaryText ? secondaryRaw : '';
    const dimText =
      rects.length === 1
        ? `\u2066${fmt(rects[0][2])} × ${fmt(rects[0][3])}\u2069 ${t('m')}`
        : null;
    const areaText = `${fmt(totalArea)} ${t('m2')}`;

    const minSide = Math.min(rw, rh);
    const area = rw * rh;

    const specs = [];
    if (primaryText) {
      specs.push({
        cls: 't-en',
        size: 30,
        text: primaryText,
        rtl: ar,
        isPrimaryAr: ar,
      });
    }

    if (minSide >= 1.35 && area >= 2.2) {
      if (secondaryText) {
        specs.push({
          cls: 't-ar',
          size: 22,
          text: secondaryText,
          rtl: !ar,
          isPrimaryAr: false,
        });
      }
      if (dimText) {
        specs.push({
          cls: 't-dim',
          size: 20,
          text: dimText,
          rtl: ar,
          isPrimaryAr: false,
        });
      }
      specs.push({
        cls: 't-area',
        size: 18,
        text: areaText,
        rtl: ar,
        isPrimaryAr: false,
      });
    } else if (minSide >= 0.85 && area >= 1.0) {
      if (dimText) {
        specs.push({
          cls: 't-dim',
          size: 20,
          text: dimText,
          rtl: ar,
          isPrimaryAr: false,
        });
      }
      specs.push({
        cls: 't-area',
        size: 18,
        text: areaText,
        rtl: ar,
        isPrimaryAr: false,
      });
    } else if (minSide >= 0.55) {
      specs.push({
        cls: 't-area',
        size: 18,
        text: areaText,
        rtl: ar,
        isPrimaryAr: false,
      });
    }

    if (!specs.length) continue;

    const baseGap = 6;
    const baseH = specs.reduce((sum, l) => sum + l.size, 0) + baseGap * (specs.length - 1);
    const estW = Math.max(...specs.map(l => Math.max(1, l.text.length) * l.size * 0.54));

    const maxW = Math.max(20, rw * S * 0.86);
    const maxH = Math.max(20, rh * S * 0.84);
    const scale = Math.max(0.28, Math.min(1, maxW / estW, maxH / baseH));

    const gap = baseGap * scale;
    const totalH = specs.reduce((sum, l) => sum + l.size * scale, 0) + gap * (specs.length - 1);
    let yy = m(cy) - totalH / 2;

    const lines = specs.map((l, i) => {
      const fs = +(l.size * scale).toFixed(1);
      const y = +(yy + fs * 0.8).toFixed(1);
      yy += fs + gap;
      return {
        key: `${room.id}-${i}`,
        x: m(cx),
        y,
        cls: l.cls,
        fontSize: fs,
        text: l.text,
        dir: l.rtl ? 'rtl' : 'ltr',
        style: l.isPrimaryAr ? { fontFamily: 'var(--f-ar)', letterSpacing: '0' } : undefined,
      };
    });

    out.push({ id: room.id, lines });
  }

  return out;
});
</script>

<template>
  <g id="labels" class="labels" pointer-events="none">
    <template v-for="room in roomLabels" :key="room.id">
      <text
        v-for="l in room.lines"
        :key="l.key"
        :x="l.x"
        :y="l.y"
        :class="l.cls"
        :font-size="l.fontSize"
        text-anchor="middle"
        :direction="l.dir"
        :style="l.style"
      >
        {{ l.text }}
      </text>
    </template>
  </g>
</template>
