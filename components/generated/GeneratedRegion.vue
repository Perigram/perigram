<template>
  <GeneratedEntityDetail
    v-if="sourceState.source?.mode === 'single'"
    :entity="sourceState.entity"
    :entity-type="sourceState.source.entityType"
    :surface="region.surface || 'detail'"
    :actions="effectiveActions"
    @refresh="$emit('refresh')"
    @execute-action="(action, entity, context) => $emit('execute-action', action, entity, context)"
  >
    <slot />
  </GeneratedEntityDetail>
  <GeneratedEntityCollection
    v-else
    :items="sourceState.items"
    :entity-type="sourceState.source?.entityType || ''"
    :surface="region.surface || 'card'"
    :template="template"
    :actions="effectiveActions"
    :screen-key="screenKey"
    :region="region"
    :source="sourceState.source"
    :action-context="actionContext"
    @refresh="$emit('refresh')"
    @execute-action="(action, entity, context) => $emit('execute-action', action, entity, context)"
  />
</template>

<script setup>
import { computed } from 'vue';
import GeneratedEntityCollection from '~/components/generated/GeneratedEntityCollection.vue';
import GeneratedEntityDetail from '~/components/generated/GeneratedEntityDetail.vue';

const props = defineProps({
  region: { type: Object, required: true },
  sourceState: { type: Object, required: true },
  template: { type: String, default: 'entityList' },
  screenActions: { type: Array, default: () => [] },
  screenKey: { type: String, default: '' },
  actionContext: { type: Object, default: () => ({}) }
});

defineEmits(['refresh', 'execute-action']);

const effectiveActions = computed(() => props.region.actions?.length ? props.region.actions : props.screenActions);
</script>
