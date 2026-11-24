<template>
  <DesignerNodeCard :selected="selected" size="sm">
    <div class="flex items-center gap-1.5">
      <i class="pi pi-angle-right text-muted" aria-hidden="true" />
      <InputText
        :model-value="name"
        size="small"
        class="min-w-0 flex-1"
        :placeholder="'field'"
        @update:model-value="value => $emit('rename', value)"
        @click.stop
        @dblclick.stop
      />
      <Tag :value="typeLabel" severity="secondary" />
    </div>
    <DesignerSocketHandle v-if="isRef" :socket="inputSpec" side="left" handle-id="input:targets" />
    <DesignerSocketHandle :socket="outputSpec" side="right" handle-id="output:field" />
  </DesignerNodeCard>
</template>

<script setup>
// Field declaration node: wires into its type (declares); a ref field
// also receives its accepted target types through its targets input.
// The descriptor (base, unit, nullability) is authored in the inspector.
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';
import { fieldDescriptorSummary } from '~/utils/processDesignerDeclarationEditor.js';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

defineEmits(['rename']);

const name = computed(() => props.data.name || '');
const isRef = computed(() => {
  const descriptor = props.data.descriptor || {};
  return descriptor.base === 'ref'
    || (descriptor.base === 'list' && descriptor.itemType?.base === 'ref');
});
const inputSpec = computed(() => props.data.inputSpecs?.[0] || {});
const outputSpec = computed(() => props.data.outputSpecs?.[0] || {});
const typeLabel = computed(() => fieldDescriptorSummary(props.data.descriptor || {}, props.data.fieldTypeLabelFor || null));
</script>
