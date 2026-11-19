<script setup>
import { computed } from 'vue';
import { m } from '../../core/scale.js';
import { getRoomRects } from '../../core/walls.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { useDragLifecycle } from '../../composables/useDragLifecycle.js';

const props = defineProps({
  planGeometry: {
    type: Object,
    required: true,
  },
});

const { rooms, openEdges } = usePlanStore();
const { hotRoomId, setHotRoom } = useUiStore();
const { startMoveRoom } = useDragLifecycle();

const voidRooms = computed(() =>
  rooms.value.filter(r => r && r.kind === 'void'),
);

const spaceRooms = computed(() =>
  rooms.value.filter(r => r && r.kind !== 'void'),
);

function isShaftRoom(room) {
  const text = `${room?.en || ''} ${room?.ar || ''}`;
  return /lift|shaft|مصعد|بئر/i.test(text);
}

function floorClass(room) {
  const parts = ['floor', 'room-hit'];
  if (room.kind === 'terrace') parts.push('terr');
  else if (room.kind === 'hall') parts.push('hall');
  if (hotRoomId.value === room.id) parts.push('hot');
  return parts.join(' ');
}

const normalizedOpenEdges = computed(() => {
  const out = [];
  for (const oe of openEdges.value || []) {
    if (!oe) continue;
    if ((oe.o === 'h' || oe.o === 'v') && [oe.c, oe.a1, oe.a2].every(Number.isFinite)) {
      out.push(
        oe.o === 'h'
          ? { id: oe.id, x1: oe.a1, y1: oe.c, x2: oe.a2, y2: oe.c }
          : { id: oe.id, x1: oe.c, y1: oe.a1, x2: oe.c, y2: oe.a2 },
      );
    } else if (Array.isArray(oe.line) && oe.line.length === 4) {
      const [x1, y1, x2, y2] = oe.line.map(Number);
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        out.push({ id: oe.id, x1, y1, x2, y2 });
      }
    }
  }
  return out;
});
</script>

<template>
  <g id="rooms-layer">
    <!-- Outside / Light well / Lift shafts -->
    <g id="outside">
      <template v-for="room in voidRooms" :key="room.id">
        <template v-for="(rect, idx) in getRoomRects(room)" :key="`${room.id}-${idx}`">
          <rect
            :x="m(rect[0])"
            :y="m(rect[1])"
            :width="m(rect[2])"
            :height="m(rect[3])"
            class="floor void room-hit"
            :class="{ hot: hotRoomId === room.id }"
            :data-room="room.id"
            @pointerenter="setHotRoom(room.id)"
            @pointerleave="setHotRoom(null)"
            @pointerdown="startMoveRoom(room, idx, $event)"
          />
          <rect
            :x="m(rect[0])"
            :y="m(rect[1])"
            :width="m(rect[2])"
            :height="m(rect[3])"
            fill="none"
            stroke="var(--lo)"
            stroke-width="1.4"
            pointer-events="none"
          />
          <template v-if="isShaftRoom(room)">
            <line
              :x1="m(rect[0])"
              :y1="m(rect[1])"
              :x2="m(rect[0] + rect[2])"
              :y2="m(rect[1] + rect[3])"
              class="x-line"
              pointer-events="none"
            />
            <line
              :x1="m(rect[0] + rect[2])"
              :y1="m(rect[1])"
              :x2="m(rect[0])"
              :y2="m(rect[1] + rect[3])"
              class="x-line"
              pointer-events="none"
            />
          </template>
        </template>
      </template>
    </g>

    <!-- Indoor rooms, halls, and terraces -->
    <g id="floors">
      <template v-for="room in spaceRooms" :key="room.id">
        <rect
          v-for="(rect, idx) in getRoomRects(room)"
          :key="`${room.id}-${idx}`"
          :x="m(rect[0])"
          :y="m(rect[1])"
          :width="m(rect[2])"
          :height="m(rect[3])"
          :class="floorClass(room)"
          :data-room="room.id"
          @pointerenter="setHotRoom(room.id)"
          @pointerleave="setHotRoom(null)"
          @pointerdown="startMoveRoom(room, idx, $event)"
        />
      </template>
    </g>

    <!-- Zero-thickness walls computed from indoor/terrace edges minus openEdges & seams -->
    <g id="walls" pointer-events="none">
      <line
        v-for="(w, idx) in planGeometry.WALLS"
        :key="'w-' + idx"
        :x1="m(w[0])"
        :y1="m(w[1])"
        :x2="m(w[2])"
        :y2="m(w[3])"
        class="wall"
      />
    </g>

    <!-- Terrace railings and open passage dashed lines -->
    <g id="edges" pointer-events="none">
      <line
        v-for="(r, idx) in planGeometry.railings"
        :key="'rail-' + idx"
        :x1="m(r[0][0])"
        :y1="m(r[0][1])"
        :x2="m(r[1][0])"
        :y2="m(r[1][1])"
        class="rail"
      />
      <line
        v-for="(oe, idx) in normalizedOpenEdges"
        :key="oe.id || 'oe-' + idx"
        :x1="m(oe.x1)"
        :y1="m(oe.y1)"
        :x2="m(oe.x2)"
        :y2="m(oe.y2)"
        class="open-edge"
      />
    </g>
  </g>
</template>
