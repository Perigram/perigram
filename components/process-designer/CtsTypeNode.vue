<script setup>
// Reference card for a CTS type on the process canvas. Read-only: authoring
// lives in the type registry (/organization/types); the card shows what the
// graph is working with and links there. Deleting the card never deletes
// the type (it owns no records).
import { computed } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const type = computed(() => props.data.typeSummary || {});
const stateCount = computed(() => type.value.states?.main?.values?.length || 0);
const transitionCount = computed(() => type.value.transitions?.length || 0);
const lifecycleLine = computed(() => stateCount.value
  ? `${stateCount.value} states · ${transitionCount.value} transitions`
  : 'no lifecycle');

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
      <strong class="min-w-0 flex-1 truncate text-label">{{ props.data.typeId || props.data.refId }}</strong>
      <Tag :value="type.class || 'type'" severity="secondary" />
    </div>

    <div class="mt-2 flex flex-col gap-1">
      <span class="text-supporting text-muted">{{ lifecycleLine }}</span>
      <Button
        label="Open in type registry"
        size="small"
        text
        icon="pi pi-external-link"
        class="min-w-0 justify-start px-0"
        @click="navigateTo(`/organization/types`)"
      />
    </div>
  </div>
</template>
