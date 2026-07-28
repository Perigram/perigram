<template>
  <EntityPage
    v-if="entity"
    :entity="entity"
    :entity-type="entityType"
    show-trace
    :show-identity="entityType === 'sheet_design'"
    @refresh="$emit('refresh')"
  >
    <GeneratedEntityDetailBody
      :entity="entity"
      :entity-type="entityType"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedActions"
      @refresh="$emit('refresh')"
    />
    <slot />
    <template v-if="entityType === 'cassette' || headerActionIds.length || entityCanDelete" #actions>
      <GeneratedCassetteDesignerAction
        v-if="entityType === 'cassette'"
        :entity="entity"
        menu-item
        @refresh="$emit('refresh')"
      />
      <GeneratedActionButton
        v-for="actionId in headerActionIds"
        :key="actionId"
        :action-id="actionId"
        menu-item
        @execute="action => $emit('execute-action', action, entity)"
      />
      <GeneratedDeleteButton
        :entity="entity"
        :entity-type="entityType"
        menu-item
        @deleted="$emit('refresh')"
      />
    </template>
  </EntityPage>
</template>

<script setup>
import { computed, provide } from 'vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import GeneratedEntityDetailBody from '~/components/generated/GeneratedEntityDetailBody.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { isGeneratedSurfaceAction, resolveGeneratedEntityActions } from '~/components/generated/action-visibility.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';

const props = defineProps({
  entityType: { type: String, required: true },
  entity: { type: Object, default: null },
  surface: { type: String, default: 'detail' },
  screenKey: { type: String, default: '' },
  excludedActions: { type: Array, default: () => [] },
  actions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.entity,
  entityType: props.entityType,
  excludedActionIds: props.excludedActions
}));
const headerActionIds = computed(() => resolvedActions.value
  .filter(isGeneratedSurfaceAction)
  .filter(action => !(props.entityType === 'queue' && action.actionKind === 'runCommand' && action.commandId === 'solveNesting'))
  .map(action => action.actionId));
const entityCanDelete = computed(() => canDeleteGeneratedEntity({
  authStore,
  domainUi,
  entity: props.entity,
  entityType: props.entityType
}));
</script>
