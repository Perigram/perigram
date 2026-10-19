<template>
  <GeneratedInstanceCollection
    :items="sourceState.items"
    :type-id="sourceState.source?.typeId || ''"
    :surface="region.surface || 'card'"
    :template="template"
    :actions="effectiveActions"
    :screen-key="screenKey"
    :region="region"
    :source="sourceState.source"
    :action-context="actionContext"
    :open-in-workspace="openInWorkspace"
    @refresh="$emit('refresh')"
    @open-entity="request => $emit('open-entity', request)"
    @open-page="page => $emit('open-page', page)"
    @execute-action="(action, entity, context) => $emit('execute-action', action, entity, context)"
  />
</template>

<script setup>
import { computed } from 'vue';
import GeneratedInstanceCollection from '~/components/generated/GeneratedInstanceCollection.vue';

const props = defineProps({
  region: { type: Object, required: true },
  sourceState: { type: Object, required: true },
  template: { type: String, default: 'typeList' },
  screenActions: { type: Array, default: () => [] },
  screenKey: { type: String, default: '' },
  actionContext: { type: Object, default: () => ({}) },
  openInWorkspace: { type: Boolean, default: false }
});

defineEmits(['refresh', 'execute-action', 'open-entity', 'open-page']);

const effectiveActions = computed(() => [...new Set([
  ...(props.region.actions || []),
  ...(props.screenActions || [])
])]);
</script>
