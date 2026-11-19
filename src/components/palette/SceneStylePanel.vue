<script setup>
import { useI18n } from '../../i18n/useI18n.js';
import { usePlanStore } from '../../stores/usePlanStore.js';
import {
  toHex6,
  isSameColor,
  useColorPickerSession,
  useTimedFeedback,
} from '../../composables/useStyleControls.js';
import {
  RENDER_MODES,
  LIGHTING_PRESETS,
  WALL_TEXTURES,
  FLOOR_TEXTURES,
  DOOR_TEXTURES,
  WALL_COLOR_SWATCHES,
  FLOOR_COLOR_SWATCHES,
  DOOR_COLOR_SWATCHES,
  GROUND_COLOR_SWATCHES,
} from '../../data/materialPresets.js';

const { t } = useI18n();
const {
  sceneStyle,
  snapshot,
  updateSceneStyle,
  applyWallStyleToAllRooms,
  applyFloorStyleToAllRooms,
  applyDoorStyleToAllOpenings,
  resetAllStylesToDefault,
} = usePlanStore();

const { activeTag: appliedTag, triggerFeedback, clearFeedback } = useTimedFeedback();
const { onColorInput, onColorChange, resetColorSession } = useColorPickerSession(
  snapshot,
  (patch, opts) => updateSceneStyle(patch, opts),
);

function setStylePatch(patch) {
  resetColorSession();
  updateSceneStyle(patch);
}

function handleApplyWalls() {
  resetColorSession();
  applyWallStyleToAllRooms(sceneStyle.value.globalWall);
  triggerFeedback('walls');
}

function handleApplyFloors() {
  resetColorSession();
  applyFloorStyleToAllRooms(sceneStyle.value.globalFloor);
  triggerFeedback('floors');
}

function handleApplyDoors() {
  resetColorSession();
  applyDoorStyleToAllOpenings(sceneStyle.value.globalDoor);
  triggerFeedback('doors');
}

function handleResetAll() {
  resetColorSession();
  clearFeedback();
  resetAllStylesToDefault();
}
</script>

