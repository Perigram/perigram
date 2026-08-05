<template>
  <section
    v-if="item?.entity"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
  >
    <header class="flex h-10 shrink-0 items-center justify-end gap-2 border-b [border-color:var(--ck-chrome-border)] bg-chrome px-2 text-[var(--ck-chrome-foreground)]">
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

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <GeneratedEntityDetail
        :key="`${item.type}:${entityId}`"
        :entity="item.entity"
        :entity-type="item.type"
        :screen-key="detailScreen?.screenKey || detailScreen?.id || ''"
        :actions="resolvedActionIds"
        show-identity
        open-actions-in-workspace
        @execute-action="executeAction"
        @open-page="page => $emit('open-page', page)"
        @refresh="$emit('refresh')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import GeneratedEntityDetail from '~/components/generated/GeneratedEntityDetail.vue';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';
import {
  generatedDetailActionIds,
  generatedDetailScreenForEntityType
} from '~/components/generated/detail-screen-actions.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  item: { type: Object, default: null },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  showGeneratedActions: { type: Boolean, default: true }
});

const emit = defineEmits(['execute-action', 'open-page', 'refresh', 'split', 'close']);
const authStore = useAuthStore();
const entityId = computed(() => props.item?.entity?._id || props.item?.entity?.identity?.uid || '');
const detailScreen = computed(() => generatedDetailScreenForEntityType({
  screens: authStore.screenManifest,
  entityType: props.item?.type
}));
const ownDetailActionIds = computed(() => props.showGeneratedActions
  ? generatedDetailActionIds({
      screens: authStore.screenManifest,
      entityType: props.item?.type,
      preferredRoute: detailScreen.value?.route || ''
    })
  : []);
const resolvedEntries = computed(() => {
  const context = props.actionEntries[0]?.context || {};
  const ownEntries = ownDetailActionIds.value.map(actionId => ({
    key: `detail:${props.item?.type}:${entityId.value}:${actionId}`,
    actionId,
    entity: props.item?.entity,
    context
  }));
  return Array.from(new Map([...ownEntries, ...props.actionEntries]
    .filter(entry => {
      const action = authStore.actionManifest.find(item => item.actionId === entry.actionId);
      return action && actionAppliesToEntity(action, props.item?.entity, props.item?.type);
    })
    .map(entry => [entry.actionId, entry])
  ).values());
});
const resolvedActionIds = computed(() => resolvedEntries.value.map(entry => entry.actionId));

function executeAction(action) {
  const entry = resolvedEntries.value.find(item => item.actionId === action.actionId) || {
    actionId: action.actionId,
    entity: props.item?.entity,
    context: {}
  };
  emit('execute-action', action, entry);
}
</script>
