import { ref, computed } from 'vue';

const LS_LOOK = 'fpb-look';
const LS_VIEW = 'fpb-view';
const LS_FURN_CAT = 'fpb-furn-cat';

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function lsSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (_) {}
}

function detectInitialLook() {
  const saved = lsGet(LS_LOOK);
  if (saved === 'white' || saved === 'black') return saved;
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-look');
    if (attr === 'black' || attr === 'white') return attr;
  }
  return 'white';
}

function applyDomLook(nextLook) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-look', nextLook);
}

const initialView = lsGet(LS_VIEW) === '3d' ? '3d' : '2d';
const initialFurnCat = lsGet(LS_FURN_CAT) || 'all';

const viewMode = ref(initialView);
const walking = ref(false);
const walkRoomName = ref('');
const look = ref(detectInitialLook());
applyDomLook(look.value);

const activeTool = ref('select'); // 'select' | 'draw-room' | 'measure'
const gridOn = ref(true);
const selection = ref(null); // { kind: 'room' | 'furniture' | 'opening', id: string } | null
const hotRoomId = ref(null);
const coordP = ref(null); // { x: number, y: number } | null
const hintMessage = ref(null);

const paletteSection = ref('spaces'); // 'spaces' | 'openings' | 'furniture' | 'style'
const furnCategory = ref(initialFurnCat);
const furnSearch = ref('');
const projectModalOpen = ref(false);
const threeStatus = ref('idle'); // 'idle' | 'loading' | 'ready' | 'error'
const roomDraft = ref(null); // { x, y, w, h } | null
const sidebarOpen = ref(true);
const statsOpen = ref(true);
const roomsTableOpen = ref(false);
const inspectorCollapsed = ref(false);
const showLabels = ref(true);
const showFurniture = ref(true);
const showOpenings = ref(true);
const showCompass = ref(true);
const goToOpen = ref(true);
const layersOpen = ref(true);
const timeOpen = ref(true);
const focusedRoomId = ref(null);

// Measure overlay state (used by 2D canvas & Clear action)
const measureSegments = ref([]);
const measurePending = ref(null);
const measureCursor = ref(null);

let cmdSeq = 0;
const cameraCommand = ref({ seq: 0, action: null });
let focusSeq = 0;
const focusRoomCommand = ref({ seq: 0, roomId: null });
let hintTimer = null;
let themeTransTimer = null;

const is3d = computed(() => viewMode.value === '3d');
const isMeasuring = computed(() => activeTool.value === 'measure');
const isDrawingRoom = computed(() => activeTool.value === 'draw-room');

function setLook(next) {
  const normalized = next === 'black' ? 'black' : 'white';
  if (normalized !== look.value && typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root && root.classList) {
      if (themeTransTimer) {
        clearTimeout(themeTransTimer);
        themeTransTimer = null;
      }
      root.classList.add('theme-transitioning');
      themeTransTimer = setTimeout(() => {
        if (typeof document !== 'undefined' && document.documentElement?.classList) {
          document.documentElement.classList.remove('theme-transitioning');
        }
        themeTransTimer = null;
      }, 320);
    }
  }
  look.value = normalized;
  applyDomLook(normalized);
  lsSet(LS_LOOK, normalized);
}

function setViewMode(mode) {
  const normalized = mode === '3d' ? '3d' : '2d';
  if (normalized === '2d') {
    walking.value = false;
  } else {
    roomDraft.value = null;
    if (activeTool.value !== 'select') activeTool.value = 'select';
  }
  viewMode.value = normalized;
  lsSet(LS_VIEW, normalized);
}

function setWalking(on) {
  walking.value = Boolean(on);
  if (walking.value && viewMode.value !== '3d') {
    setViewMode('3d');
  }
}

function setWalkRoomName(name) {
  walkRoomName.value = name || '';
}

function setTool(tool) {
  const next = tool === 'draw-room' || tool === 'measure' ? tool : 'select';
  activeTool.value = next;
  if (next !== 'draw-room') roomDraft.value = null;
  if (next !== 'measure') {
    measurePending.value = null;
    measureCursor.value = null;
  }
  if (next !== 'select') {
    selection.value = null;
  }
}

function toggleMeasure() {
  setTool(activeTool.value === 'measure' ? 'select' : 'measure');
}

function toggleDrawRoom() {
  if (viewMode.value === '3d') setViewMode('2d');
  setTool(activeTool.value === 'draw-room' ? 'select' : 'draw-room');
}

function toggleGrid() {
  gridOn.value = !gridOn.value;
}

function select(kindOrObj, id) {
  if (!kindOrObj) {
    selection.value = null;
    return;
  }
  if (typeof kindOrObj === 'object') {
    selection.value = kindOrObj.kind && kindOrObj.id ? { kind: kindOrObj.kind, id: kindOrObj.id } : null;
    return;
  }
  if (id) {
    selection.value = { kind: kindOrObj, id };
  } else {
    selection.value = null;
  }
}

function clearSelection() {
  selection.value = null;
}

function setHotRoom(id) {
  hotRoomId.value = id || null;
}

