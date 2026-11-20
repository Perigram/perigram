<template>
  <section
    ref="workspace"
    v-bind="$attrs"
    :class="[
      'designer-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      compact ? 'designer-workspace--compact' : '',
      $attrs.class
    ]"
    :data-designer-layout="layout"
  >
    <div v-if="!compact" class="relative min-h-0 min-w-0 flex-1">
      <WorkspaceDock
        ref="dock"
        class="h-full min-h-0 w-full"
        canvas-key="canvas"
        :items="dockItems"
        :panel-closeable="panelCloseable"
        @ready="onDockReady"
        @close-tab="closeDockPanel"
        @layout-change="onDockLayoutChange"
      >
        <template #content="{ item }">
          <div v-if="item.key === 'canvas'" class="relative h-full min-h-0 w-full min-w-0 overflow-hidden">
            <slot />
            <DesignerToolbar
              v-if="hasToolbarItems"
              :start-items="toolbarStartItems"
              :end-items="canvasItems"
            />
          </div>
          <DesignerFilePanel v-else-if="item.key === 'file'" :chrome-api="chrome" />
          <slot v-else-if="item.key === 'palette'" name="palette" />
          <slot v-else-if="item.key === 'inspector'" name="inspector" />
          <slot v-else-if="item.key === 'preview'" name="preview" />
        </template>
      </WorkspaceDock>
    </div>

    <template v-else>
      <DesignerFilePanel
        v-if="hasFile"
        :chrome-api="chrome"
        class="shrink-0 border-b [border-color:var(--ck-chrome-border)]"
      />
      <main class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <slot />
        <DesignerToolbar
          v-if="hasToolbarItems"
          :start-items="toolbarStartItems"
          :end-items="canvasItems"
        />
      </main>
    </template>

    <!-- Compact overlay panels follow the popover contract: a tap on anything
         outside the panel (the backdrop over the canvas area) closes it. -->
    <div
      v-if="compact && compactPanelOpen"
      class="absolute inset-0 z-10"
      data-designer-compact-backdrop
      @pointerdown="closeCompactPanels"
    />
    <aside
      v-if="compact && compactPanelOpen"
      class="absolute inset-x-3 top-24 z-20 flex min-h-0 max-h-[50%] flex-col overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      data-designer-compact-panels
    >
      <Tabs :value="compactTab" class="flex min-h-0 flex-1 flex-col">
        <TabList>
          <Tab v-if="hasPalette" value="palette">{{ $t('designer.palette') }}</Tab>
          <Tab v-if="hasInspector" value="inspector">{{ $t('designer.inspector') }}</Tab>
          <Tab v-if="hasPreview" value="preview">{{ $t('designer.preview') }}</Tab>
        </TabList>
        <TabPanels class="min-h-0 flex-1 overflow-y-auto">
          <TabPanel v-if="hasPalette" value="palette">
            <slot name="palette" />
          </TabPanel>
          <TabPanel v-if="hasInspector" value="inspector">
            <slot name="inspector" />
          </TabPanel>
          <TabPanel v-if="hasPreview" value="preview">
            <slot name="preview" />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </aside>
  </section>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, useSlots, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import DesignerFilePanel from './DesignerFilePanel.vue';
import DesignerToolbar from './DesignerToolbar.vue';
import WorkspaceDock from './WorkspaceDock.vue';
import { useAuthStore } from '~/stores/auth';
import {
  designerWorkspaceStorageKey,
  loadDesignerWorkspaceState,
  saveDesignerWorkspaceState
} from '~/utils/designer-workspace-state.js';
import { pruneDockLayout } from '~/utils/workspace-dock-layout.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  layout: {
    type: String,
    default: 'lanes',
    validator: value => ['lanes', 'canvas'].includes(value)
  },
  // Canvas commands (zoom cluster, content operations) rendered as the
  // toolbar end group.
  canvasItems: { type: Array, default: () => [] },
  // Stable editor identity for persisted dock layouts.
  workspaceId: { type: String, default: '' },
  // The bound editor-page chrome api (`{ name, dirty, saving, diverged,
  // save(), rename(), reload() }`): its presence opens the file panel.
  chrome: { type: Object, default: null }
});

const slots = useSlots();
const { t } = useI18n();
const authStore = useAuthStore();
// The locked, headerless center panel: the host canvas fills its cell and
// refuses center drops while edge docks around it stay live.
const CANVAS = 'canvas';
const workspace = ref(null);
const dock = ref(null);
let layoutCache = null;
let pendingLayout;
let saveTimer = null;

const hasPalette = computed(() => Boolean(slots.palette));
const hasInspector = computed(() => Boolean(slots.inspector));
const hasPreview = computed(() => Boolean(slots.preview));
const hasFile = computed(() => Boolean(props.chrome));

