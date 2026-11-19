<script setup>
import { computed } from 'vue';
import { m } from '../../core/scale.js';
import { shape } from '../../core/furnitureShapes2D.js';
import { FURNITURE_BY_TYPE } from '../../data/furnitureCatalog.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useDragLifecycle } from '../../composables/useDragLifecycle.js';

const { furniture } = usePlanStore();
const { startMoveFurn } = useDragLifecycle();

// Rugs (under: true) are rendered first so everything else sits on top of them
const sortedItems = computed(() =>
  [...furniture.value].sort(
    (a, b) =>
      (FURNITURE_BY_TYPE[b.type]?.under ? 1 : 0) -
      (FURNITURE_BY_TYPE[a.type]?.under ? 1 : 0),
  ),
);

function furnTransform(it) {
  const rot = it.rot ? ` rotate(${it.rot})` : '';
  const flip = it.flip ? ' scale(-1,1)' : '';
  return `translate(${m(it.x)},${m(it.y)})${rot}${flip}`;
}
</script>

<template>
  <g id="furniture">
    <g
      v-for="it in sortedItems"
      :key="it.id"
      class="furn"
      :data-id="it.id"
      :transform="furnTransform(it)"
      v-html="shape(it.type, it.L, it.W)"
      @pointerdown="startMoveFurn(it, $event)"
    />
  </g>
</template>
