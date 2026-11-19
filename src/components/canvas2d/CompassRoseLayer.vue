<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { m } from '../../core/scale.js';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';

const props = defineProps({
  bounds: {
    type: Object,
    default: () => ({
      minX: 0,
      minY: 0,
      maxX: 14,
      maxY: 11,
      width: 14,
      height: 11,
      centerX: 7,
      centerY: 5.5,
    }),
  },
  toPlan: {
    type: Function,
    required: true,
  },
});

const { t } = useI18n();
const { sceneStyle, snapshot, updateSceneStyle, flushSave } = usePlanStore();

const isDragging = ref(false);
let dragState = null;

function tr(key, fallback, ...args) {
  const res = t(key, ...args);
  return res === key ? fallback : res;
}

function normalizeDeg(deg) {
  const num = Number(deg);
  if (!Number.isFinite(num)) return 0;
  return ((Math.round(num) % 360) + 360) % 360;
}

const northDeg = computed(() => normalizeDeg(sceneStyle.value?.northDeg ?? 0));

const center = computed(() => {
  const b = props.bounds || {};
  const cx = Number.isFinite(Number(b.centerX)) ? Number(b.centerX) : 7;
  const cy = Number.isFinite(Number(b.centerY)) ? Number(b.centerY) : 5.5;
  return { cx, cy };
});

const radiusM = computed(() => {
  const b = props.bounds || {};
  const w = Number(b.width) > 0 ? Number(b.width) : 14;
  const h = Number(b.height) > 0 ? Number(b.height) : 11;
  return Math.max(5.2, Math.hypot(w / 2, h / 2) + 1.45);
});

const cxSvg = computed(() => m(center.value.cx));
const cySvg = computed(() => m(center.value.cy));
const rSvg = computed(() => m(radiusM.value));
const rInnerSvg = computed(() => m(radiusM.value - 0.18));

const ticks = computed(() => {
  const { cx, cy } = center.value;
  const R = radiusM.value;
  const out = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const cardinal = deg % 90 === 0;
    const inter = !cardinal && deg % 45 === 0;
    const rOut = R;
    const rIn = cardinal ? R - 0.30 : inter ? R - 0.24 : R - 0.16;
    out.push({
      deg,
      cardinal,
      inter,
      x1: m(cx + Math.sin(rad) * rIn),
      y1: m(cy - Math.cos(rad) * rIn),
      x2: m(cx + Math.sin(rad) * rOut),
      y2: m(cy - Math.cos(rad) * rOut),
    });
  }
  return out;
});

const CARDINAL_SPECS = [
  { key: 'e', labelKey: 'compassE', fallback: 'E', offsetDeg: 90 },
  { key: 's', labelKey: 'compassS', fallback: 'S', offsetDeg: 180 },
  { key: 'w', labelKey: 'compassW', fallback: 'W', offsetDeg: 270 },
];

const INTERCARDINAL_SPECS = [
  { key: 'ne', labelKey: 'compassNE', fallback: 'NE', offsetDeg: 45 },
  { key: 'se', labelKey: 'compassSE', fallback: 'SE', offsetDeg: 135 },
  { key: 'sw', labelKey: 'compassSW', fallback: 'SW', offsetDeg: 225 },
  { key: 'nw', labelKey: 'compassNW', fallback: 'NW', offsetDeg: 315 },
];

const cardinalLabels = computed(() => {
  const { cx, cy } = center.value;
  const labelR = radiusM.value + 0.48;
  return CARDINAL_SPECS.map(spec => {
    const angRad = ((northDeg.value + spec.offsetDeg) * Math.PI) / 180;
    return {
      key: spec.key,
      text: tr(spec.labelKey, spec.fallback),
      x: m(cx + Math.sin(angRad) * labelR),
      y: m(cy - Math.cos(angRad) * labelR),
    };
  });
});

const intercardinalLabels = computed(() => {
  const { cx, cy } = center.value;
  const interR = radiusM.value + 0.40;
  return INTERCARDINAL_SPECS.map(spec => {
    const angRad = ((northDeg.value + spec.offsetDeg) * Math.PI) / 180;
    return {
      key: spec.key,
      text: tr(spec.labelKey, spec.fallback),
      x: m(cx + Math.sin(angRad) * interR),
      y: m(cy - Math.cos(angRad) * interR),
    };
  });
});

