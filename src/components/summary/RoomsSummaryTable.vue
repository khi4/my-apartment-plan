<script setup>
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { fmt } from '../../core/scale.js';
import { getRoomRects } from '../../core/walls.js';

const { isAr, t } = useI18n();
const { rooms, stats, roomArea } = usePlanStore();
const {
  hotRoomId,
  roomsTableOpen,
  sidebarOpen,
  setHotRoom,
  select,
  setRoomsTableOpen,
} = useUiStore();

function primaryName(room) {
  return isAr.value ? room.ar || room.en : room.en || room.ar;
}

function secondaryName(room) {
  return isAr.value ? room.en || room.ar : room.ar || room.en;
}

function roomNote(room) {
  return isAr.value ? room.noteAr || room.note : room.note || room.noteAr;
}
</script>

<template>
  <section
    v-if="roomsTableOpen"
    class="glass-card floating-rooms-popup"
    :class="{ expanded: !sidebarOpen }"
    :aria-label="t('rooms')"
  >
    <div class="floating-rooms-head">
      <div class="floating-rooms-title">
        <h2>{{ t('rooms') }}</h2>
        <span class="sum-meta-static small" style="margin:0">
          {{ t('roomsMeta', rooms.length, fmt(stats.indoorArea)) }}
        </span>
      </div>
      <button
        type="button"
        class="btn btn-sm close-popup-btn"
        :aria-label="t('close')"
        :title="t('close')"
        @click="setRoomsTableOpen(false)"
      >
        ×
      </button>
    </div>

    <div class="floating-rooms-body">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{{ t('thSpace') }}</th>
              <th>{{ t('thType') }}</th>
              <th>{{ t('thAcross') }}</th>
              <th>{{ t('thDeep') }}</th>
              <th>{{ t('thArea') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rooms.length">
              <td colspan="5" class="small empty-row">{{ t('noSpacesYet') }}</td>
            </tr>
            <tr
              v-for="r in rooms"
              :key="r.id"
              class="row"
              :class="{ hot: hotRoomId === r.id }"
              tabindex="0"
              @pointerenter="setHotRoom(r.id)"
              @pointerleave="setHotRoom(null)"
              @focus="setHotRoom(r.id)"
              @blur="setHotRoom(null)"
              @click="select('room', r.id)"
              @keydown.enter.prevent="select('room', r.id)"
              @keydown.space.prevent="select('room', r.id)"
            >
              <td>
                <span class="en">{{ primaryName(r) }}</span>
                <span class="ar" :dir="isAr ? 'ltr' : 'rtl'">{{ secondaryName(r) }}</span>
                <span v-if="roomNote(r)" class="note">{{ roomNote(r) }}</span>
              </td>
              <td>
                <span class="kind-pill" :data-kind="r.kind">{{ t('kind_' + r.kind) }}</span>
              </td>
              <template v-if="getRoomRects(r).length === 1">
                <td class="num" dir="ltr">{{ fmt(getRoomRects(r)[0][2]) }}</td>
                <td class="num" dir="ltr">{{ fmt(getRoomRects(r)[0][3]) }}</td>
              </template>
              <td v-else colspan="2">
                <span class="num">{{ t('areaOnly') }}</span>
                <span class="note">{{ t('multiPart') }}</span>
              </td>
              <td class="num" dir="ltr">{{ fmt(roomArea(r)) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">{{ t('totIndoor') }}</td>
              <td class="num" dir="ltr">{{ fmt(stats.indoorArea) }}</td>
            </tr>
            <tr>
              <td colspan="4">{{ t('totTerr') }}</td>
              <td class="num" dir="ltr">{{ fmt(stats.terraceArea) }}</td>
            </tr>
            <tr>
              <td colspan="4">{{ t('totAll') }}</td>
              <td class="num" dir="ltr">{{ fmt(stats.totalArea) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.floating-rooms-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  min-width: 0;
}
.sum-meta-static {
  font-family: var(--f-mono);
}
.close-popup-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}
.empty-row {
  padding-block: 14px;
}
</style>
