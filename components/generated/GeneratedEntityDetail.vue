<template>
  <EntityPage
    v-if="entity"
    :entity="entity"
    :entity-type="entityType"
    @refresh="$emit('refresh')"
  >
    <EntitySurfaceContent :entity="entity" :entity-type="entityType" :surface="surface" />
    <template v-if="actions.length" #actions>
      <GeneratedActionButton
        v-for="actionId in actions"
        :key="actionId"
        :action-id="actionId"
        @execute="$emit('execute-action', $event, entity)"
      />
    </template>
  </EntityPage>
</template>

<script setup>
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';

defineProps({
  entityType: { type: String, required: true },
  entity: { type: Object, default: null },
  surface: { type: String, default: 'detail' },
  actions: { type: Array, default: () => [] }
});

defineEmits(['refresh', 'execute-action']);
</script>
