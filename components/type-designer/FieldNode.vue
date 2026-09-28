<template>
  <DesignerNodeCard :selected="selected" size="sm" :shape="shape">
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

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
  // Population shape passthrough (node UI contract): the process canvas
  // renders this family as the dashed declaration vocabulary; the type
  // canvas passes nothing and keeps the neutral default frame.
  shape: { type: String, default: '' }
});

defineEmits(['rename']);

const name = computed(() => props.data.name || '');
const isRef = computed(() => props.data.descriptor?.base === 'ref');
const inputSpec = computed(() => props.data.inputSpecs?.[0] || {});
const outputSpec = computed(() => props.data.outputSpecs?.[0] || {});
const typeLabel = computed(() => {
  const descriptor = props.data.descriptor || {};
  if (descriptor.base === 'quantity') return `${descriptor.unit || '?'}`;
  if (descriptor.base === 'ref') return `Ref(${(descriptor.accepts || []).join('|')})`;
  if (descriptor.nullable) return `${descriptor.base}?`;
  return descriptor.base || 'field';
});
</script>
