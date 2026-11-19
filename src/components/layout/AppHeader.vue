<script setup>
import { ref, computed, nextTick } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { fmt } from '../../core/scale.js';

const { lang, dir, t, setLang } = useI18n();
const {
  planTitle,
  stats,
  canUndo,
  canRedo,
  rooms,
  openings,
  furniture,
  setPlanTitle,
  undo,
  redo,
  loadTemplate,
} = usePlanStore();
const {
  is3d,
  look,
  selection,
  statsOpen,
  focusedRoomId,
  setViewMode,
  setLook,
  setProjectModalOpen,
  toggleStats,
  clearSelection,
  clearMeasure,
  focusRoom,
} = useUiStore();

const titleInputRef = ref(null);

const currentTitle = computed(() => planTitle.value[lang.value] ?? planTitle.value.en ?? '');

function focusTitleInput() {
  const el = titleInputRef.value;
  if (!el) return;
  el.focus();
  el.select();
}

function onTitleCommit(event) {
  const next = event.target.value.trim();
  const prev = currentTitle.value;
  if (!next) {
    event.target.value = prev;
    return;
  }
  if (next !== prev) {
    setPlanTitle(lang.value, next);
  }
}

function pruneMissingState() {
  const sel = selection.value;
  if (sel) {
    const exists =
      (sel.kind === 'room' && rooms.value.some(r => r.id === sel.id)) ||
      (sel.kind === 'opening' && openings.value.some(o => o.id === sel.id)) ||
      (sel.kind === 'furniture' && furniture.value.some(f => f.id === sel.id));
    if (!exists) clearSelection();
  }
  if (focusedRoomId.value && !rooms.value.some(r => r.id === focusedRoomId.value)) {
    focusedRoomId.value = null;
  }
}

function handleUndo() {
  if (undo()) pruneMissingState();
}

function handleRedo() {
  if (redo()) pruneMissingState();
}

async function applyQuickTemplate(templateId) {
  if (loadTemplate(templateId)) {
    clearSelection();
    clearMeasure();
    await nextTick();
    focusRoom(null);
  }
}
</script>

