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
      <div class="absolute inset-0">
        <slot />
      </div>
      <WorkspaceDock
        ref="dock"
        class="absolute inset-0 pointer-events-none"
        overlay
        allow-floating
        spacer-key="workspace-spacer"
        :items="dockItems"
        :panel-closeable="panelCloseable"
        @ready="onDockReady"
        @close-tab="closeDockPanel"
        @layout-change="onDockLayoutChange"
      >
        <template #content="{ item }">
          <slot v-if="item.key === 'palette'" name="palette" />
          <slot v-else-if="item.key === 'inspector'" name="inspector" />
          <slot v-else-if="item.key === 'preview'" name="preview" />
        </template>
      </WorkspaceDock>
    </div>

    <main v-else class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
    </main>

    <!-- One floating toolbar owns every designer command: panel toggles in
         the start group, canvas commands in the end group. -->
    <div
      v-if="hasToolbarItems || $slots.toolbar"
      data-designer-toolbar
      class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3"
    >
      <Toolbar
        :aria-label="$t('designer.toolbar')"
        class="pointer-events-auto max-w-full overflow-x-auto p-1 gap-1"
      >
        <template #start>
          <DesignerToolbarItems :items="toolbarStartItems" />
        </template>
        <template v-if="canvasItems.length" #end>
          <DesignerToolbarItems :items="canvasItems" />
        </template>
      </Toolbar>
    </div>

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
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, useSlots, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Toolbar from 'primevue/toolbar';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import DesignerToolbarItems from './DesignerToolbarItems.vue';
import WorkspaceDock from './WorkspaceDock.vue';
import { useAuthStore } from '~/stores/auth';
import {
  designerWorkspaceStorageKey,
  loadDesignerWorkspaceState,
  saveDesignerWorkspaceState
} from '~/utils/designer-workspace-state.js';
import { pruneDockLayout } from '~/utils/workspace-dock-layout.js';

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
  workspaceId: { type: String, default: '' }
});

const slots = useSlots();
const { t } = useI18n();
const authStore = useAuthStore();
// The transparent panel that keeps the overlay dock alive while the host
// canvas shows through empty dock space.
const WORKSPACE_SPACER = 'workspace-spacer';
const workspace = ref(null);
const dock = ref(null);
const dockReady = ref(false);
let layoutCache = null;
let pendingLayout;
let saveTimer = null;

const hasPalette = computed(() => Boolean(slots.palette));
const hasInspector = computed(() => Boolean(slots.inspector));
const hasPreview = computed(() => Boolean(slots.preview));

const panelKeys = computed(() => [
  WORKSPACE_SPACER,
  ...(hasPalette.value ? ['palette'] : []),
  ...(hasInspector.value ? ['inspector'] : []),
  ...(hasPreview.value ? ['preview'] : [])
]);

const panelMeta = computed(() => ({
  [WORKSPACE_SPACER]: { label: '', icon: '' },
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
  return key !== WORKSPACE_SPACER;
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
  dockReady.value = true;
  const layout = pendingLayout !== undefined ? pendingLayout : persistedLayout();
  pendingLayout = undefined;
  const pruned = layout ? pruneDockLayout(layout, key => panelKeys.value.includes(key)) : null;
  if (pruned && pruned.panels[WORKSPACE_SPACER]) {
    dock.value?.applyLayout(pruned);
    await nextTick();
    syncPanels();
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
  const spacerGroup = live.addGroup({ hideHeader: true, locked: true });
  live.addPanel(WORKSPACE_SPACER, { referenceGroup: spacerGroup });
  if (hasPalette.value) await addAuxPanel('palette', 'left', 'width');
  if (hasInspector.value) await addAuxPanel('inspector', 'right', 'width');
  syncPanels();
  schedulePersist();
}

async function addAuxPanel(key, direction, axis) {
  const live = dock.value;
  if (!live) return;
  const panel = live.addPanel(key, { referencePanel: WORKSPACE_SPACER, direction });
  if (!panel) return;
  await nextTick();
  await live.sizePanelToContent(key, {
    axis,
    min: axis === 'height' ? 160 : 180,
    max: axis === 'height' ? 520 : (key === 'inspector' ? 460 : 380),
    ratio: axis === 'height' ? 0.5 : 0.32
  });
}

function showPanel(key) {
  if (!dock.value || !panelKeys.value.includes(key)) return;
  if (dock.value.hasPanel(key)) {
    dock.value.focusPanel(key);
  } else if (key === 'palette') {
    addAuxPanel('palette', 'left', 'width').then(() => schedulePersist());
  } else if (key === 'inspector') {
    addAuxPanel('inspector', 'right', 'width').then(() => schedulePersist());
  } else if (key === 'preview') {
    addAuxPanel('preview', 'below', 'height').then(() => schedulePersist());
  }
  panels[key] = true;
}

function hidePanel(key) {
  if (key === 'canvas') return;
  if (dock.value?.hasPanel(key)) dock.value.removePanel(key);
  panels[key] = false;
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

const hasToolbarItems = computed(() => toolbarStartItems.value.length > 0 || props.canvasItems.length > 0 || Boolean(slots.toolbar));

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
