<template>
  <DesignerNodeCard :selected="selected" :faulted="Boolean(data.error)" size="lg">
    <div class="flex min-w-0 flex-col gap-2">
      <div class="min-w-0">
        <div class="truncate text-supporting text-muted">{{ data.groupLabel }}</div>
        <strong class="block truncate text-label">{{ data.label }}</strong>
      </div>
      <div v-if="inputs.length || outputs.length" class="-mx-2.5 flex flex-col gap-1">
        <div v-for="row in socketRows" :key="row.key" class="flex min-h-7 items-center gap-x-4">
          <div v-if="row.input" class="relative flex min-w-0 max-w-44 items-center gap-1.5 py-1.5 pl-3" :title="socketTitle(row.input)">
            <DesignerSocketHandle :socket="socket(row.input)" :handle-id="row.input.id" side="left" :title="socketTitle(row.input)" />
            <span class="truncate text-supporting">{{ row.input.label }}</span>
          </div>
          <div v-if="row.output" class="relative ml-auto flex min-w-0 max-w-44 items-center gap-1.5 py-1.5 pr-3 text-right" :title="socketTitle(row.output)">
            <span class="truncate text-supporting">{{ row.output.label }}</span>
            <DesignerSocketHandle :socket="socket(row.output)" :handle-id="row.output.id" side="right" :title="socketTitle(row.output)" />
          </div>
        </div>
      </div>
      <span v-if="data.error" class="text-supporting text-status-danger">{{ data.error }}</span>
    </div>
  </DesignerNodeCard>
</template>

<script setup>
import { computed } from 'vue';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const inputs = computed(() => props.data.definition?.inputs || []);
const outputs = computed(() => props.data.definition?.outputs || []);
const socketRows = computed(() => Array.from(
  { length: Math.max(inputs.value.length, outputs.value.length) },
  (_, index) => ({
    key: `${inputs.value[index]?.id || ''}-${outputs.value[index]?.id || ''}-${index}`,
    input: inputs.value[index] || null,
    output: outputs.value[index] || null
  })
));

function socket(port) {
  return {
    id: port.id,
    label: port.label || port.id,
    role: 'data',
    access: port.shape || 'item',
    type: { base: port.semantic?.base || 'json', ...port.semantic }
  };
}

function socketTitle(port) {
  return [port.label || port.id, port.shape, port.semantic?.base].filter(Boolean).join(' · ');
}
</script>