<template>
  <div>
    <p class="small style-intro">{{ t('styleIntro') }}</p>

    <div class="style-group">
      <div class="cap"><span>{{ t('renderStyle') }}</span></div>
      <div class="style-seg" role="group" :aria-label="t('renderStyle')">
        <button
          v-for="mode in RENDER_MODES"
          :key="mode"
          type="button"
          :aria-pressed="String(sceneStyle.renderMode === mode)"
          @click="setStylePatch({ renderMode: mode })"
        >
          {{ t(mode === 'realistic' ? 'modeRealistic' : 'modeBlueprint') }}
        </button>
      </div>
    </div>

    <div class="style-group">
      <div class="cap"><span>{{ t('lighting') }}</span></div>
      <div class="tex-grid" role="group" :aria-label="t('lighting')">
        <button
          v-for="preset in LIGHTING_PRESETS"
          :key="preset"
          type="button"
          class="tex-btn"
          :aria-pressed="String(sceneStyle.lightingPreset === preset)"
          @click="setStylePatch({ lightingPreset: preset })"
        >
          {{ t('light_' + preset) }}
        </button>
      </div>
    </div>

    <div class="style-group">
      <div class="cap"><span>{{ t('globalWalls') }}</span></div>
      <span class="style-sublabel">{{ t('wallTexture') }}</span>
      <div class="tex-grid" role="group" :aria-label="t('wallTexture')">
        <button
          v-for="tex in WALL_TEXTURES"
          :key="tex.id"
          type="button"
          class="tex-btn"
          :aria-pressed="String(sceneStyle.globalWall.texture === tex.id)"
          @click="setStylePatch({ globalWall: { texture: tex.id } })"
        >
          {{ t(tex.labelKey) }}
        </button>
      </div>
      <span class="style-sublabel">{{ t('wallColor') }}</span>
      <div class="swatch-row">
        <button
          v-for="hex in WALL_COLOR_SWATCHES"
          :key="hex"
          type="button"
          class="swatch"
          :style="{ backgroundColor: hex }"
          :title="hex"
          :aria-label="`${t('wallColor')} ${hex}`"
          :aria-pressed="String(isSameColor(sceneStyle.globalWall.color, hex))"
          @click="setStylePatch({ globalWall: { color: hex } })"
        />
        <input
          type="color"
          class="color-pick"
          :value="toHex6(sceneStyle.globalWall.color, '#f2ede2')"
          :title="t('customColor')"
          :aria-label="`${t('wallColor')} - ${t('customColor')}`"
          @input="onColorInput('globalWall', { globalWall: { color: $event.target.value } })"
          @change="onColorChange('globalWall', { globalWall: { color: $event.target.value } })"
        />
      </div>
      <div class="style-actions">
        <button type="button" class="act" @click="handleApplyWalls">
          {{ t('applyAllRooms') }}
        </button>
        <span v-if="appliedTag === 'walls'" class="style-feedback" role="status">
          {{ t('appliedToAll') }}
        </span>
      </div>
    </div>

    <div class="style-group">
      <div class="cap"><span>{{ t('globalFloors') }}</span></div>
      <span class="style-sublabel">{{ t('floorTexture') }}</span>
      <div class="tex-grid" role="group" :aria-label="t('floorTexture')">
        <button
          v-for="tex in FLOOR_TEXTURES"
          :key="tex.id"
          type="button"
          class="tex-btn"
          :aria-pressed="String(sceneStyle.globalFloor.texture === tex.id)"
          @click="setStylePatch({ globalFloor: { texture: tex.id } })"
        >
          {{ t(tex.labelKey) }}
        </button>
      </div>
      <span class="style-sublabel">{{ t('floorColor') }}</span>
      <div class="swatch-row">
        <button
          v-for="hex in FLOOR_COLOR_SWATCHES"
          :key="hex"
          type="button"
          class="swatch"
          :style="{ backgroundColor: hex }"
          :title="hex"
          :aria-label="`${t('floorColor')} ${hex}`"
          :aria-pressed="String(isSameColor(sceneStyle.globalFloor.color, hex))"
          @click="setStylePatch({ globalFloor: { color: hex } })"
        />
        <input
          type="color"
          class="color-pick"
          :value="toHex6(sceneStyle.globalFloor.color, '#c89b68')"
          :title="t('customColor')"
          :aria-label="`${t('floorColor')} - ${t('customColor')}`"
          @input="onColorInput('globalFloor', { globalFloor: { color: $event.target.value } })"
          @change="onColorChange('globalFloor', { globalFloor: { color: $event.target.value } })"
        />
      </div>
      <div class="style-actions">
        <button type="button" class="act" @click="handleApplyFloors">
          {{ t('applyAllFloors') }}
        </button>
        <span v-if="appliedTag === 'floors'" class="style-feedback" role="status">
          {{ t('appliedToAll') }}
        </span>
      </div>
    </div>

    <div class="style-group">
      <div class="cap"><span>{{ t('globalDoors') }}</span></div>
      <span class="style-sublabel">{{ t('doorTexture') }}</span>
      <div class="tex-grid" role="group" :aria-label="t('doorTexture')">
        <button
          v-for="tex in DOOR_TEXTURES"
          :key="tex.id"
          type="button"
          class="tex-btn"
          :aria-pressed="String(sceneStyle.globalDoor.texture === tex.id)"
          @click="setStylePatch({ globalDoor: { texture: tex.id } })"
        >
          {{ t(tex.labelKey) }}
        </button>
      </div>
      <span class="style-sublabel">{{ t('doorColor') }}</span>
      <div class="swatch-row">
        <button
          v-for="hex in DOOR_COLOR_SWATCHES"
          :key="'dc-' + hex"
          type="button"
          class="swatch"
          :style="{ backgroundColor: hex }"
          :title="hex"
          :aria-label="`${t('doorColor')} ${hex}`"
          :aria-pressed="String(isSameColor(sceneStyle.globalDoor.color, hex))"
          @click="setStylePatch({ globalDoor: { color: hex } })"
        />
        <input
          type="color"
          class="color-pick"
          :value="toHex6(sceneStyle.globalDoor.color, '#e6dfd1')"
          :title="t('customColor')"
          :aria-label="`${t('doorColor')} - ${t('customColor')}`"
          @input="onColorInput('globalDoorColor', { globalDoor: { color: $event.target.value } })"
          @change="onColorChange('globalDoorColor', { globalDoor: { color: $event.target.value } })"
        />
      </div>
      <span class="style-sublabel">{{ t('doorFrameColor') }}</span>
      <div class="swatch-row">
        <button
          v-for="hex in DOOR_COLOR_SWATCHES"
          :key="'fc-' + hex"
          type="button"
          class="swatch"
          :style="{ backgroundColor: hex }"
          :title="hex"
          :aria-label="`${t('doorFrameColor')} ${hex}`"
          :aria-pressed="String(isSameColor(sceneStyle.globalDoor.frameColor, hex))"
          @click="setStylePatch({ globalDoor: { frameColor: hex } })"
        />
        <input
          type="color"
          class="color-pick"
          :value="toHex6(sceneStyle.globalDoor.frameColor, '#d4ccb8')"
          :title="t('customColor')"
          :aria-label="`${t('doorFrameColor')} - ${t('customColor')}`"
          @input="onColorInput('globalDoorFrame', { globalDoor: { frameColor: $event.target.value } })"
          @change="onColorChange('globalDoorFrame', { globalDoor: { frameColor: $event.target.value } })"
        />
      </div>
      <div class="style-actions">
        <button type="button" class="act" @click="handleApplyDoors">
          {{ t('applyAllDoors') }}
        </button>
        <span v-if="appliedTag === 'doors'" class="style-feedback" role="status">
          {{ t('appliedToAll') }}
        </span>
      </div>
    </div>

    <div class="style-group">
      <div class="cap"><span>{{ t('outerGround') }}</span></div>
      <div class="swatch-row">
        <button
          v-for="hex in GROUND_COLOR_SWATCHES"
          :key="hex"
          type="button"
          class="swatch"
          :style="{ backgroundColor: hex }"
          :title="hex"
          :aria-label="`${t('outerGround')} ${hex}`"
          :aria-pressed="String(isSameColor(sceneStyle.outerGroundColor, hex))"
          @click="setStylePatch({ outerGroundColor: hex })"
        />
        <input
          type="color"
          class="color-pick"
          :value="toHex6(sceneStyle.outerGroundColor, '#dfd9cc')"
          :title="t('customColor')"
          :aria-label="`${t('outerGround')} - ${t('customColor')}`"
          @input="onColorInput('outerGround', { outerGroundColor: $event.target.value })"
          @change="onColorChange('outerGround', { outerGroundColor: $event.target.value })"
        />
      </div>
    </div>

    <div class="style-group">
      <div class="style-actions">
        <button type="button" class="act" @click="handleResetAll">
          {{ t('resetAllStyles') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.style-intro {
  margin-top: 0;
  margin-bottom: 10px;
}
.style-seg {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--glass-border);
  border-radius: 11px;
  background: var(--glass-well);
}
.style-seg button {
  font: 500 12px var(--f-body);
  color: var(--ink);
  opacity: 0.78;
  background: transparent;
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  text-align: center;
  transition: background-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease, opacity 0.14s ease;
}
.style-seg button:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.16);
}
.style-seg button[aria-pressed="true"] {
  background: var(--glass-pill-active);
  color: var(--glass-pill-active-ink);
  opacity: 1;
  font-weight: 600;
  box-shadow: var(--glass-pill-shadow);
}
.style-seg button:focus-visible {
  outline: 1.5px solid var(--ink);
  outline-offset: -2px;
}
</style>