const northGeom = computed(() => {
  const { cx, cy } = center.value;
  const R = radiusM.value;
  const angRad = (northDeg.value * Math.PI) / 180;
  const ux = Math.sin(angRad);
  const uy = -Math.cos(angRad);
  const tx = Math.cos(angRad);
  const ty = Math.sin(angRad);

  const nx = m(cx + ux * R);
  const ny = m(cy + uy * R);

  const tipX = m(cx + ux * (R + 0.56));
  const tipY = m(cy + uy * (R + 0.56));
  const baseLX = m(cx + ux * (R + 0.20) - tx * 0.14);
  const baseLY = m(cy + uy * (R + 0.20) - ty * 0.14);
  const baseRX = m(cx + ux * (R + 0.20) + tx * 0.14);
  const baseRY = m(cy + uy * (R + 0.20) + ty * 0.14);

  const degX = m(cx + ux * (R - 0.50));
  const degY = m(cy + uy * (R - 0.50));

  return {
    nx,
    ny,
    degX,
    degY,
    arrowPoints: `${baseLX},${baseLY} ${tipX},${tipY} ${baseRX},${baseRY}`,
  };
});

const solarArc = computed(() => {
  const { cx, cy } = center.value;
  const R = radiusM.value;
  const rArc = m(R);
  const a0 = ((northDeg.value + 80) * Math.PI) / 180;
  const a1 = ((northDeg.value + 280) * Math.PI) / 180;
  const sx = m(cx + Math.sin(a0) * R);
  const sy = m(cy - Math.cos(a0) * R);
  const ex = m(cx + Math.sin(a1) * R);
  const ey = m(cy - Math.cos(a1) * R);
  return {
    d: `M ${sx} ${sy} A ${rArc} ${rArc} 0 1 1 ${ex} ${ey}`,
    sx,
    sy,
    ex,
    ey,
  };
});

const solarState = computed(() => {
  const rawTod = Number(sceneStyle.value?.timeOfDay);
  const timeOfDay = Number.isFinite(rawTod) ? rawTod : 11.5;
  const lightingPreset = sceneStyle.value?.lightingPreset || 'daylight';
  const isStudio = lightingPreset === 'studio';
  const isNight = !isStudio && timeOfDay > 18.5;

  let solarLocalDeg;
  if (isNight) {
    solarLocalDeg = 330;
  } else {
    const effectiveTod = isStudio ? 11.5 : timeOfDay;
    const p = Math.min(1, Math.max(0, (effectiveTod - 5.5) / 13.0));
    solarLocalDeg = 80 + 200 * p;
  }

  const worldSunDeg = ((northDeg.value + solarLocalDeg) % 360 + 360) % 360;
  const rad = (worldSunDeg * Math.PI) / 180;
  const { cx, cy } = center.value;
  const R = radiusM.value;
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);
  const tx = Math.cos(rad);
  const ty = Math.sin(rad);

  const ox = m(cx + ux * R);
  const oy = m(cy + uy * R);

  const rays = [-0.20, 0, 0.20].map((latOffset, idx) => {
    const startDist = latOffset === 0 ? R - 0.30 : R - 0.28;
    const endDist = latOffset === 0 ? R - 0.94 : R - 0.78;
    return {
      key: idx,
      x1: m(cx + ux * startDist + tx * latOffset),
      y1: m(cy + uy * startDist + ty * latOffset),
      x2: m(cx + ux * endDist + tx * latOffset * 0.72),
      y2: m(cy + uy * endDist + ty * latOffset * 0.72),
    };
  });

  const tipDist = R - 0.96;
  const chevBaseDist = R - 0.84;
  const chevTipX = m(cx + ux * tipDist);
  const chevTipY = m(cy + uy * tipDist);
  const chevL = `${m(cx + ux * chevBaseDist - tx * 0.08)},${m(cy + uy * chevBaseDist - ty * 0.08)}`;
  const chevR = `${m(cx + ux * chevBaseDist + tx * 0.08)},${m(cy + uy * chevBaseDist + ty * 0.08)}`;

  return {
    isNight,
    ox,
    oy,
    rays,
    arrowPoints: `${chevL} ${chevTipX},${chevTipY} ${chevR}`,
  };
});

