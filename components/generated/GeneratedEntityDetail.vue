<template>
  <EntityPage
    v-if="entity"
    :entity="entity"
    :entity-type="entityType"
    @refresh="$emit('refresh')"
  >
    <GeneratedQueueDetail
      v-if="entityType === 'queue'"
      :queue="entity"
      :screen-key="screenKey"
      :actions="candidateActionIds"
      @refresh="$emit('refresh')"
    />
    <EntitySurfaceContent v-else :entity="entity" :entity-type="entityType" :surface="surface" />
    <slot />
    <template v-if="entityType === 'cassette' || visibleActions.length" #actions>
      <GeneratedCassetteDesignerAction
        v-if="entityType === 'cassette'"
        :entity="entity"
        @refresh="$emit('refresh')"
      />
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
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedQueueDetail from '~/components/generated/GeneratedQueueDetail.vue';
import { useAuthStore } from '~/stores/auth';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';

const props = defineProps({
  entityType: { type: String, required: true },
  entity: { type: Object, default: null },
  surface: { type: String, default: 'detail' },
  screenKey: { type: String, default: '' },
  excludedActions: { type: Array, default: () => [] },
  actions: { type: Array, default: () => [] }
});

defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const candidateActionIds = computed(() => props.actions.filter(actionId => !props.excludedActions.includes(actionId)));
const visibleActions = computed(() => candidateActionIds.value.filter((actionId) => {
  const action = authStore.actionManifest.find(item => item.actionId === actionId);
  return actionAppliesToEntity(action, props.entity, props.entityType);
}));
</script>
