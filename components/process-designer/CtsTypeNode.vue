<script setup>
// Canvas card for a CTS type (created from the palette's Types group).
// Follows the standard node pattern: the card is a live reference into the
// type registry; editing happens in the inspector like every other node.
import { computed } from 'vue';
import Tag from 'primevue/tag';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const type = computed(() => props.data.type || null);
const stateCount = computed(() => type.value?.states?.main?.values?.length || 0);
const transitionCount = computed(() => type.value?.transitions?.length || 0);
const statesPreview = computed(() => (type.value?.states?.main?.values || []).slice(0, 4).join(', '));

const frameClass = computed(() => [
  'relative w-56 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>

<template>
  <div :class="frameClass">
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" style="background-color: var(--ck-status-neutral)"></div>

    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle">
        <i class="pi pi-database" style="color: var(--ck-status-neutral)" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">{{ type?.id || props.data.typeId || 'type' }}</strong>
      <Tag :value="type?.class || 'type'" severity="secondary" />
    </div>

    <div class="mt-2 flex flex-col gap-1">
      <span v-if="stateCount" class="text-supporting text-muted">{{ stateCount }} states · {{ transitionCount }} transitions</span>
      <span v-if="statesPreview" class="text-supporting text-muted truncate">{{ statesPreview }}</span>
      <span v-else class="text-supporting text-muted">select to edit states in the inspector</span>
    </div>
  </div>
</template>
