<template>
  <Panel
    :header="header"
    class="flex min-h-0 flex-col"
    :pt="computedPanelPt"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
        <slot name="header">
          <span class="min-w-0 truncate text-label">{{ header }}</span>
        </slot>
        <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
          <slot name="actions" />
        </div>
      </div>
    </template>
    <slot />
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import Panel from 'primevue/panel';

const props = defineProps({
  header: { type: String, default: null },
  scrollContent: { type: Boolean, default: true },
  density: { type: String, default: 'default' },
});

const computedPanelPt = computed(() => ({
  header: {
    class: [
      'shrink-0',
      props.density === 'compact' ? '!px-2 !py-2' : '',
    ],
  },
  contentContainer: {
    class: props.scrollContent
      ? 'min-h-0 flex-1 overflow-hidden'
      : 'shrink-0 overflow-visible',
  },
  content: {
    class: [
      props.scrollContent
        ? 'h-full overflow-y-auto'
        : 'overflow-visible',
      props.density === 'compact' ? '!p-1' : '',
    ],
  },
}));
</script>
