<template>
  <section
    ref="workspace"
    v-bind="$attrs"
    :class="[
      'designer-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      compact ? 'designer-workspace--compact' : '',
      chromeVariant === 'floating' ? 'designer-workspace--floating' : '',
      $attrs.class
    ]"
    :data-designer-layout="layout"
    :data-designer-chrome="chromeVariant"
  >
    <!-- Lanes: the canvas is the workspace background, edge to edge; palette
         and inspector are floating rails docked over it. Panel visibility is
         workspace-owned: edge chevrons toggle the rails on wide hosts, while
         compact hosts (below 48rem of the workspace's own width) fold every
         panel into one bounded tabbed overlay so the canvas stays clear. -->
    <div v-if="layout === 'lanes'" class="designer-workspace__lanes min-h-0 min-w-0 flex-1 overflow-hidden">
      <main class="designer-workspace__canvas relative min-h-0 min-w-0 overflow-hidden">
        <slot />
      </main>
      <aside
        v-if="hasPalette && !compact && panels.palette"
        class="designer-workspace__rail designer-workspace__palette min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="palette" />
      </aside>
      <aside
        v-if="hasInspector && !compact && panels.inspector"
        class="designer-workspace__rail designer-workspace__inspector min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="inspector" />
      </aside>
      <aside
        v-if="hasSupport && !compact && panels.support"
        class="designer-workspace__rail designer-workspace__support min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="support" />
      </aside>

    </div>

    <main v-else class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
      <div v-if="hasPalette && !compact && panels.palette" class="designer-workspace__rail absolute top-3 bottom-3 left-3 z-20 w-[17rem] max-w-[45%] overflow-hidden rounded-ui border border-content-border shadow-overlay" :class="chromeVariant === 'floating' ? 'bg-content/85 backdrop-blur-md' : 'bg-content'">
        <slot name="palette" />
      </div>
      <aside v-if="hasInspector && !compact && panels.inspector" class="designer-workspace__rail absolute top-3 bottom-3 right-3 z-20 w-[22rem] max-w-[45%] overflow-hidden rounded-ui border border-content-border shadow-overlay" :class="chromeVariant === 'floating' ? 'bg-content/85 backdrop-blur-md' : 'bg-content'">
        <slot name="inspector" />
      </aside>
      <aside v-if="hasSupport && !compact && panels.support" class="designer-workspace__rail designer-workspace__support absolute top-3 bottom-3 right-3 z-20 w-[22rem] max-w-[45%] overflow-hidden rounded-ui border border-content-border shadow-overlay" :class="chromeVariant === 'floating' ? 'bg-content/85 backdrop-blur-md' : 'bg-content'">
        <slot name="support" />
      </aside>
    </main>

    <!-- One floating toolbar owns every designer command: panel toggles and
         document operations in the start group, canvas commands in the end
         group. The wrapper spans the workspace but passes pointer events
         through its empty sides so the canvas stays interactive. -->
    <div
      v-if="hasToolbarItems || $slots.toolbar"
      data-designer-toolbar
      class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3"
    >
      <Toolbar
        :aria-label="$t('designer.toolbar')"
        class="pointer-events-auto max-w-full overflow-x-auto p-1 gap-1"
        :class="chromeVariant === 'floating' ? 'rounded-full border border-content-border bg-content/85 shadow-overlay backdrop-blur-md' : ''"
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
         outside the panel (the backdrop over the canvas area) closes it, so
         touch hosts never need to hunt for a close control. -->
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
          <Tab v-if="hasSupport" value="support">{{ $t('designer.support') }}</Tab>
        </TabList>
        <TabPanels class="min-h-0 flex-1 overflow-y-auto">
          <TabPanel v-if="hasPalette" value="palette">
            <slot name="palette" />
          </TabPanel>
          <TabPanel v-if="hasInspector" value="inspector">
            <slot name="inspector" />
          </TabPanel>
          <TabPanel v-if="hasSupport" value="support">
            <slot name="support" />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </aside>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, useSlots, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Toolbar from 'primevue/toolbar';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import DesignerToolbarItems from './DesignerToolbarItems.vue';

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
  chromeVariant: { type: String, default: 'plane', validator: value => ['plane', 'floating'].includes(value) }
});

const slots = useSlots();
const { t } = useI18n();
const workspace = ref(null);

