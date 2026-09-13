<template>
  <Dock
    :model="model"
    position="bottom"
    :class="['process-designer-dock', dockClass]"
    :aria-label="ariaLabel"
  >
    <template #item="{ item }">
      <span v-if="item.separator" class="mx-auto block h-5 w-px bg-content-border" aria-hidden="true" />
      <ProcessDesignerDockItem v-else :item="item" />
    </template>
  </Dock>
</template>

<script setup>
  import { computed } from 'vue';
  import Dock from 'primevue/dock';
  import ProcessDesignerDockItem from '~/components/process-designer/ProcessDesignerDockItem.vue';

  const props = defineProps({
    items: { type: Array, required: true },
    ariaLabel: { type: String, default: '' },
    dockClass: { type: String, default: '' }
  });

  const model = computed(() => props.items.map(item => (
    item.separator ? { separator: true, disabled: true } : { ...item, separator: false }
  )));
</script>
