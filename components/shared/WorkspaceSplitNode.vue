<template>
  <Splitter
    v-if="node.kind === 'split'"
    :layout="node.orientation"
    :gutter-size="6"
    class="h-full min-h-0 !border-0 !bg-transparent"
    @resizeend="$emit('resize', node.id, $event.sizes)"
  >
    <SplitterPanel
      v-for="(child, index) in node.children"
      :key="child.id"
      :size="node.sizes?.[index] || 50"
      :min-size="15"
      class="min-h-0 min-w-0 overflow-hidden"
    >
      <WorkspaceSplitNode
        :node="child"
        :active-pane-id="activePaneId"
        @activate="$emit('activate', $event)"
        @split="$emit('split', $event)"
        @close="$emit('close', $event)"
        @resize="(...args) => $emit('resize', ...args)"
      >
        <template #default="slotProps">
          <slot v-bind="slotProps" />
        </template>
      </WorkspaceSplitNode>
    </SplitterPanel>
  </Splitter>
  <div
    v-else
    class="h-full min-h-0 min-w-0 overflow-hidden"
    :data-workspace-pane="node.id"
    :data-active="node.id === activePaneId"
    @pointerdown="$emit('activate', node.id)"
  >
    <!-- Each leaf is a PrimeVue Panel: bordered, rounded surface with a gap
         to its siblings. The Splitter above still owns the moving division,
         so wrapping panes in Panels keeps the drag handles. -->
    <Panel class="h-full" :pt="panePanelPt">
      <slot :pane="node" />
    </Panel>
  </div>
</template>

<script setup>
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import Panel from 'primevue/panel';

defineOptions({ name: 'WorkspaceSplitNode' });

defineProps({
  node: { type: Object, required: true },
  activePaneId: { type: String, default: '' }
});

defineEmits(['activate', 'split', 'close', 'resize']);

// Panel chrome follows the pane contract: no content padding (the hosted
// surface owns its own tab strip and body), the zero-canvas background, and
// the panel itself stretches to the split cell. The preset strips panel
// borders globally for the zero canvas; the pane Panel is the pane box, so
// its pt restores the default panel border color (Aura's content border).
const panePanelPt = {
  root: {
    class: 'h-full min-h-0 min-w-0 flex flex-col overflow-hidden',
    style: { '--p-panel-border-color': 'var(--p-content-border-color)' }
  },
  header: { style: { display: 'none' } },
  // Panel's grid container and wrapper default to min-width:auto, so wide
  // tab strips pushed them past the split cell - every layer must be able
  // to shrink below its content for the tablist to overflow and scroll.
  contentContainer: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  contentWrapper: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  content: { class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0' }
};
</script>

<style scoped>
/* Same pane contract as the pt above, stated so style order cannot flip it:
   a plain .p-0 utility ties with the theme's .p-panel-content padding rule,
   and the production bundle loads app css before the injected theme — the
   tie must not depend on that order. */
:deep(.p-panel-content) {
  padding: 0;
}
</style>
