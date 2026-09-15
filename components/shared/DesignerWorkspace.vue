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
    <header v-if="$slots.toolbar" class="shrink-0">
      <slot name="toolbar" />
    </header>

    <!-- Lanes: the canvas is the workspace background, edge to edge; palette
         and inspector are floating rails docked over it. Panel visibility is
         workspace-owned: edge chevrons toggle the rails on wide hosts, while
         compact hosts (below 48rem of the workspace's own width) fold every
         panel into one bounded tabbed overlay so the canvas stays clear. -->
    <div v-if="layout === 'lanes'" class="designer-workspace__lanes min-h-0 min-w-0 flex-1 overflow-hidden">
      <main class="designer-workspace__canvas relative min-h-0 min-w-0 overflow-hidden">
        <slot />
        <div v-if="$slots.topDock" class="absolute inset-x-0 top-3 z-30 flex justify-center px-3">
          <slot name="topDock" />
        </div>
        <div v-if="$slots.dock" class="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <slot name="dock" />
        </div>
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
      <div v-if="$slots.topDock" class="absolute inset-x-0 top-3 z-30 flex justify-center px-3">
        <slot name="topDock" />
      </div>
      <div v-if="hasPalette && !compact && panels.palette" class="absolute left-3 top-14 z-20 max-h-[calc(100%-8rem)] overflow-auto">
        <slot name="palette" />
      </div>
      <aside v-if="hasInspector && !compact && panels.inspector" class="absolute bottom-16 right-3 top-14 z-20 min-h-0 max-w-[calc(100%-1.5rem)] overflow-auto">
        <slot name="inspector" />
      </aside>
      <div v-if="$slots.dock" class="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <slot name="dock" />
      </div>
    </main>

    <!-- Panel visibility is one PrimeVue SelectButton (multi-select,
         icon-only options) pinned to the top-right edge; in lanes mode it
         rides left of an open inspector rail. Selection state is the same
         panels state the rails and the compact overlay use. -->
    <SelectButton
      v-if="panelOptions.length"
      v-model="openPanels"
      :options="panelOptions"
      option-value="value"
      multiple
      :allow-empty="true"
      size="small"
      class="absolute top-3 z-30"
      :class="!compact && layout === 'lanes' && panels.inspector ? 'right-80' : 'right-3'"
      :aria-label="$t('designer.panels')"
      data-designer-panel-controls
    >
      <template #option="{ option }">
        <i :class="[option.icon, option.flip ? '-scale-x-100' : '']" :title="$t(option.labelKey)" aria-hidden="true" />
      </template>
    </SelectButton>
    <aside
      v-if="compact && compactPanelOpen"
      class="absolute inset-x-3 top-14 z-20 flex min-h-0 max-h-[55%] flex-col overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
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
import SelectButton from 'primevue/selectbutton';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  layout: {
    type: String,
    default: 'lanes',
    validator: value => ['lanes', 'canvas'].includes(value)
  }
});

const slots = useSlots();
const workspace = ref(null);

const hasPalette = computed(() => Boolean(slots.palette));
const hasInspector = computed(() => Boolean(slots.inspector));
const hasSupport = computed(() => Boolean(slots.support));

// Panel visibility is workspace-owned so every designer shares one contract:
// lane chevrons, the compact overlay, and designer docks all drive this state.
const panels = reactive({ palette: true, inspector: true, support: false });
const compact = ref(false);
const compactTab = ref('palette');

const PANEL_KEYS = ['palette', 'inspector', 'support'];
const panelOptions = computed(() => [
  hasPalette.value ? { value: 'palette', icon: 'pi pi-sidebar', labelKey: 'designer.palette' } : null,
  hasInspector.value ? { value: 'inspector', icon: 'pi pi-sidebar', flip: true, labelKey: 'designer.inspector' } : null,
  hasSupport.value ? { value: 'support', icon: 'pi pi-window-maximize', labelKey: 'designer.support' } : null
].filter(Boolean));

const openPanels = computed({
  get: () => PANEL_KEYS.filter(panel => panels[panel] && panelOptions.value.some(option => option.value === panel)),
  set(values) {
    const selected = new Set(values);
    if (compact.value) {
      // Compact keeps the unified overlay single-tab: selecting an option
      // makes it the sole open panel; deselecting the active tab closes it.
      const added = values.find(value => !panels[value]);
      for (const panel of PANEL_KEYS) panels[panel] = added ? panel === added : false;
      if (added) compactTab.value = added;
      return;
    }
    for (const panel of PANEL_KEYS) {
      panels[panel] = selected.has(panel) && panelOptions.value.some(option => option.value === panel);
    }
  }
});

function toggle(panel) {
  panels[panel] = !panels[panel];
}

function setPanel(panel, value) {
  panels[panel] = Boolean(value);
}

const compactPanelOpen = computed(() => panels.palette || panels.inspector || panels.support);

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
  setPanel
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
