<template>
  <div v-if="active" class="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:overflow-hidden">
    <div class="flex min-h-0 min-w-0 flex-col gap-3 lg:overflow-y-auto">
      <slot />
    </div>
    <div data-fill-preview class="flex min-h-[18rem] min-w-0 flex-col rounded-panel border border-content-border bg-subtle p-2 lg:min-h-0">
      <ConstructionPreview
        fill
        :type-id="typeId"
        :mode="mode"
        :type="type"
        :draft="draft"
        :ready="ready"
        @meta="value => emit('meta', value)"
      />
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import ConstructionPreview from './ConstructionPreview.vue';

// The fill dialog's composed body (SPEC §24): the form pane carries the
// rows and named offenders and owns its scroll, the preview pane the
// live composition bounded by the dialog (its meta channel bubbles to
// the host). The shell renders transparent when the create carries
// nothing to compose.
defineProps({
  active: { type: Boolean, default: false },
  typeId: { type: String, default: '' },
  mode: { type: String, default: '' },
  type: { type: Object, default: null },
  draft: { type: Object, default: () => ({}) },
  ready: { type: Boolean, default: true }
});

const emit = defineEmits(['meta']);
</script>
