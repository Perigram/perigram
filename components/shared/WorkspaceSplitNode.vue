<template>
  <Splitter
    v-if="node.kind === 'split'"
    :layout="node.orientation"
    :gutter-size="1"
    class="h-full min-h-0 !border-0"
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
    <slot :pane="node" />
  </div>
</template>

<script setup>
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';

defineOptions({ name: 'WorkspaceSplitNode' });

defineProps({
  node: { type: Object, required: true },
  activePaneId: { type: String, default: '' }
});

defineEmits(['activate', 'split', 'close', 'resize']);
</script>
