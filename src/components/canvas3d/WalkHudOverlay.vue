<script setup>
import { ref, reactive, onBeforeUnmount } from 'vue';
import { useI18n } from '../../i18n/useI18n.js';

defineProps({
  roomName: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['pad-down', 'pad-up', 'pad-step']);

const { t } = useI18n();
const mapCanvasRef = ref(null);
const heldDirs = reactive({});

const PAD_BUTTONS = [
  { cls: 'up', dir: 'up', ariaKey: 'walkFwd', path: 'M3 9 7 5l4 4' },
  { cls: 'lt', dir: 'left', ariaKey: 'turnLeft', path: 'M9 3 5 7l4 4' },
  { cls: 'dn', dir: 'down', ariaKey: 'walkBack', path: 'M3 5l4 4 4-4' },
  { cls: 'rt', dir: 'right', ariaKey: 'turnRight', path: 'M5 3l4 4-4 4' },
];

function onPadDown(dir, event) {
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch (_) {}
  heldDirs[dir] = true;
  emit('pad-down', dir);
}

function onPadUp(dir) {
  if (!heldDirs[dir]) return;
  heldDirs[dir] = false;
  emit('pad-up', dir);
}

function onPadClick(dir, event) {
  // Keyboard activation (Enter / Space) fires click with detail === 0
  if (event.detail !== 0) return;
  emit('pad-step', dir);
}

onBeforeUnmount(() => {
  for (const dir of Object.keys(heldDirs)) {
    if (heldDirs[dir]) {
      heldDirs[dir] = false;
      emit('pad-up', dir);
    }
  }
});

defineExpose({
  mapCanvasRef,
});
</script>

<template>
  <div class="v3-walk">
    <div class="v3-map">
      <canvas ref="mapCanvasRef" role="img" :aria-label="t('mapAria')"></canvas>
      <span>{{ roomName }}</span>
    </div>

    <div class="v3-pad" role="group" :aria-label="t('padAria')">
      <button
        v-for="btn in PAD_BUTTONS"
        :key="btn.dir"
        type="button"
        :class="[btn.cls, { on: Boolean(heldDirs[btn.dir]) }]"
        :data-walk="btn.dir"
        :aria-label="t(btn.ariaKey)"
        @pointerdown.prevent="onPadDown(btn.dir, $event)"
        @pointerup="onPadUp(btn.dir)"
        @pointercancel="onPadUp(btn.dir)"
        @lostpointercapture="onPadUp(btn.dir)"
        @contextmenu.prevent
        @click="onPadClick(btn.dir, $event)"
      >
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <path :d="btn.path" />
        </svg>
      </button>
    </div>
  </div>
</template>