const northLabel = computed(() => tr('compassN', 'N'));
const bearingText = computed(() => tr('northBearing', `N ${northDeg.value}°`, northDeg.value));
const compassTitleText = computed(() => tr('compassTitle', 'North Compass'));
const compassHintText = computed(() =>
  tr('compassHint', 'Drag to orient North (Shift for 1°). Double-click N to reset.'),
);
const compassTooltip = computed(() => `${bearingText.value} — ${compassHintText.value}`);

function pointerAngleDeg(e) {
  const pt = props.toPlan(e);
  if (!pt) return 0;
  const dx = pt.x - center.value.cx;
  const dy = pt.y - center.value.cy;
  const raw = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return ((raw % 360) + 360) % 360;
}

function snapNorthAngle(rawDeg, shiftKey) {
  let deg = ((rawDeg % 360) + 360) % 360;
  if (!shiftKey) {
    for (const cardinal of [0, 90, 180, 270]) {
      const diff = Math.abs(((deg - cardinal + 540) % 360) - 180);
      if (diff <= 3) {
        return cardinal;
      }
    }
    deg = Math.round(deg / 5) * 5;
  } else {
    deg = Math.round(deg);
  }
  return ((deg % 360) + 360) % 360;
}

function removeWindowListeners() {
  if (typeof window === 'undefined') return;
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  window.removeEventListener('pointercancel', onWindowPointerUp);
}

function stopCompassDrag() {
  if (!dragState) return;
  const hadSnapshot = dragState.didSnapshot;
  dragState = null;
  isDragging.value = false;
  removeWindowListeners();
  if (hadSnapshot) {
    flushSave?.();
  }
}

function onWindowPointerMove(e) {
  if (!dragState || e.pointerId !== dragState.pid) return;
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    stopCompassDrag();
    return;
  }
  const ptrAngle = pointerAngleDeg(e);
  const nextDeg = snapNorthAngle(ptrAngle + dragState.angleOffset, e.shiftKey);
  if (nextDeg !== northDeg.value) {
    if (!dragState.didSnapshot) {
      snapshot();
      dragState.didSnapshot = true;
    }
    updateSceneStyle({ northDeg: nextDeg }, { record: false, save: true });
  }
}

function onWindowPointerUp(e) {
  if (!dragState || e.pointerId !== dragState.pid) return;
  stopCompassDrag();
}

function startCompassDrag(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault?.();
  e.stopPropagation?.();
  stopCompassDrag();

  const ptrAngle = pointerAngleDeg(e);
  dragState = {
    pid: e.pointerId,
    startNorth: northDeg.value,
    angleOffset: northDeg.value - ptrAngle,
    didSnapshot: false,
  };
  isDragging.value = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
  }
}

function resetNorth() {
  if (northDeg.value === 0) return;
  snapshot();
  updateSceneStyle({ northDeg: 0 }, { record: false, save: true });
  flushSave?.();
}

function onNorthKeyDown(e) {
  const stepDeg = e.shiftKey ? 1 : 5;
  let nextDeg = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    nextDeg = (northDeg.value + stepDeg) % 360;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    nextDeg = ((northDeg.value - stepDeg) % 360 + 360) % 360;
  } else if (e.key === 'Home' || e.key === '0') {
    nextDeg = 0;
  }
  if (nextDeg === null) return;
  e.preventDefault();
  e.stopPropagation();
  if (nextDeg === northDeg.value) return;
  snapshot();
  updateSceneStyle({ northDeg: nextDeg }, { record: false, save: true });
  flushSave?.();
}

onBeforeUnmount(() => {
  removeWindowListeners();
  dragState = null;
  isDragging.value = false;
});
</script>

