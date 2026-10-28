<template>
  <div v-if="active" class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
    <div class="flex min-w-0 flex-col gap-3">
      <slot />
    </div>
    <div class="flex min-h-[18rem] min-w-0 flex-col rounded-panel border border-content-border bg-subtle p-2">
      <ConstructionPreview
        fill
        :type-id="typeId"
        :mode="mode"
        :type="type"
        :draft="draft"
        @meta="value => emit('meta', value)"
      />
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import ConstructionPreview from './ConstructionPreview.vue';

// The fill dialog's composed body (SPEC §24): the form pane carries the
// rows and named offenders, the preview pane the live composition (its
// meta channel bubbles to the host). The shell renders transparent when
// the create carries nothing to compose.
defineProps({
  active: { type: Boolean, default: false },
  typeId: { type: String, default: '' },
  mode: { type: String, default: '' },
  type: { type: Object, default: null },
  draft: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['meta']);
</script>
