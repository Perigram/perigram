<template>
  <!-- The graph-document card is the shared ProcessNode card; definition
       ports carry the graph session's raw port ids as handle ids so
       serialized edges keep resolving. -->
  <ProcessNode :data="cardData" :selected="selected" />
</template>

<script setup>
import { computed } from 'vue';
import ProcessNode from '~/components/process-designer/ProcessNode.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

function specOf(port) {
  return {
    id: port.id,
    label: port.label || port.id,
    role: 'data',
    access: port.shape || 'item',
    required: port.required !== false,
    description: port.description || '',
    type: { base: port.semantic?.base || 'json', ...(port.semantic || {}) },
    handleId: port.id
  };
}

const cardData = computed(() => {
  const definition = props.data.definition || {};
  return {
    ...props.data,
    kindLabel: props.data.label,
    processNodeRecord: {
      inputs: (definition.inputs || []).map(specOf),
      outputs: (definition.outputs || []).map(specOf)
    },
    diagnostics: props.data.error ? [props.data.error] : null
  };
});
</script>