<template>
  <g
    id="compass-rose"
    class="compass-rose"
    :class="{ 'compass-dragging': isDragging }"
  >
    <!-- Wide transparent interactive annular hit ring for effortless spinning -->
    <circle
      :cx="cxSvg"
      :cy="cySvg"
      :r="rSvg"
      class="compass-hit-ring compass-interactive"
      @pointerdown.stop="startCompassDrag"
    >
      <title>{{ compassTooltip }}</title>
    </circle>

    <!-- Concentric architectural compass rings -->
    <circle :cx="cxSvg" :cy="cySvg" :r="rSvg" class="compass-ring" />
    <circle :cx="cxSvg" :cy="cySvg" :r="rInnerSvg" class="compass-ring-inner" />

    <!-- Graduated 15-degree azimuth ticks rotated by northDeg -->
    <g :transform="`rotate(${northDeg} ${cxSvg} ${cySvg})`" pointer-events="none">
      <line
        v-for="tk in ticks"
        :key="'ct-' + tk.deg"
        :x1="tk.x1"
        :y1="tk.y1"
        :x2="tk.x2"
        :y2="tk.y2"
        class="compass-tick"
        :class="{ 'is-cardinal': tk.cardinal, 'is-inter': tk.inter }"
      />
    </g>

    <!-- Solar path arc (ENE 80° -> South 180° -> WNW 280°) -->
    <path
      :d="solarArc.d"
      class="compass-sun-arc"
      :class="{ 'is-night': solarState.isNight }"
    />
    <circle
      :cx="solarArc.sx"
      :cy="solarArc.sy"
      r="4.5"
      class="compass-sun-endpoint"
      :class="{ 'is-night': solarState.isNight }"
    />
    <circle
      :cx="solarArc.ex"
      :cy="solarArc.ey"
      r="4.5"
      class="compass-sun-endpoint"
      :class="{ 'is-night': solarState.isNight }"
    />

    <!-- Live Sun (or Night Moon) orb and inbound light rays -->
    <g pointer-events="none">
      <line
        v-for="ray in solarState.rays"
        :key="'sr-' + ray.key"
        :x1="ray.x1"
        :y1="ray.y1"
        :x2="ray.x2"
        :y2="ray.y2"
        class="compass-sun-ray"
        :class="{ 'is-night': solarState.isNight }"
      />
      <polygon
        :points="solarState.arrowPoints"
        class="compass-sun-chevron"
        :class="{ 'is-night': solarState.isNight }"
      />
      <circle
        :cx="solarState.ox"
        :cy="solarState.oy"
        r="32"
        class="compass-sun-glow"
        :class="{ 'is-night': solarState.isNight }"
      />
      <circle
        :cx="solarState.ox"
        :cy="solarState.oy"
        r="16"
        class="compass-sun-orb"
        :class="{ 'is-night': solarState.isNight }"
      />
    </g>

    <!-- Upright intercardinal labels (NE / SE / SW / NW) -->
    <text
      v-for="ic in intercardinalLabels"
      :key="'ic-' + ic.key"
      :x="ic.x"
      :y="ic.y"
      dy="0.35em"
      text-anchor="middle"
      class="compass-intercardinal"
    >
      {{ ic.text }}
    </text>

    <!-- Upright cardinal labels (E / S / W) -->
    <text
      v-for="cd in cardinalLabels"
      :key="'cd-' + cd.key"
      :x="cd.x"
      :y="cd.y"
      dy="0.35em"
      text-anchor="middle"
      class="compass-cardinal"
    >
      {{ cd.text }}
    </text>

    <!-- Numeric North bearing readout just inward of the North handle -->
    <text
      :x="northGeom.degX"
      :y="northGeom.degY"
      dy="0.35em"
      text-anchor="middle"
      direction="ltr"
      class="compass-bearing"
    >
      {{ northDeg }}°
    </text>

    <!-- Draggable North badge with outward crimson directional arrow -->
    <g
      class="compass-north-handle compass-interactive"
      role="slider"
      tabindex="0"
      :aria-label="compassTitleText"
      aria-valuemin="0"
      aria-valuemax="359"
      :aria-valuenow="northDeg"
      :aria-valuetext="bearingText"
      @pointerdown.stop="startCompassDrag"
      @dblclick.stop="resetNorth"
      @keydown="onNorthKeyDown"
    >
      <title>{{ compassTooltip }}</title>
      <circle :cx="northGeom.nx" :cy="northGeom.ny" r="38" class="compass-north-hit" />
      <polygon :points="northGeom.arrowPoints" class="compass-north-arrow" />
      <circle :cx="northGeom.nx" :cy="northGeom.ny" r="26" class="compass-north-badge" />
      <text
        :x="northGeom.nx"
        :y="northGeom.ny"
        dy="0.35em"
        text-anchor="middle"
        class="compass-north-letter"
      >
        {{ northLabel }}
      </text>
    </g>
  </g>
</template>
