<template>
  <div :class="[`variant-${variant}`]">
    <InstanceCard :instance="organization" type-id="organization" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity v-if="variant !== 'inline'">
        <Avatar :label="avatarLabel" shape="circle" size="large" />
      </template>
      <template #subtitle v-if="variant === 'compact' && (organization.data?.type || $slots.context)">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="organization.data?.type" :value="organization.data.type" severity="secondary" size="small" />
          <slot name="context" />
        </div>
      </template>
      <template #compact-content v-if="variant === 'compact'">
        <div v-if="organization.data?.email" class="mt-3 text-muted text-body">{{ organization.data.email }}</div>
      </template>
      <template #default v-if="variant === 'card'">
        <div v-if="$slots.context" class="mb-3 flex flex-wrap gap-2">
          <slot name="context" />
        </div>
        <Divider />
        <div class="flex flex-col gap-2">
          <FactRows :rows="organizationRows" />
          <div v-if="createdAt" class="flex justify-between items-center">
            <small>{{ $t('common.created') }}</small>
            <span>{{ createdAt }}</span>
          </div>
        </div>
      </template>
      <template #footer v-if="variant === 'card' && $slots.actions">
        <Divider />
        <slot name="actions" />
      </template>
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Organization View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import { useAuthStore } from '~/stores/auth';
import { useI18n } from 'vue-i18n';
import FactRows from '~/components/shared/FactRows.vue';
import { instanceFactRows } from '~/utils/fact-rows.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const authStore = useAuthStore();

const avatarLabel = computed(() => (props.organization.identity?.name || '?').charAt(0));

const { t, te, locale } = useI18n();
const { typeById } = useFileTypeView();
const organizationRows = computed(() => instanceFactRows({
  typeId: 'organization',
  typeRecord: typeById('organization'),
  entity: props.organization,
  auth: {
    permissions: authStore.activePermissions,
    fieldPolicies: authStore.fieldPolicies,
    stateFieldPolicies: authStore.stateFieldPolicies
  },
  translator: { t, te, locale }
}));

const createdAt = computed(() => {
    const ts = props.organization.lineage?.createdAt || props.organization.origin?.timestamp;
    return ts ? new Date(ts).toLocaleDateString(locale.value) : null;
});
</script>
