<template>
  <GeneratedEntityDetail
    v-if="sourceState.source?.mode === 'single'"
    :entity="sourceState.entity"
    :entity-type="sourceState.source.entityType"
    :surface="region.surface || 'detail'"
    :actions="region.actions || []"
    @refresh="$emit('refresh')"
    @execute-action="(action, entity) => $emit('execute-action', action, entity)"
  />
  <GeneratedEntityCollection
    v-else
    :items="sourceState.items"
    :entity-type="sourceState.source?.entityType || ''"
    :surface="region.surface || 'card'"
    :template="template"
    :actions="region.actions || []"
    @refresh="$emit('refresh')"
    @execute-action="(action, entity) => $emit('execute-action', action, entity)"
  />
</template>

<script setup>
import GeneratedEntityCollection from '~/components/generated/GeneratedEntityCollection.vue';
import GeneratedEntityDetail from '~/components/generated/GeneratedEntityDetail.vue';

defineProps({
  region: { type: Object, required: true },
  sourceState: { type: Object, required: true },
  template: { type: String, default: 'entityList' }
});

defineEmits(['refresh', 'execute-action']);
</script>
