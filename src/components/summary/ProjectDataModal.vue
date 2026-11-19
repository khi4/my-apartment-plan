<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import { useUiStore } from '../../stores/useUiStore.js';

const { lang, t } = useI18n();
const {
  planTitle,
  rooms,
  openEdges,
  openings,
  furniture,
  setPlanTitle,
  loadTemplate,
  exportPlanJson,
  importPlanJson,
} = usePlanStore();
const {
  projectModalOpen,
  setProjectModalOpen,
  clearSelection,
  clearMeasure,
  sendCameraCommand,
} = useUiStore();

const importText = ref('');
const statusMsg = ref('');
const statusIsError = ref(false);
const copyLabelKey = ref('copy');
const showDataOpen = ref(false);
const jsonPreRef = ref(null);
let copyTimer = null;

const exportedJson = computed(() => {
  // Explicitly depend on reactive plan arrays & title so JSON stays live while modal is open
  void planTitle.value.en;
  void planTitle.value.ar;
  void rooms.value;
  void openEdges.value;
  void openings.value;
  void furniture.value;
  if (!projectModalOpen.value) return '';
  return exportPlanJson();
});

function closeModal() {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  setProjectModalOpen(false);
}

function onTitleCommit(langKey, event) {
  const next = event.target.value.trim();
  const prev = planTitle.value[langKey] ?? '';
  if (!next) {
    event.target.value = prev;
    return;
  }
  if (next !== prev) {
    setPlanTitle(langKey, next);
  }
}

function applyTemplate(templateId) {
  if (loadTemplate(templateId)) {
    clearSelection();
    clearMeasure();
    sendCameraCommand('fit');
    closeModal();
  }
}

function setCopyStatus(key) {
  clearTimeout(copyTimer);
  copyLabelKey.value = key;
  copyTimer = setTimeout(() => {
    copyLabelKey.value = 'copy';
  }, 2200);
}

async function selectPreFallback() {
  showDataOpen.value = true;
  await nextTick();
  if (jsonPreRef.value && typeof window !== 'undefined' && window.getSelection) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(jsonPreRef.value);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  setCopyStatus('copySel');
}

async function handleCopyJson() {
  const text = exportPlanJson();
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      return;
    }
  } catch (_) {}
  await selectPreFallback();
}

function handleDownloadJson() {
  const text = exportPlanJson();
  const rawName = (planTitle.value[lang.value] || planTitle.value.en || 'floor-plan')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  const filename = `${rawName || 'floor-plan'}.json`;
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImport() {
  const raw = importText.value.trim();
  if (!raw) return;
  const result = importPlanJson(raw);
  if (result.ok) {
    statusMsg.value = t('importSuccess');
    statusIsError.value = false;
    importText.value = '';
    clearSelection();
    clearMeasure();
    sendCameraCommand('fit');
  } else {
    statusMsg.value = t('importError');
    statusIsError.value = true;
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && projectModalOpen.value) {
    event.preventDefault();
    closeModal();
  }
}

watch(projectModalOpen, open => {
  if (open) {
    statusMsg.value = '';
    statusIsError.value = false;
    copyLabelKey.value = 'copy';
  }
});

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  clearTimeout(copyTimer);
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown);
  }
});
</script>

<template>
  <div
    v-if="projectModalOpen"
    class="modal-backdrop"
    @click.self="closeModal"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="t('projects')"
    >
      <div class="modal-head">
        <h2>{{ t('projects') }}</h2>
        <button type="button" class="btn btn-sm" @click="closeModal">
          {{ t('close') }}
        </button>
      </div>

      <div class="modal-sec">
        <h3>{{ t('planTitle') }}</h3>
        <div class="insp-grid-2">
          <label class="insp-field">
            <span>{{ t('planTitleEn') }}</span>
            <input
              class="inline-input"
              type="text"
              dir="ltr"
              :value="planTitle.en"
              @change="onTitleCommit('en', $event)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <label class="insp-field">
            <span>{{ t('planTitleAr') }}</span>
            <input
              class="inline-input"
              type="text"
              dir="rtl"
              :value="planTitle.ar"
              @change="onTitleCommit('ar', $event)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
        </div>
      </div>

      <div class="modal-sec">
        <h3>{{ t('templatesHeading') }}</h3>
        <div class="modal-actions">
          <button type="button" class="btn" @click="applyTemplate('blank')">
            {{ t('newBlankPlan') }}
          </button>
          <button type="button" class="btn" @click="applyTemplate('studio')">
            {{ t('loadStudioDemo') }}
          </button>
          <button type="button" class="btn" @click="applyTemplate('apartment')">
            {{ t('loadApartmentDemo') }}
          </button>
        </div>
      </div>

      <div class="modal-sec">
        <h3>{{ t('jsonHeading') }}</h3>
        <div class="modal-actions">
          <button type="button" class="btn" @click="handleCopyJson">
            {{ t(copyLabelKey) }}
          </button>
          <button type="button" class="btn" @click="handleDownloadJson">
            {{ t('downloadJson') }}
          </button>
        </div>

        <details
          :open="showDataOpen"
          @toggle="showDataOpen = $event.target.open"
        >
          <summary>{{ t('showData') }}</summary>
          <pre ref="jsonPreRef" dir="ltr">{{ exportedJson }}</pre>
        </details>

        <label class="insp-field" style="margin-top: 8px">
          <span>{{ t('importJson') }}</span>
          <textarea
            v-model="importText"
            :placeholder="t('importPh')"
            :aria-label="t('importJson')"
            dir="ltr"
          ></textarea>
        </label>

        <div class="modal-actions">
          <button
            type="button"
            class="btn btn-ink"
            :disabled="!importText.trim()"
            @click="handleImport"
          >
            {{ t('importApply') }}
          </button>
        </div>

        <p
          v-if="statusMsg"
          class="modal-msg"
          :class="{ err: statusIsError }"
        >
          {{ statusMsg }}
        </p>
      </div>
    </div>
  </div>
</template>
