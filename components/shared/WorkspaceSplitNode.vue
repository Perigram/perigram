<template>
  <Splitter
    v-if="node.kind === 'split'"
    :layout="node.orientation"
    :gutter-size="1"
    class="h-full min-h-0 !border-0"
  >
    <SplitterPanel
      v-for="child in node.children"
      :key="child.id"
      :min-size="15"
      class="min-h-0 min-w-0 overflow-hidden"
    >
      <WorkspaceSplitNode
        :node="child"
        :active-pane-id="activePaneId"
        @activate="$emit('activate', $event)"
        @split="$emit('split', $event)"
        @close="$emit('close', $event)"
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

defineEmits(['activate', 'split', 'close']);
</script>
