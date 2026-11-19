<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import RoomInspector from './RoomInspector.vue';
import OpeningInspector from './OpeningInspector.vue';
import FurnitureInspector from './FurnitureInspector.vue';

defineProps({
  planGeometry: {
    type: Object,
    default: null,
  },
});

const { t } = useI18n();
const { rooms, openings, furniture } = usePlanStore();
const { selection } = useUiStore();

const selectedRoom = computed(() => {
  if (selection.value?.kind !== 'room') return null;
  return rooms.value.find(r => r.id === selection.value.id) || null;
});

const selectedOpening = computed(() => {
  if (selection.value?.kind !== 'opening') return null;
  return openings.value.find(o => o.id === selection.value.id) || null;
});

const selectedFurniture = computed(() => {
  if (selection.value?.kind !== 'furniture') return null;
  return furniture.value.find(f => f.id === selection.value.id) || null;
});
</script>

<template>
  <RoomInspector
    v-if="selectedRoom"
    :room="selectedRoom"
    :plan-geometry="planGeometry"
  />
  <OpeningInspector
    v-else-if="selectedOpening"
    :opening="selectedOpening"
    :plan-geometry="planGeometry"
  />
  <FurnitureInspector
    v-else-if="selectedFurniture"
    :item="selectedFurniture"
    :plan-geometry="planGeometry"
  />
  <div v-else>
    <div class="cap"><span>{{ t('selected') }}</span></div>
    <p class="small">{{ t('emptySel1') }}</p>
    <p class="small">{{ t('emptySel2') }}</p>
  </div>
</template>
