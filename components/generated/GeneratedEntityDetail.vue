<template>
  <EntityPage
    v-if="entity"
    :entity="entity"
    :entity-type="entityType"
    @refresh="$emit('refresh')"
  >
    <EntitySurfaceContent :entity="entity" :entity-type="entityType" :surface="surface" />
    <slot />
    <template v-if="visibleActions.length" #actions>
      <GeneratedActionButton
        v-for="actionId in visibleActions"
        :key="actionId"
        :action-id="actionId"
        @execute="action => $emit('execute-action', action, entity)"
      />
    </template>
  </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { useAuthStore } from '~/stores/auth';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';

const props = defineProps({
  entityType: { type: String, required: true },
  entity: { type: Object, default: null },
  surface: { type: String, default: 'detail' },
  actions: { type: Array, default: () => [] }
});

defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const visibleActions = computed(() => props.actions.filter((actionId) => {
  const action = authStore.actionManifest.find(item => item.actionId === actionId);
  return actionAppliesToEntity(action, props.entity, props.entityType);
}));
</script>
