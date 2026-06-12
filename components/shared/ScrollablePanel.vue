<template>
  <Panel
    :header="header"
    class="flex min-h-0 flex-col"
    :pt="panelPt"
  >
    <slot />
  </Panel>
</template>

<script setup>
import Panel from 'primevue/panel';

defineProps({
  header: { type: String, default: null },
});

const panelPt = {
  header: { class: 'shrink-0' },
  contentContainer: { class: 'min-h-0 flex-1 overflow-hidden' },
  content: { class: 'h-full overflow-y-auto' },
};
</script>
