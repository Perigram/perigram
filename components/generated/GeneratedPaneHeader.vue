<template>
  <!-- The ONE pane-header stripe: the tab strip and the pane controls in
       a single fixed-height row whose hairline spans the whole stripe.
       The height lives HERE and nowhere else — every pane host mounts
       this component, and the controls fill the row (h-full) rather
       than restating its height. -->
  <div data-pane-header class="flex h-6 shrink-0 items-stretch border-b border-chrome-border">
    <GeneratedWorkspaceTabs
      :tabs="tabs"
      :active-key="activeKey"
      @select="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add')"
      @refresh="$emit('refresh')"
    />
    <div class="flex shrink-0 items-stretch pr-0.5">
      <GeneratedWorkspacePaneMenu
        :splittable="splittable"
        :closeable="closeable"
        @split="$emit('split', $event)"
        @close="$emit('close')"
      />
    </div>
  </div>
</template>

<script setup>
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['refresh', 'select-tab', 'close-tab', 'add', 'split', 'close']);
</script>
