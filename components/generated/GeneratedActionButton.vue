<template>
  <Button
    v-if="action"
    :label="iconOnly ? undefined : actionLabel"
    :icon="actionIcon"
    size="small"
    severity="secondary"
    :outlined="!iconOnly && !menuItem"
    :rounded="iconOnly"
    :text="iconOnly || menuItem"
    :class="menuItem ? 'w-full justify-start whitespace-normal text-left' : null"
    :aria-label="actionLabel"
    :title="iconOnly ? actionLabel : undefined"
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
  actionId: { type: String, required: true },
  iconOnly: { type: Boolean, default: false },
  menuItem: { type: Boolean, default: false }
});

defineEmits(['execute']);

const authStore = useAuthStore();
const { t, te } = useI18n();
const action = computed(() => authStore.actionManifest.find(item => item.actionId === props.actionId));
const actionLabel = computed(() => generatedActionLabel(action.value || {}, props.actionId, { t, te }));
const actionIcon = computed(() => {
  if (action.value?.actionKind === 'createEntity') return 'pi pi-plus';
  if (action.value?.actionKind === 'updateEntity' && action.value?.status?.to) return 'pi pi-arrow-right-arrow-left';
  if (action.value?.actionKind === 'updateEntity') return 'pi pi-pencil';
  if (action.value?.actionKind === 'sendToOrganization') return 'pi pi-send';
  return 'pi pi-play';
});
</script>
