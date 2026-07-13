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
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { generatedActionLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  actionId: { type: String, required: true }
});

defineEmits(['execute']);

const authStore = useAuthStore();
const { t, te } = useI18n();
const action = computed(() => authStore.actionManifest.find(item => item.actionId === props.actionId));
const actionLabel = computed(() => generatedActionLabel(action.value || {}, props.actionId, { t, te }));
const actionIcon = computed(() => {
  if (action.value?.actionKind === 'createEntity') return 'pi pi-plus';
  if (action.value?.actionKind === 'mutateEntity') return action.value?.status?.to ? 'pi pi-arrow-right-arrow-left' : 'pi pi-pencil';
  if (action.value?.actionKind === 'sendToOrganization') return 'pi pi-send';
  return 'pi pi-play';
});
</script>