const panelKeys = computed(() => [
  CANVAS,
  ...(hasFile.value ? ['file'] : []),
  ...(hasPalette.value ? ['palette'] : []),
  ...(hasInspector.value ? ['inspector'] : []),
  ...(hasPreview.value ? ['preview'] : [])
]);

const panelMeta = computed(() => ({
  [CANVAS]: { label: '', icon: '' },
  file: { label: t('designer.file'), icon: 'pi pi-file' },
  palette: { label: t('designer.palette'), icon: 'pi pi-align-left' },
  inspector: { label: t('designer.inspector'), icon: 'pi pi-align-right' },
  preview: { label: t('designer.preview'), icon: 'pi pi-eye' }
}));

const dockItems = computed(() => panelKeys.value.map(key => ({
  key,
  label: panelMeta.value[key]?.label || '',
  icon: panelMeta.value[key]?.icon || ''
})));

function panelCloseable(key) {
  return key !== CANVAS && key !== 'file';
}

const panels = reactive({ palette: true, inspector: true, preview: false });
const compact = ref(false);
const compactTab = ref('palette');

const storageKey = computed(() => designerWorkspaceStorageKey({
  workspaceId: props.workspaceId,
  userId: authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id,
  organizationId: authStore.organizationData?._id || authStore.userData?.organizationId
}));

function syncPanels() {
  for (const key of ['palette', 'inspector', 'preview']) {
    panels[key] = Boolean(dock.value?.hasPanel(key));
  }
}

async function onDockReady() {
  const layout = pendingLayout !== undefined ? pendingLayout : persistedLayout();
  pendingLayout = undefined;
  const pruned = layout ? pruneDockLayout(layout, key => panelKeys.value.includes(key)) : null;
  if (pruned && pruned.panels[CANVAS]) {
    dock.value?.applyLayout(pruned);
    await nextTick();
    if (hasFile.value && !dock.value?.hasPanel('file')) await addAuxPanel('file', 'above', 'height');
    syncPanels();
    schedulePersist();
    return;
  }
  await buildDefaultLayout();
}

function persistedLayout() {
  if (!storageKey.value || typeof window === 'undefined') return null;
  return loadDesignerWorkspaceState(window.localStorage, storageKey.value).layout;
}

function schedulePersist() {
  if (!storageKey.value || typeof window === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistLayout();
  }, 200);
}

function persistLayout() {
  if (!storageKey.value || typeof window === 'undefined' || !dock.value) return;
  saveDesignerWorkspaceState(window.localStorage, storageKey.value, {
    layout: dock.value.snapshot()
  });
}

function onDockLayoutChange(layout) {
  if (!compact.value) layoutCache = layout;
  syncPanels();
  schedulePersist();
}

async function buildDefaultLayout() {
  const live = dock.value;
  if (!live) return;
  const canvasGroup = live.addGroup({ hideHeader: true, locked: true });
  live.addPanel(CANVAS, { referenceGroup: canvasGroup });
  if (hasFile.value) await addAuxPanel('file', 'above', 'height');
  if (hasPalette.value) await addAuxPanel('palette', 'left', 'width');
  if (hasInspector.value) await addAuxPanel('inspector', 'right', 'width');
  syncPanels();
  schedulePersist();
}

async function addAuxPanel(key, direction, axis) {
  const live = dock.value;
  if (!live) return;
  const panel = live.addPanel(key, { referencePanel: CANVAS, direction });
  if (!panel) return;
  await nextTick();
  const sizing = key === 'file'
    ? { min: 84, max: 96, ratio: 0.12 }
    : axis === 'height'
      ? { min: 160, max: 520, ratio: 0.5 }
      : { min: 180, max: key === 'inspector' ? 460 : 380, ratio: 0.32 };
  await live.sizePanelToContent(key, { axis, ...sizing });
}

function showPanel(key) {
  if (!dock.value || !panelKeys.value.includes(key)) return;
  if (dock.value.hasPanel(key)) {
    dock.value.focusPanel(key);
  } else if (key === 'file') {
    addAuxPanel('file', 'above', 'height').then(() => schedulePersist());
  } else if (key === 'palette') {
    addAuxPanel('palette', 'left', 'width').then(() => schedulePersist());
  } else if (key === 'inspector') {
    addAuxPanel('inspector', 'right', 'width').then(() => schedulePersist());
  } else if (key === 'preview') {
    addAuxPanel('preview', 'below', 'height').then(() => schedulePersist());
  }
  if (panels[key] !== undefined) panels[key] = true;
}

