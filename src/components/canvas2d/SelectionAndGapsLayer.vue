<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useDragLifecycle } from '../../composables/useDragLifecycle.js';
import { S, m, fmt } from '../../core/scale.js';
import { getRoomRects, insideAny } from '../../core/walls.js';
import { P, alongOf, segOf, opSvg } from '../../core/openings.js';
import { gapsFor } from '../../core/clearance.js';
import { shape } from '../../core/furnitureShapes2D.js';

const props = defineProps({
  planGeometry: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();
const { rooms, openings, furniture, toggleOpenEdge } = usePlanStore();
const { selection, roomDraft } = useUiStore();
const {
  ghostRoom,
  ghostOp,
  ghostFurn,
  snapGuides,
  startResizeRoom,
  startResizeFurn,
} = useDragLifecycle();

const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const GAP_DIRS = ['left', 'right', 'up', 'down'];

const selectedRoom = computed(() => {
  if (selection.value?.kind !== 'room') return null;
  return rooms.value.find(r => r.id === selection.value.id) || null;
});

const selectedRoomRects = computed(() => {
  if (!selectedRoom.value) return [];
  return getRoomRects(selectedRoom.value).map(([x, y, w, h], idx) => {
    const handles = HANDLE_DIRS.map(dir => {
      const hx = dir.includes('w') ? x : dir.includes('e') ? x + w : x + w / 2;
      const hy = dir.includes('n') ? y : dir.includes('s') ? y + h : y + h / 2;
      return {
        dir,
        x: m(hx) - 7,
        y: m(hy) - 7,
      };
    });
    return {
      idx,
      x: m(x),
      y: m(y),
      w: m(w),
      h: m(h),
      handles,
    };
  });
});

const selectedRoomSharedEdges = computed(() => {
  if (!selectedRoom.value) return [];
  const edges = props.planGeometry?.sharedEdges || [];
  return edges
    .filter(e => e.roomA?.id === selectedRoom.value.id || e.roomB?.id === selectedRoom.value.id)
    .map((edge, idx) => {
      const mid = (edge.a1 + edge.a2) / 2;
      const [x1, y1] = P(edge.o, edge.a1, edge.c);
      const [x2, y2] = P(edge.o, edge.a2, edge.c);
      const [mx, my] = P(edge.o, mid, edge.c);
      return {
        key: `${edge.key}-${idx}`,
        edge,
        x1: m(x1),
        y1: m(y1),
        x2: m(x2),
        y2: m(y2),
        mx: m(mx),
        my: m(my),
        title: edge.isOpen ? t('edgeOpen') : t('edgeWall'),
      };
    });
});

const selectedOpening = computed(() => {
  if (selection.value?.kind !== 'opening') return null;
  return openings.value.find(o => o.id === selection.value.id) || null;
});

const openingSelGeom = computed(() => {
  const op = selectedOpening.value;
  if (!op) return null;

  const [ax, ay] = P(op.o, op.a1 - 0.05, op.c - 0.1);
  const [bx, by] = P(op.o, op.a2 + 0.05, op.c + 0.1);

  const mid = (op.a1 + op.a2) / 2;
  let ls = op.kind === 'door' ? -op.side : 1;
  const probe = P(op.o, mid, op.c + ls * 0.3);
  if (!insideAny(rooms.value, probe[0], probe[1])) ls = -ls;
  const [tx, ty] = P(op.o, mid, op.c + ls * (op.o === 'h' ? 0.32 : 0.45));

  const seg = segOf(op, props.planGeometry?.SEGS || []);
  const ds = -ls;
  const endLines = [];
  if (seg) {
    for (const [p, q] of [
      [seg.a, op.a1],
      [op.a2, seg.b],
    ]) {
      if (q - p < 0.005) continue;
      const A = P(op.o, p, op.c + ds * 0.14);
      const B = P(op.o, q, op.c + ds * 0.14);
      const ticks = [A, B].map(Q => {
        const al = alongOf(op.o, Q[0], Q[1]);
        const u1 = P(op.o, al, op.c + ds * 0.07);
        const u2 = P(op.o, al, op.c + ds * 0.21);
        return {
          x1: m(u1[0]),
          y1: m(u1[1]),
          x2: m(u2[0]),
          y2: m(u2[1]),
        };
      });
      const M2 = P(op.o, (p + q) / 2, op.c + ds * (op.o === 'h' ? 0.3 : 0.26));
      endLines.push({
        x1: m(A[0]),
        y1: m(A[1]),
        x2: m(B[0]),
        y2: m(B[1]),
        ticks,
        tx: m(M2[0]),
        ty: m(M2[1]) + 6,
        anchor: op.o === 'h' ? 'middle' : ds > 0 ? 'start' : 'end',
        text: fmt(q - p),
      });
    }
  }

  return {
    boxX: m(Math.min(ax, bx)),
    boxY: m(Math.min(ay, by)),
    boxW: m(Math.abs(bx - ax)),
    boxH: m(Math.abs(by - ay)),
    tx: m(tx),
    ty: m(ty) + 7,
    widthText: fmt(op.a2 - op.a1),
    endLines,
  };
});

const selectedFurniture = computed(() => {
  if (selection.value?.kind !== 'furniture') return null;
  return furniture.value.find(f => f.id === selection.value.id) || null;
});

function furnTransform(it) {
  const rot = it.rot ? ` rotate(${it.rot})` : '';
  const flip = it.flip ? ' scale(-1,1)' : '';
  return `translate(${m(it.x)},${m(it.y)})${rot}${flip}`;
}

const furnSelGeom = computed(() => {
  const it = selectedFurniture.value;
  if (!it) return null;
  const w = it.L * S;
  const h = it.W * S;
  const G = gapsFor(it, furniture.value, props.planGeometry?.WALLS || []);
  const tk = 7;
  const gapLines = [];

  for (const dirKey of GAP_DIRS) {
    const s = G.sides[dirKey];
    if (!s || s.d < 0.005 || s.d > 20) continue;
    const ax = m(s.px);
    const ay = m(s.py);
    const bx = m(s.px + s.dx * s.d);
    const by = m(s.py + s.dy * s.d);
    const ticks = [
      [ax, ay],
      [bx, by],
    ].map(([qx, qy]) =>
      s.dx
        ? { x1: qx, y1: qy - tk, x2: qx, y2: qy + tk }
        : { x1: qx - tk, y1: qy, x2: qx + tk, y2: qy },
    );
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    gapLines.push({
      key: dirKey,
      ax,
      ay,
      bx,
      by,
      ticks,
      tx: s.dx ? mx : mx + 10,
      ty: s.dx ? my - 9 : my + 6,
      anchor: s.dx ? 'middle' : 'start',
      text: fmt(s.d),
    });
  }

  return {
    it,
    transform: furnTransform(it),
    w,
    h,
    tx: m(it.x),
    ty: m(it.y) + 7,
    dimText: `${fmt(it.L)} × ${fmt(it.W)}`,
    gapLines,
  };
});

const snapGuideLines = computed(() =>
  (snapGuides.value || []).map((g, idx) => {
    const [x1, y1] = P(g.o, g.a1, g.c);
    const [x2, y2] = P(g.o, g.a2, g.c);
    return {
      key: idx,
      x1: m(x1),
      y1: m(y1),
      x2: m(x2),
      y2: m(y2),
    };
  }),
);
</script>

<template>
  <g id="selection-and-gaps">
    <g id="selection">
      <!-- Selected Room outline, 8 handles, and shared-edge toggle badges -->
      <template v-if="selectedRoom">
        <template v-for="r in selectedRoomRects" :key="r.idx">
          <rect
            :x="r.x"
            :y="r.y"
            :width="r.w"
            :height="r.h"
            class="room-sel-box"
          />
          <rect
            v-for="h in r.handles"
            :key="h.dir"
            :x="h.x"
            :y="h.y"
            width="14"
            height="14"
            class="room-handle"
            :data-dir="h.dir"
            @pointerdown="startResizeRoom(selectedRoom, r.idx, h.dir, $event)"
          />
        </template>

        <template v-for="se in selectedRoomSharedEdges" :key="se.key">
          <line
            :x1="se.x1"
            :y1="se.y1"
            :x2="se.x2"
            :y2="se.y2"
            class="shared-edge-hit"
            @pointerdown.stop
            @click.stop="toggleOpenEdge(se.edge.o, se.edge.c, se.edge.a1, se.edge.a2)"
          >
            <title>{{ se.title }}</title>
          </line>
          <g
            class="shared-edge-badge"
            :data-open="String(Boolean(se.edge.isOpen))"
            :transform="`translate(${se.mx},${se.my})`"
            @pointerdown.stop
            @click.stop="toggleOpenEdge(se.edge.o, se.edge.c, se.edge.a1, se.edge.a2)"
          >
            <title>{{ se.title }}</title>
            <rect x="-13" y="-13" width="26" height="26" rx="3" />
            <line v-if="se.edge.o === 'h'" x1="-8" y1="0" x2="8" y2="0" />
            <line v-else x1="0" y1="-8" x2="0" y2="8" />
          </g>
        </template>
      </template>

      <!-- Selected Opening outline & width label -->
      <template v-else-if="openingSelGeom">
        <rect
          :x="openingSelGeom.boxX"
          :y="openingSelGeom.boxY"
          :width="openingSelGeom.boxW"
          :height="openingSelGeom.boxH"
          class="sel-box"
        />
        <text
          :x="openingSelGeom.tx"
          :y="openingSelGeom.ty"
          class="sel-text"
          text-anchor="middle"
          direction="ltr"
        >
          {{ openingSelGeom.widthText }}
        </text>
      </template>

      <!-- Selected Furniture outline, corner handle & size label -->
      <template v-else-if="furnSelGeom">
        <g :transform="furnSelGeom.transform">
          <rect
            :x="-furnSelGeom.w / 2 - 5"
            :y="-furnSelGeom.h / 2 - 5"
            :width="furnSelGeom.w + 10"
            :height="furnSelGeom.h + 10"
            class="sel-box"
          />
          <rect
            :x="furnSelGeom.w / 2 - 9"
            :y="furnSelGeom.h / 2 - 9"
            width="18"
            height="18"
            class="sel-handle"
            data-handle="1"
            @pointerdown="startResizeFurn(furnSelGeom.it, $event)"
          />
        </g>
        <text
          :x="furnSelGeom.tx"
          :y="furnSelGeom.ty"
          class="sel-text"
          text-anchor="middle"
          direction="ltr"
        >
          {{ furnSelGeom.dimText }}
        </text>
      </template>
    </g>

    <!-- Clearance / wall-end measurement lines -->
    <g id="gaps" pointer-events="none">
      <template v-if="openingSelGeom">
        <template v-for="(el, idx) in openingSelGeom.endLines" :key="'opg-' + idx">
          <line :x1="el.x1" :y1="el.y1" :x2="el.x2" :y2="el.y2" class="gap-line" />
          <line
            v-for="(tk, ti) in el.ticks"
            :key="ti"
            :x1="tk.x1"
            :y1="tk.y1"
            :x2="tk.x2"
            :y2="tk.y2"
            class="gap-tick"
          />
          <text
            :x="el.tx"
            :y="el.ty"
            class="gap-text"
            :text-anchor="el.anchor"
          >
            {{ el.text }}
          </text>
        </template>
      </template>

      <template v-else-if="furnSelGeom">
        <template v-for="gl in furnSelGeom.gapLines" :key="gl.key">
          <line :x1="gl.ax" :y1="gl.ay" :x2="gl.bx" :y2="gl.by" class="gap-line" />
          <line
            v-for="(tk, ti) in gl.ticks"
            :key="ti"
            :x1="tk.x1"
            :y1="tk.y1"
            :x2="tk.x2"
            :y2="tk.y2"
            class="gap-tick"
          />
          <text
            :x="gl.tx"
            :y="gl.ty"
            class="gap-text"
            :text-anchor="gl.anchor"
          >
            {{ gl.text }}
          </text>
        </template>
      </template>
    </g>

    <!-- Snap guides, drag ghosts, and live draw-room draft -->
    <g id="ghost" pointer-events="none">
      <line
        v-for="sg in snapGuideLines"
        :key="'sg-' + sg.key"
        :x1="sg.x1"
        :y1="sg.y1"
        :x2="sg.x2"
        :y2="sg.y2"
        stroke="var(--lit)"
        stroke-width="1.5"
        stroke-dasharray="5 5"
        opacity="0.7"
      />

      <template v-if="ghostRoom">
        <rect
          :x="m(ghostRoom.x)"
          :y="m(ghostRoom.y)"
          :width="m(ghostRoom.w)"
          :height="m(ghostRoom.h)"
          class="room-draw-ghost"
          :style="ghostRoom.overlap ? { stroke: 'var(--warn)', fill: 'var(--warn-tint)' } : undefined"
        />
        <text
          :x="m(ghostRoom.x + ghostRoom.w / 2)"
          :y="m(ghostRoom.y + ghostRoom.h / 2) + 7"
          class="room-draw-label"
          text-anchor="middle"
          direction="ltr"
          :style="ghostRoom.overlap ? { fill: 'var(--warn)' } : undefined"
        >
          {{ fmt(ghostRoom.w) }} × {{ fmt(ghostRoom.h) }} {{ t('m') }}
        </text>
      </template>

      <g
        v-if="ghostOp"
        class="ghost"
        :class="{ bad: !ghostOp.ok }"
        v-html="opSvg(ghostOp.op)"
      />

      <g
        v-if="ghostFurn"
        class="ghost"
        :transform="`translate(${m(ghostFurn.x)},${m(ghostFurn.y)})`"
        v-html="shape(ghostFurn.type, ghostFurn.L, ghostFurn.W)"
      />

      <template v-if="roomDraft">
        <rect
          :x="m(roomDraft.x)"
          :y="m(roomDraft.y)"
          :width="m(roomDraft.w)"
          :height="m(roomDraft.h)"
          class="room-draw-ghost"
        />
        <text
          v-if="roomDraft.w >= 0.1 || roomDraft.h >= 0.1"
          :x="m(roomDraft.x + roomDraft.w / 2)"
          :y="m(roomDraft.y + roomDraft.h / 2) + 7"
          class="room-draw-label"
          text-anchor="middle"
          direction="ltr"
        >
          {{ fmt(roomDraft.w) }} × {{ fmt(roomDraft.h) }} {{ t('m') }} · {{ fmt(roomDraft.w * roomDraft.h) }} {{ t('m2') }}
        </text>
      </template>
    </g>
  </g>
</template>
