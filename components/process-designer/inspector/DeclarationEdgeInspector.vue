<template>
  <div class="flex min-w-0 flex-col gap-4">
    <template v-if="edge.label === 'transition'">
      <div class="flex flex-col gap-1">
        <label>{{ $t('typesPane.intent') }}</label>
        <InputText v-model="edge.data.intent" :placeholder="'finish'" @update:model-value="edge.label = edge.data.intent || 'transition'" />
      </div>
      <Message severity="info" :closable="false">{{ $t('processDesigner.transitionEdgeHint') }}</Message>
    </template>
    <template v-else-if="edge.label === 'children'">
      <div class="flex flex-col gap-1">
        <label>{{ $t('typesPane.edgeKey') }}</label>
        <InputText v-model="edge.data.key" />
      </div>
      <div class="flex flex-col gap-1">
        <label>{{ $t('typesPane.onRemove') }}</label>
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
// Declaration-wire inspector: transition intents and children edges
// (storage key + onRemove integrity). The edge object is the canvas edge
// itself; the live-graph pass picks edits up from the edge set.
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import { ON_REMOVE } from '~/packages/cts/src/index.js';

defineProps({
  edge: { type: Object, required: true }
});

const onRemoveOptions = ON_REMOVE.map(value => ({ label: value, value }));
</script>
