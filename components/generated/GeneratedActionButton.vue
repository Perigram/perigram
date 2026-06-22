<template>
  <Button
    v-if="action"
    :label="actionLabel"
    :icon="actionIcon"
    size="small"
    severity="secondary"
    outlined
    @click="$emit('execute', action)"
  />
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  actionId: { type: String, required: true }
});

defineEmits(['execute']);

const authStore = useAuthStore();
const action = computed(() => authStore.actionManifest.find(item => item.actionId === props.actionId));
const actionLabel = computed(() => displayActionLabel(action.value || {}, props.actionId));
const actionIcon = computed(() => {
  if (action.value?.actionKind === 'createEntity') return 'pi pi-plus';
  if (action.value?.actionKind === 'changeStatus') return 'pi pi-arrow-right-arrow-left';
  if (action.value?.actionKind === 'updateEntity') return 'pi pi-pencil';
  if (action.value?.actionKind === 'sendToOrganization') return 'pi pi-send';
  return 'pi pi-play';
});

function displayActionLabel(item = {}, fallback = '') {
  const explicit = String(item.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, item.actionKind)) return explicit;

  const entityType = item.entityType || '';
  if ((item.actionKind || 'createEntity') === 'createEntity') {
    return ['Create', entityTypeLabel(entityType), item.status?.to].filter(Boolean).join(' ') || fallback;
  }
  if (item.actionKind === 'changeStatus') {
    return ['Move', entityTypeLabel(entityType), item.status?.to].filter(Boolean).join(' ') || fallback;
  }
  if (item.actionKind === 'updateEntity') {
    return ['Update', entityTypeLabel(entityType)].filter(Boolean).join(' ') || fallback;
  }
  if (item.actionKind === 'runCommand') {
    return ['Run', item.commandId].filter(Boolean).join(' ') || fallback;
  }
  if (item.actionKind === 'sendToOrganization') {
    return ['Send', entityTypeLabel(entityType)].filter(Boolean).join(' ') || fallback;
  }
  return explicit || fallback;
}

function isGenericActionLabel(label, actionKind = '') {
  return new Set(['create', 'status', 'service', 'update', 'send', 'action', actionKind?.toLowerCase?.()].filter(Boolean))
    .has(label.trim().toLowerCase());
}

function entityTypeLabel(entityType = '') {
  return entityType ? entityType.replace(/_/g, ' ') : '';
}
</script>