<template>
  <header class="hud-top">
    <div class="hud-top-start">
      <div class="glass-card diorama-info-card" :class="{ 'is-collapsed': !statsOpen }">
        <div class="diorama-meta">
          <span>
            {{ t('planLabel') }} ·
            <b dir="ltr">{{ fmt(stats.totalArea) }} {{ t('m2') }}</b>
          </span>

          <div class="diorama-meta-actions">
            <button
              type="button"
              class="pill-chip diorama-icon-btn"
              :title="t('editTitle')"
              :aria-label="t('editTitle')"
              @click="focusTitleInput"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M11.4 2.4a1.4 1.4 0 0 1 2 2L5.6 12.2l-3 .8.8-3 8-7.6Z" />
                <path d="m9.8 4 2.2 2.2" />
              </svg>
            </button>

            <button
              type="button"
              class="pill-chip diorama-icon-btn"
              :disabled="!canUndo"
              :title="t('undo')"
              :aria-label="t('undo')"
              @click="handleUndo"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6.5h6a3.5 3.5 0 1 1 0 7H8" />
                <path d="M6.2 4 3.5 6.5 6.2 9" />
              </svg>
            </button>

            <button
              type="button"
              class="pill-chip diorama-icon-btn"
              :disabled="!canRedo"
              :title="t('redo')"
              :aria-label="t('redo')"
              @click="handleRedo"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M12 6.5H6a3.5 3.5 0 1 0 0 7h2" />
                <path d="M9.8 4 12.5 6.5 9.8 9" />
              </svg>
            </button>

            <button
              type="button"
              class="pill-chip diorama-icon-btn"
              :aria-expanded="String(statsOpen)"
              :title="t('toggleStats')"
              :aria-label="t('toggleStats')"
              @click="toggleStats()"
            >
              <svg
                class="hud-chevron"
                :class="{ open: statsOpen }"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <path d="M3 4.5 6 7.5 9 4.5" />
              </svg>
            </button>
          </div>
        </div>

        <input
          ref="titleInputRef"
          class="title-input"
          type="text"
          :dir="dir"
          :size="Math.max(12, currentTitle.length + 2)"
          :value="currentTitle"
          :aria-label="t('planTitle')"
          @change="onTitleCommit"
          @keydown.enter="$event.target.blur()"
        />

        <div
          class="collapsible-grid"
          :class="{ 'is-collapsed': !statsOpen }"
          :aria-hidden="String(!statsOpen)"
          :inert="!statsOpen"
        >
          <div class="collapsible-inner">
            <div class="diorama-stats-list">
              <div>{{ t('indoorLabel') }}: <b dir="ltr">{{ fmt(stats.indoorArea) }} {{ t('m2') }}</b></div>
              <div>{{ t('roomsHallsLabel') }}: <b dir="ltr">{{ stats.roomsCount + stats.hallsCount }}</b></div>
              <div>{{ t('terracesLabel') }}: <b dir="ltr">{{ fmt(stats.terraceArea) }} {{ t('m2') }}</b></div>
              <div>{{ t('furnSummaryLabel') }}: <b dir="ltr">{{ furniture.length }}</b></div>

              <div class="diorama-quick-pills">
                <button
                  type="button"
                  class="pill-chip"
                  @click="applyQuickTemplate('blank')"
                >
                  {{ t('quickNewBlank') }}
                </button>
                <button
                  type="button"
                  class="pill-chip"
                  @click="applyQuickTemplate('studio')"
                >
                  {{ t('quickStudio') }}
                </button>
                <button
                  type="button"
                  class="pill-chip"
                  @click="applyQuickTemplate('apartment')"
                >
                  {{ t('quickApartment') }}
                </button>
                <button
                  type="button"
                  class="pill-chip"
                  @click="setProjectModalOpen(true)"
                >
                  {{ t('projects') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card hud-top-end">
      <div class="seg" role="group" :aria-label="t('viewGroup')">
        <button
          type="button"
          dir="ltr"
          :aria-pressed="String(!is3d)"
          @click="setViewMode('2d')"
        >
          {{ t('view2d') }}
        </button>
        <button
          type="button"
          dir="ltr"
          :aria-pressed="String(is3d)"
          @click="setViewMode('3d')"
        >
          {{ t('view3d') }}
        </button>
      </div>

      <div class="seg" role="group" :aria-label="t('langGroup')">
        <button
          type="button"
          lang="en"
          dir="ltr"
          :aria-pressed="String(lang === 'en')"
          @click="setLang('en')"
        >
          English
        </button>
        <button
          type="button"
          lang="ar"
          dir="rtl"
          :aria-pressed="String(lang === 'ar')"
          @click="setLang('ar')"
        >
          العربية
        </button>
      </div>

      <div class="seg" role="group" :aria-label="t('themeGroup')">
        <button
          type="button"
          :aria-pressed="String(look === 'white')"
          @click="setLook('white')"
        >
          <span class="dot dot-w" aria-hidden="true"></span>
          <span>{{ t('white') }}</span>
        </button>
        <button
          type="button"
          :aria-pressed="String(look === 'black')"
          @click="setLook('black')"
        >
          <span class="dot dot-b" aria-hidden="true"></span>
          <span>{{ t('black') }}</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.diorama-meta {
  font-family: var(--f-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--mid);
  letter-spacing: 0;
  text-transform: none;
  transition: font-size 0.24s ease, gap 0.24s ease;
}
.diorama-info-card.is-collapsed .diorama-meta {
  font-size: 11px;
  gap: 6px;
}
.diorama-meta > span {
  min-width: 0;
}
.diorama-meta > span b {
  color: var(--ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.diorama-meta-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.diorama-icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--r-xs);
  transition:
    width 0.24s ease,
    height 0.24s ease,
    background-color 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease,
    color 0.14s ease;
}
.diorama-info-card.is-collapsed .diorama-icon-btn {
  width: 21px;
  height: 21px;
}
.diorama-icon-btn svg {
  width: 13px;
  height: 13px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: width 0.24s ease, height 0.24s ease, transform 0.2s ease;
}
.diorama-info-card.is-collapsed .diorama-icon-btn svg {
  width: 12px;
  height: 12px;
}
.diorama-info-card .title-input {
  width: 100%;
  min-width: 0;
  font-family: var(--f-body);
  font-weight: 600;
  font-size: 19px;
  line-height: 1.2;
  letter-spacing: -0.015em;
  text-transform: none;
  margin: 0;
  padding: 3px 6px;
  border-radius: var(--r-xs);
  transition:
    font-size 0.24s ease,
    padding 0.24s ease,
    line-height 0.24s ease,
    border-color 0.14s ease,
    background-color 0.14s ease;
}
.diorama-info-card .title-input:hover {
  border-color: var(--glass-border);
}
.diorama-info-card .title-input:focus {
  outline: none;
  border-color: var(--ink);
  background: var(--glass-input);
}
html[lang="ar"] .diorama-info-card .title-input {
  font-family: var(--f-ar);
  font-weight: 600;
  font-size: 19px;
  line-height: 1.3;
  letter-spacing: 0;
  margin: 0;
}
.diorama-info-card.is-collapsed .title-input,
html[lang="ar"] .diorama-info-card.is-collapsed .title-input {
  width: auto;
  max-width: 100%;
  font-size: 13.5px;
  line-height: 1.25;
  padding: 1px 4px;
}
.diorama-stats-list {
  margin-top: 0;
  padding-top: 2px;
}
.diorama-stats-list > div {
  color: var(--mid);
}
.diorama-stats-list > div b {
  color: var(--ink);
  font-weight: 600;
}
.diorama-quick-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
  padding-top: 7px;
  border-top: 1px solid var(--glass-divider);
}
.diorama-quick-pills .pill-chip {
  padding: 4px 8px;
  font-size: 11.5px;
}
.hud-chevron {
  width: 12px;
  height: 12px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: width 0.24s ease, height 0.24s ease, transform 0.2s ease;
}
.hud-chevron.open {
  transform: rotate(180deg);
}
</style>
