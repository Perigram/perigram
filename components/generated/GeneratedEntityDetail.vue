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
    <template v-if="entityType === 'cassette' || visibleActions.length || entityCanDelete" #actions>
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
      <GeneratedDeleteButton
        :entity="entity"
        :entity-type="entityType"
        @deleted="$emit('refresh')"
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
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import GeneratedQueueDetail from '~/components/generated/GeneratedQueueDetail.vue';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';

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
const domainUi = useCutkitDomainUi();
const candidateActionIds = computed(() => props.actions.filter(actionId => !props.excludedActions.includes(actionId)));
const visibleActions = computed(() => candidateActionIds.value.filter((actionId) => {
  const action = authStore.actionManifest.find(item => item.actionId === actionId);
  return actionAppliesToEntity(action, props.entity, props.entityType);
}));
const entityCanDelete = computed(() => canDeleteGeneratedEntity({
  authStore,
  domainUi,
  entity: props.entity,
  entityType: props.entityType
}));
</script>
