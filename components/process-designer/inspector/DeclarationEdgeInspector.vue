<template>
  <div class="flex min-w-0 flex-col gap-4">
    <template v-if="edge.label === 'children'">
      <div class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.edgeKey') }}</label>
        <InputText v-model="edge.data.key" />
      </div>
      <div class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.edgeOnRemove') }}</label>
        <Select
          v-model="edge.data.onRemove"
          :options="onRemoveOptions"
          option-label="label"
          option-value="value"
        />
      </div>
    </template>
    <Message v-else severity="secondary" :closable="false">{{ $t('processDesigner.declarationEdgeHint') }}</Message>
  </div>
</template>

<script setup>
// Declaration-wire inspector: children edges (storage key + onRemove
// integrity). The edge object is the canvas edge itself; the live-graph
// pass picks edits up from the edge set.
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import { ON_REMOVE } from '#packages/cts';

defineProps({
  edge: { type: Object, required: true }
});

const onRemoveOptions = ON_REMOVE.map(value => ({ label: value, value }));
</script>
