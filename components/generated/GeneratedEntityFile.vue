<template>
  <section
    v-if="item?.entity"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
  >
    <header class="flex h-10 shrink-0 items-center gap-2 border-b border-content-border px-2">
      <i :class="[domainUi.getIcon(item.type), 'shrink-0']" aria-hidden="true"></i>
      <IdentityBlock :entity="item.entity" variant="compact" class="min-w-0 flex-1" />
      <EntityStatus
        :entity="item.entity"
        :entity-type="item.type"
        variant="inline"
        @refresh="$emit('refresh')"
        @transitioned="$emit('refresh')"
      />
      <EntityActionsPopover v-if="hasEntityActions">
        <GeneratedCassetteDesignerAction
          v-if="item.type === 'cassette'"
          :entity="item.entity"
          menu-item
          @refresh="$emit('refresh')"
        />
        <GeneratedActionButton
          v-for="entry in headerActionEntries"
          :key="entry.key"
          :action-id="entry.actionId"
          menu-item
          @execute="action => $emit('execute-action', action, entry)"
        />
        <GeneratedDeleteButton
          :entity="item.entity"
          :entity-type="item.type"
          menu-item
          @deleted="$emit('refresh')"
        />
      </EntityActionsPopover>
      <Button
        v-if="splittable"
        icon="pi pi-arrows-h"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.splitRight')"
        @click="$emit('split', 'horizontal')"
      />
      <Button
        v-if="splittable"
        icon="pi pi-arrows-v"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.splitDown')"
        @click="$emit('split', 'vertical')"
      />
      <Button
        v-if="closeable"
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('common.close')"
        @click="$emit('close')"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <GeneratedProjectFileHome
        v-if="item.type === 'project'"
        :action-entries="resolvedActionEntries"
        @execute-action="(action, entry) => $emit('execute-action', action, entry)"
      />
      <GeneratedEntityDetailBody
        v-else
        :key="`${item.type}:${entityId}`"
        :entity="item.entity"
        :entity-type="item.type"
        surface="detail"
        :screen-key="detailScreen?.screenKey || detailScreen?.id || ''"
        :actions="detailActions"
        mode="file"
        :display-overrides="fileDisplayOverrides"
        relation-variant="compact"
        @refresh="$emit('refresh')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, provide } from 'vue';
import Button from 'primevue/button';
import EntityActionsPopover from '~/components/shared/EntityActionsPopover.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import GeneratedEntityDetailBody from '~/components/generated/GeneratedEntityDetailBody.vue';
import GeneratedProjectFileHome from '~/components/generated/GeneratedProjectFileHome.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import {
  generatedDetailActionIds,
  generatedDetailScreenForEntityType
} from '~/components/generated/detail-screen-actions.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
  item: { type: Object, default: null },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

const emit = defineEmits(['execute-action', 'refresh', 'split', 'close']);
const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const fileDisplayOverrides = {
  dataDisplay: 'compact',
  relations: 'expanded',
  actions: 'menu',
  trace: 'hidden'
};
const entityId = computed(() => (
  props.item?.entity?._id || props.item?.entity?.identity?.uid || ''
));
const detailScreen = computed(() => generatedDetailScreenForEntityType({
  screens: authStore.screenManifest,
  entityType: props.item?.type
}));
const ownDetailActionIds = computed(() => generatedDetailActionIds({
  screens: authStore.screenManifest,
  entityType: props.item?.type,
  preferredRoute: detailScreen.value?.route || ''
}));
const resolvedActionEntries = computed(() => {
  const existing = props.actionEntries || [];
  const context = existing[0]?.context || {};
  const ownEntries = ownDetailActionIds.value.map(actionId => ({
    key: `detail:${props.item?.type}:${entityId.value}:${actionId}`,
    actionId,
    entity: props.item?.entity,
    context
  }));
  return Array.from(new Map([...existing, ...ownEntries]
    .filter(entry => {
      const action = authStore.actionManifest.find(item => item.actionId === entry.actionId);
      return action && actionAppliesToEntity(action, props.item?.entity, props.item?.type);
    })
    .map(entry => [entry.actionId, entry])
  ).values());
});
const detailActions = computed(() => resolvedActionEntries.value
  .map(entry => authStore.actionManifest.find(action => action.actionId === entry.actionId))
  .filter(Boolean));
const headerActionEntries = computed(() => resolvedActionEntries.value.filter(entry => {
  const action = authStore.actionManifest.find(item => item.actionId === entry.actionId);
  return isGeneratedSurfaceAction(action) && !isConsumedDetailAction(action);
}));
const canDelete = computed(() => canDeleteGeneratedEntity({
  authStore,
  domainUi,
  entity: props.item?.entity,
  entityType: props.item?.type
}));
const canEditCassette = computed(() => props.item?.type === 'cassette' && hasPermissionGrant({
  permissions: authStore.activePermissions,
  feature: 'cassettes',
  level: 'write',
  entity: props.item?.entity,
  entityType: 'cassette'
}));
const hasEntityActions = computed(() => (
  headerActionEntries.value.length
  || canEditCassette.value
  || canDelete.value
));

function isConsumedDetailAction(action = {}) {
  return props.item?.type === 'queue'
    && action.actionKind === 'runCommand'
    && action.commandId === 'solveNesting';
}

provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, { entity, context });
});
</script>
