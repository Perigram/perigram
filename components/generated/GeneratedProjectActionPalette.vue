<template>
  <div class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden" data-project-action-palette>
    <Button
      v-for="entry in visibleEntries"
      :key="entry.key"
      :label="actionLabel(entry)"
      :icon="actionIcon(entry)"
      severity="secondary"
      outlined
      size="small"
      :aria-label="actionLabel(entry)"
      :title="actionLabel(entry)"
      @click="$emit('execute-action', actionFor(entry), entry)"
    />
    <Button
      v-if="overflowEntries.length"
      icon="pi pi-ellipsis-h"
      text
      rounded
      size="small"
      severity="secondary"
      :aria-label="$t('common.more')"
      @click="toggleOverflow"
    />
    <Popover ref="overflowPopover">
      <div class="flex min-w-52 flex-col gap-1">
        <Button
          v-for="entry in overflowEntries"
          :key="entry.key"
          :label="actionLabel(entry)"
          :icon="actionIcon(entry)"
          text
          size="small"
          class="w-full justify-start"
          @click="executeOverflow(entry)"
        />
      </div>
    </Popover>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { generatedActionLabel, generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  actionEntries: { type: Array, default: () => [] }
});

const emit = defineEmits(['execute-action']);
const authStore = useAuthStore();
const { t, te } = useI18n();
const overflowPopover = ref(null);
const visibleEntries = computed(() => props.actionEntries.slice(0, 4));
const overflowEntries = computed(() => props.actionEntries.slice(4));

function actionFor(entry) {
  return authStore.actionManifest.find(action => action.actionId === entry.actionId) || null;
}

function actionLabel(entry) {
  const action = actionFor(entry) || {};
  const entityLabel = generatedEntityLabel(action.relationMutation?.targetType || action.entityType, { t, te });
  if (action.actionKind === 'createEntity') return `${t('generatedScreen.actions.create')} ${entityLabel}`;
  if (action.relationMutation?.operation === 'link') return `${t('generatedScreen.actions.link')} ${entityLabel}`;
  if (action.actionKind === 'runCommand') return `${t('generatedScreen.actions.run')} ${generatedActionLabel(action, entry.actionId, { t, te })}`;
  return generatedActionLabel(action, entry.actionId, { t, te });
}

function actionIcon(entry) {
  const action = actionFor(entry) || {};
  if (action.relationMutation?.operation === 'link') return 'pi pi-link';
  if (action.actionKind === 'createEntity') return 'pi pi-plus';
  if (action.actionKind === 'updateEntity' && action.status?.to) return 'pi pi-arrow-right-arrow-left';
  if (action.actionKind === 'updateEntity') return 'pi pi-pencil';
  if (action.actionKind === 'sendToOrganization') return 'pi pi-send';
  return 'pi pi-play';
}

function toggleOverflow(event) {
  overflowPopover.value?.toggle(event);
}

function executeOverflow(entry) {
  overflowPopover.value?.hide();
  emit('execute-action', actionFor(entry), entry);
}
</script>
