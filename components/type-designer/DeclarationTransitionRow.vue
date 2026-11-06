<template>
  <div class="group/transition-row flex min-w-0 items-center gap-3 border-b border-chrome-border py-2 last:border-b-0">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      <Tag
        v-for="(chip, index) in sourceChips"
        :key="index"
        :severity="chip.severity"
        :icon="chip.icon"
        class="min-w-0"
      >
        <span class="min-w-0 truncate">{{ chip.label }}</span>
      </Tag>
      <Tag v-if="!sourceChips.length" :value="$t('typeDeclaration.fromAny')" severity="secondary" />
    </div>
    <i class="pi pi-arrow-right shrink-0 text-muted" aria-hidden="true" />
    <Select
      :model-value="target"
      :options="stateOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="w-40 shrink-0"
      :aria-label="$t('typeDeclaration.to')"
      @update:model-value="value => $emit('retarget', value)"
    />
    <InputText
      :model-value="entry.record.label || ''"
      size="small"
      class="min-w-0 flex-1"
      :placeholder="$t('typeDeclaration.intent')"
      :aria-label="$t('typeDeclaration.intent')"
      @update:model-value="value => $emit('intent', String(value))"
    />
    <div
      class="flex w-8 shrink-0 justify-end transition-opacity duration-150 [@media(hover:hover)]:opacity-60 group-hover/transition-row:opacity-100 group-focus-within/transition-row:opacity-100 motion-reduce:transition-none"
    >
      <Button
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        @click="$emit('remove')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import Select from '~/components/shared/InstanceSelect.vue';
import { operationTargetState } from '~/utils/processDesignerDeclarationEditor.js';

// Pure presentation — every mutation is an event up to the editor page
// (row contract: components/type-designer/README.md).
const props = defineProps({
  entry: { type: Object, required: true },
  states: { type: Array, default: () => [] },
  stateOptions: { type: Array, default: () => [] }
});

defineEmits(['retarget', 'intent', 'remove']);

const target = computed(() => operationTargetState(props.entry.record));

const sourceChips = computed(() => {
  const sources = Array.isArray(props.entry.sources) ? props.entry.sources : [];
  return sources.map(value => {
    const state = props.states.find(({ node }) => node.data?.value === value);
    return {
      label: String(state?.node.data?.label || value),
      severity: state ? (state.node.data?.severity || 'info') : 'secondary',
      icon: state?.node.data?.icon || undefined
    };
  });
});
</script>