function hidePanel(key) {
  if (key === 'canvas' || key === 'file') return;
  if (dock.value?.hasPanel(key)) dock.value.removePanel(key);
  if (panels[key] !== undefined) panels[key] = false;
  schedulePersist();
}

function closeDockPanel(key) {
  hidePanel(key);
}

function togglePanelFromToolbar(panel) {
  if (compact.value) {
    const sole = panels[panel] && PANEL_KEYS.every(key => !panels[key] || key === panel);
    for (const key of PANEL_KEYS) panels[key] = sole ? false : key === panel;
    if (!sole) compactTab.value = panel;
    return;
  }
  panels[panel] ? hidePanel(panel) : showPanel(panel);
}

const PANEL_KEYS = ['palette', 'inspector', 'preview'];

const panelDockItems = computed(() => [
  hasPalette.value ? {
    icon: 'pi pi-align-left',
    label: t('designer.palette'),
    pressed: panels.palette,
    onClick: () => togglePanelFromToolbar('palette')
  } : null,
  hasInspector.value ? {
    icon: 'pi pi-align-right',
    label: t('designer.inspector'),
    pressed: panels.inspector,
    onClick: () => togglePanelFromToolbar('inspector')
  } : null,
  hasPreview.value ? {
    icon: 'pi pi-eye',
    label: t('designer.preview'),
    pressed: panels.preview,
    onClick: () => togglePanelFromToolbar('preview')
  } : null
].filter(Boolean));

const toolbarStartItems = panelDockItems;

const hasToolbarItems = computed(() => toolbarStartItems.value.length > 0 || props.canvasItems.length > 0);

function toggle(panel) {
  togglePanelFromToolbar(panel);
}

function setPanel(panel, value) {
  if (!PANEL_KEYS.includes(panel)) return;
  if (compact.value) {
    panels[panel] = Boolean(value);
    return;
  }
  if (value) showPanel(panel);
  else hidePanel(panel);
}

function openPanel(panel) {
  if (!PANEL_KEYS.includes(panel)) return;
  if (compact.value) {
    for (const key of PANEL_KEYS) panels[key] = key === panel;
    compactTab.value = panel;
    return;
  }
  showPanel(panel);
}

const compactPanelOpen = computed(() => panels.palette || panels.inspector || panels.preview);

function closeCompactPanels() {
  panels.palette = false;
  panels.inspector = false;
  panels.preview = false;
}

provide('designerWorkspacePanels', {
  panels,
  compact,
  toggle,
  setPanel,
  isPanelOpen: panel => Boolean(panels[panel])
});

// The bound editor's dirty state guards the hosting pane's close.
const pageKey = inject('workspacePageKey', '');
if (pageKey) {
  watch(() => props.chrome?.dirty, dirty => {
    setWorkspacePageDirty(pageKey, Boolean(dirty));
  });
}

const workspaceObserver = { observer: null, compactTimer: null };

onMounted(() => {
  window.addEventListener('pagehide', persistLayout);
  if (typeof ResizeObserver === 'undefined' || !workspace.value) return;
  workspaceObserver.observer = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect?.width || 0;
    const narrow = width > 0 && width < 768;
    if (!narrow) {
      if (workspaceObserver.compactTimer) {
        clearTimeout(workspaceObserver.compactTimer);
        workspaceObserver.compactTimer = null;
      }
      compact.value = false;
      return;
    }
    // A transient narrow measurement (unstyled load, layout thrash) is
    // ignored until the narrower width persists.
    if (compact.value || workspaceObserver.compactTimer) return;
    workspaceObserver.compactTimer = setTimeout(() => {
      workspaceObserver.compactTimer = null;
      compact.value = true;
    }, 200);
  });
  workspaceObserver.observer.observe(workspace.value);
});

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', persistLayout);
  if (workspaceObserver.compactTimer) clearTimeout(workspaceObserver.compactTimer);
  workspaceObserver.observer?.disconnect();
  workspaceObserver.observer = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  persistLayout();
});

// Crossing the compact boundary swaps the dock for the bounded overlay.
// The wide layout is restored from the last dock snapshot.
watch(compact, value => {
  if (value) {
    layoutCache = dock.value?.snapshot() || layoutCache;
    pendingLayout = layoutCache;
    persistLayout();
    panels.palette = false;
    panels.inspector = false;
    panels.preview = false;
  } else {
    panels.palette = hasPalette.value;
    panels.inspector = hasInspector.value;
    panels.preview = false;
  }
});

defineExpose({
  getBoundingClientRect: () => workspace.value?.getBoundingClientRect?.(),
  panels,
  compact,
  toggle,
  setPanel,
  openPanel
});
</script>

<style scoped>
.designer-workspace {
  position: relative;
}
</style>