const hasPalette = computed(() => Boolean(slots.palette));
const hasInspector = computed(() => Boolean(slots.inspector));
const hasSupport = computed(() => Boolean(slots.support));

// Panel visibility is workspace-owned so every designer shares one contract:
// lane chevrons, the compact overlay, and the toolbar toggles all drive this state.
const panels = reactive({ palette: true, inspector: true, support: false });
const compact = ref(false);
const compactTab = ref('palette');

const PANEL_KEYS = ['palette', 'inspector', 'support'];

function togglePanelFromToolbar(panel) {
  if (compact.value) {
    const sole = panels[panel] && PANEL_KEYS.every(key => !panels[key] || key === panel);
    for (const key of PANEL_KEYS) panels[key] = sole ? false : key === panel;
    if (!sole) compactTab.value = panel;
    return;
  }
  panels[panel] = !panels[panel];
}

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
  hasSupport.value ? {
    icon: 'pi pi-window-maximize',
    label: t('designer.support'),
    pressed: panels.support,
    onClick: () => togglePanelFromToolbar('support')
  } : null
].filter(Boolean));

const toolbarStartItems = panelDockItems;

const hasToolbarItems = computed(() => toolbarStartItems.value.length > 0 || props.canvasItems.length > 0 || Boolean(slots.toolbar));

// Toolbar items are plain data (icon class + label + handlers); the shared
// Toolbar items are plain data (icon class + label + handlers) rendered
// through DesignerToolbarItems; a boolean `pressed` item is the same
// button outlined, never a different control family.
function toggle(panel) {
  panels[panel] = !panels[panel];
}

function setPanel(panel, value) {
  panels[panel] = Boolean(value);
}

function openPanel(panel) {
  if (!PANEL_KEYS.includes(panel)) return;
  if (compact.value) {
    for (const key of PANEL_KEYS) panels[key] = key === panel;
    compactTab.value = panel;
    return;
  }
  panels[panel] = true;
}

const compactPanelOpen = computed(() => panels.palette || panels.inspector || panels.support);

function closeCompactPanels() {
  panels.palette = false;
  panels.inspector = false;
  panels.support = false;
}

provide('designerWorkspacePanels', {
  panels,
  compact,
  toggle,
  setPanel,
  isPanelOpen: panel => Boolean(panels[panel])
});

const workspaceObserver = { observer: null };

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !workspace.value) return;
  workspaceObserver.observer = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect?.width || 0;
    compact.value = width > 0 && width < 768;
  });
  workspaceObserver.observer.observe(workspace.value);
});

onBeforeUnmount(() => {
  workspaceObserver.observer?.disconnect();
  workspaceObserver.observer = null;
});

// Crossing the compact boundary resets to the mode's sensible defaults:
// compact hosts keep the canvas clear, wide hosts keep the rails up.
watch(compact, value => {
  if (value) {
    panels.palette = false;
    panels.inspector = false;
    panels.support = false;
  } else {
    panels.palette = hasPalette.value;
    panels.inspector = hasInspector.value;
    panels.support = false;
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
/* One grid row: the canvas spans every column as the full-bleed background
   and the rails occupy the side tracks above it. The explicit row floor
   keeps the workspace visible even when a host breaks the bounded-height
   chain, and the rail max-widths cap against the workspace width instead
   of a viewport breakpoint. */
.designer-workspace {
  position: relative;
  --designer-palette-width: 17rem;
  --designer-inspector-width: 19rem;
}

.designer-workspace__lanes {
  display: grid;
  grid-template-columns: minmax(0, 17rem) minmax(0, 1fr) minmax(0, 19rem);
  grid-template-rows: minmax(22rem, 1fr);
}

.designer-workspace__canvas {
  grid-area: 1 / 1 / 2 / 4;
}

.designer-workspace__rail {
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.designer-workspace__palette {
  grid-area: 1 / 1;
  margin: 0.75rem 0 0.75rem 0.75rem;
}

.designer-workspace__inspector {
  grid-area: 1 / 3;
  margin: 0.75rem 0.75rem 0.75rem 0;
}

.designer-workspace__support {
  grid-area: 1 / 2;
  align-self: end;
  justify-self: start;
  width: 17rem;
  max-width: 42%;
  max-height: 45%;
  margin: 0 0 0.75rem 0.75rem;
}
</style>
