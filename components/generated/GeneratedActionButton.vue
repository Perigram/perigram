<template>
  <Button
    v-if="action"
    :label="iconOnly ? undefined : actionLabel"
    :icon="actionIcon"
    size="small"
    :severity="actionSeverity"
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
import { useStatePolicy } from '~/composables/useStatePolicy';
import { stateDisplayFor } from '#shared/ui-mapping/index.js';
import { generatedActionLabel } from '~/utils/generated-labels.js';
import {
  isCreateAction,
  isDeleteAction,
  isRelationLinkAction,
  isUpdateAction
} from '~/components/generated/action-visibility.js';

const props = defineProps({
  actionId: { type: String, required: true },
  iconOnly: { type: Boolean, default: false },
  menuItem: { type: Boolean, default: false }
});

defineEmits(['execute']);

const authStore = useAuthStore();
const { t, te } = useI18n();
const { policyByType } = useStatePolicy();
const action = computed(() => authStore.actionManifest.find(item => item.id === props.actionId));
const actionLabel = computed(() => generatedActionLabel(action.value || {}, props.actionId, { t, te }));
// Obvious actions are icon-only by default — delete (trash), create
// (plus), and the plain edit (pencil) carry their meaning in the glyph;
// the localized label stays the tooltip and the accessible name. Menu
// rows and state-transition buttons keep their labels (the caption of a
// transition is the operation, not a glyph).
const iconOnly = computed(() => !props.menuItem
  && (props.iconOnly
    || isDeleteAction(action.value || {})
    || isCreateAction(action.value || {})
    || (isUpdateAction(action.value || {}) && !action.value?.state?.to)));
// A state-mutating update resolves its target state's display through the
// compiled flat vocabulary — the authored policy's icon and severity for
// the state it lands on, not a local heuristic.
const targetStateDisplay = computed(() => {
  const value = action.value || {};
  if (!isUpdateAction(value) || !value.state?.to) return null;
  return stateDisplayFor(policyByType.value[value.typeId] || null, value.state.to);
});
const actionSeverity = computed(() => {
  if (isDeleteAction(action.value || {})) return 'danger';
  return targetStateDisplay.value?.severity || 'secondary';
});
const actionIcon = computed(() => {
  const value = action.value || {};
  if (isRelationLinkAction(value)) return 'pi pi-link';
  if (isCreateAction(value)) return 'pi pi-plus';
  if (value.actionKind === 'archiveEntity') return 'pi pi-box';
  if (isDeleteAction(value)) return 'pi pi-trash';
  if (isUpdateAction(value) && value.state?.to) {
    return targetStateDisplay.value?.icon || 'pi pi-arrow-right-arrow-left';
  }
  if (isUpdateAction(value)) return 'pi pi-pencil';
  if (value.actionKind === 'sendToOrganization') return 'pi pi-send';
  return 'pi pi-play';
});
</script>
