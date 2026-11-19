<script setup>
import { computed } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { ROOM_PRESETS } from '../../data/roomPresets.js';
import { OP_KINDS } from '../../data/openingSpecs.js';
import { FURNITURE_CATEGORIES, FURNITURE_CATALOG } from '../../data/furnitureCatalog.js';
import RoomPresetCard from './RoomPresetCard.vue';
import OpeningPaletteCard from './OpeningPaletteCard.vue';
import FurniturePaletteCard from './FurniturePaletteCard.vue';
import SceneStylePanel from './SceneStylePanel.vue';

const emit = defineEmits(['add', 'start-drag']);

const { isAr, t } = useI18n();
const {
  paletteSection,
  furnCategory,
  furnSearch,
  setPaletteSection,
  setFurnCategory,
  setFurnSearch,
} = useUiStore();

const sections = [
  { id: 'spaces', labelKey: 'palSpaces' },
  { id: 'openings', labelKey: 'palOpenings' },
  { id: 'furniture', labelKey: 'palFurniture' },
  { id: 'style', labelKey: 'palStyle' },
];

const categoriesById = Object.fromEntries(FURNITURE_CATEGORIES.map(c => [c.id, c]));

const searchQuery = computed(() => furnSearch.value.trim().toLowerCase());

const filteredGroups = computed(() => {
  const q = searchQuery.value;
  const activeCat = furnCategory.value;

  const matchesItem = item => {
    const inCat = Boolean(q) || activeCat === 'all' || item.category === activeCat;
    if (!inCat) return false;
    if (!q) return true;
    const cat = categoriesById[item.category];
    const haystack = [item.en, item.ar, item.type, cat?.en || '', cat?.ar || '']
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  };

  if (activeCat === 'all' || q) {
    return FURNITURE_CATEGORIES.map(cat => ({
      cat,
      items: FURNITURE_CATALOG.filter(item => item.category === cat.id && matchesItem(item)),
    })).filter(group => group.items.length > 0);
  }

  const cat = categoriesById[activeCat];
  if (!cat) return [];
  const items = FURNITURE_CATALOG.filter(item => item.category === activeCat && matchesItem(item));
  return items.length ? [{ cat, items }] : [];
});

const showGroupHeaders = computed(() => furnCategory.value === 'all' || Boolean(searchQuery.value));

function selectCategory(catId) {
  setFurnCategory(catId);
  setFurnSearch('');
}

function forwardAdd(payload) {
  emit('add', payload);
}

function forwardStartDrag(payload, pointerEvent) {
  emit('start-drag', payload, pointerEvent);
}
</script>

<template>
  <div>
    <div class="pal-section-tabs" role="tablist" :aria-label="t('planLabel')">
      <button
        v-for="sec in sections"
        :key="sec.id"
        type="button"
        role="tab"
        :aria-selected="String(paletteSection === sec.id)"
        @click="setPaletteSection(sec.id)"
      >
        {{ t(sec.labelKey) }}
      </button>
    </div>

    <Transition name="hud-fade" mode="out-in">
      <div v-if="paletteSection === 'spaces'" key="spaces">
        <p class="small pal-intro">{{ t('roomIntro') }}</p>
        <div class="pal">
          <RoomPresetCard
            v-for="preset in ROOM_PRESETS"
            :key="preset.id"
            :preset="preset"
            @add="forwardAdd"
            @start-drag="forwardStartDrag"
          />
        </div>
      </div>

      <div v-else-if="paletteSection === 'openings'" key="openings">
        <p class="small pal-intro">{{ t('openingsIntro') }}</p>
        <div class="pal">
          <OpeningPaletteCard
            v-for="opKind in OP_KINDS"
            :key="opKind"
            :op-kind="opKind"
            @add="forwardAdd"
            @start-drag="forwardStartDrag"
          />
        </div>
      </div>

      <div v-else-if="paletteSection === 'furniture'" key="furniture">
        <p class="small pal-intro">{{ t('furnIntro') }}</p>

        <div class="tabs" role="tablist" :aria-label="t('tabsAria')">
          <button
            type="button"
            class="tab"
            role="tab"
            :aria-selected="String(!searchQuery && furnCategory === 'all')"
            @click="selectCategory('all')"
          >
            {{ t('catAll') }}
          </button>
          <button
            v-for="cat in FURNITURE_CATEGORIES"
            :key="cat.id"
            type="button"
            class="tab"
            role="tab"
            :aria-selected="String(!searchQuery && furnCategory === cat.id)"
            @click="selectCategory(cat.id)"
          >
            {{ isAr ? cat.ar : cat.en }}
          </button>
        </div>

        <input
          class="search"
          type="search"
          autocomplete="off"
          :value="furnSearch"
          :placeholder="t('searchPh')"
          :aria-label="t('searchAria')"
          @input="setFurnSearch($event.target.value)"
        />

        <div v-if="filteredGroups.length" class="pal">
          <template v-for="group in filteredGroups" :key="group.cat.id">
            <div v-if="showGroupHeaders" class="pal-h">
              {{ isAr ? group.cat.ar : group.cat.en }}
            </div>
            <FurniturePaletteCard
              v-for="item in group.items"
              :key="item.type"
              :item="item"
              @add="forwardAdd"
              @start-drag="forwardStartDrag"
            />
          </template>
        </div>

        <p v-else class="small">
          {{ t('noMatch', furnSearch.trim()) }}
        </p>
      </div>

      <SceneStylePanel v-else key="style" />
    </Transition>
  </div>
</template>

<style scoped>
.pal-intro {
  margin-bottom: 10px;
}
</style>
