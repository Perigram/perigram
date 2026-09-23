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
      class="min-h-0 min-w-0 overflow-hidden p-1.5"
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
// surface owns its own tab strip and body), and the panel itself stretches
// to the split cell.
const panePanelPt = {
  root: { class: 'h-full min-h-0 min-w-0 flex flex-col overflow-hidden' },
  // Panel's grid container and wrapper default to min-width:auto, so wide
  // tab strips pushed them past the split cell - every layer must be able
  // to shrink below its content for the tablist to overflow and scroll.
  contentContainer: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  contentWrapper: { class: 'flex min-h-0 min-w-0 flex-1 flex-col' },
  content: { class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0' }
};
</script>