function setCoord(point) {
  coordP.value = point ? { x: point.x, y: point.y } : null;
}

function setHint(message, durationMs = 0) {
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  hintMessage.value = message || null;
  if (message && durationMs > 0) {
    hintTimer = setTimeout(() => {
      hintMessage.value = null;
      hintTimer = null;
    }, durationMs);
  }
}

function setPaletteSection(section) {
  if (
    section === 'spaces' ||
    section === 'openings' ||
    section === 'furniture' ||
    section === 'style'
  ) {
    paletteSection.value = section;
    if (section === 'style') {
      sidebarOpen.value = true;
    }
  }
}

function setSidebarOpen(open) {
  sidebarOpen.value = Boolean(open);
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function setStatsOpen(open) {
  statsOpen.value = Boolean(open);
}

function toggleStats() {
  statsOpen.value = !statsOpen.value;
}

function setRoomsTableOpen(open) {
  roomsTableOpen.value = Boolean(open);
}

function toggleRoomsTable() {
  roomsTableOpen.value = !roomsTableOpen.value;
}

function setInspectorCollapsed(collapsed) {
  inspectorCollapsed.value = Boolean(collapsed);
}

function toggleInspectorCollapsed() {
  inspectorCollapsed.value = !inspectorCollapsed.value;
}

function setFurnCategory(cat) {
  furnCategory.value = cat || 'all';
  lsSet(LS_FURN_CAT, furnCategory.value);
}

function setFurnSearch(q) {
  furnSearch.value = String(q ?? '');
}

function setProjectModalOpen(open) {
  projectModalOpen.value = Boolean(open);
}

function setThreeStatus(status) {
  threeStatus.value = status;
}

function setRoomDraft(draft) {
  roomDraft.value = draft ? { ...draft } : null;
}

function clearMeasure() {
  measureSegments.value = [];
  measurePending.value = null;
  measureCursor.value = null;
}

function sendCameraCommand(action) {
  cmdSeq += 1;
  cameraCommand.value = { seq: cmdSeq, action };
}

function toggleLabels() {
  showLabels.value = !showLabels.value;
}

function setShowLabels(on) {
  showLabels.value = Boolean(on);
}

function toggleFurnitureLayer() {
  showFurniture.value = !showFurniture.value;
}

function setShowFurniture(on) {
  showFurniture.value = Boolean(on);
}

function toggleOpeningsLayer() {
  showOpenings.value = !showOpenings.value;
}

function setShowOpenings(on) {
  showOpenings.value = Boolean(on);
}

function toggleCompass() {
  showCompass.value = !showCompass.value;
}

function setShowCompass(on) {
  showCompass.value = Boolean(on);
}

function toggleGoTo() {
  goToOpen.value = !goToOpen.value;
}

function toggleLayers() {
  layersOpen.value = !layersOpen.value;
}

function setTimeOpen(open) {
  timeOpen.value = Boolean(open);
}

function toggleTimeOpen() {
  timeOpen.value = !timeOpen.value;
}

function focusRoom(roomId = null) {
  const normalized = roomId ? String(roomId) : null;
  focusedRoomId.value = normalized;
  focusSeq += 1;
  focusRoomCommand.value = { seq: focusSeq, roomId: normalized };
}

export function useUiStore() {
  return {
    viewMode,
    is3d,
    walking,
    walkRoomName,
    look,
    activeTool,
    isMeasuring,
    isDrawingRoom,
    gridOn,
    selection,
    hotRoomId,
    coordP,
    hintMessage,
    paletteSection,
    furnCategory,
    furnSearch,
    projectModalOpen,
    threeStatus,
    roomDraft,
    sidebarOpen,
    statsOpen,
    roomsTableOpen,
    inspectorCollapsed,
    showLabels,
    showFurniture,
    showOpenings,
    showCompass,
    goToOpen,
    layersOpen,
    timeOpen,
    focusedRoomId,
    measureSegments,
    measurePending,
    measureCursor,
    cameraCommand,
    focusRoomCommand,

    setLook,
    setViewMode,
    setWalking,
    setWalkRoomName,
    setTool,
    toggleMeasure,
    toggleDrawRoom,
    toggleGrid,
    select,
    clearSelection,
    setHotRoom,
    setCoord,
    setHint,
    setPaletteSection,
    setSidebarOpen,
    toggleSidebar,
    setStatsOpen,
    toggleStats,
    setRoomsTableOpen,
    toggleRoomsTable,
    setInspectorCollapsed,
    toggleInspectorCollapsed,
    toggleLabels,
    setShowLabels,
    toggleFurnitureLayer,
    setShowFurniture,
    toggleOpeningsLayer,
    setShowOpenings,
    toggleCompass,
    setShowCompass,
    toggleGoTo,
    toggleLayers,
    setTimeOpen,
    toggleTimeOpen,
    focusRoom,
    setFurnCategory,
    setFurnSearch,
    setProjectModalOpen,
    setThreeStatus,
    setRoomDraft,
    clearMeasure,
    sendCameraCommand,
  };
}
