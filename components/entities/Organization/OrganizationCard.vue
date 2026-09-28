<template>
  <div :class="[`variant-${variant}`]">
    <InstanceCard :instance="organization" type-id="organization" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <Avatar :label="avatarLabel" shape="circle" size="large" />
      </template>
      <template #subtitle v-if="variant !== 'card' && (organization.data?.type || $slots.context)">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="organization.data?.type" :value="organization.data.type" severity="secondary" size="small" />
          <slot name="context" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="organization.data?.email" class="mt-3 text-muted text-body">{{ organization.data.email }}</div>
      </template>
      <!-- Avatar-forward popup body: the expanded popover presents the
           directory face (initial avatar, name, type) above the same
           compact fact rows. -->
      <template #expanded>
        <div class="flex items-start gap-4">
          <Avatar :label="avatarLabel" shape="circle" size="xlarge" class="shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            <span class="truncate text-label">{{ organization.identity?.name }}</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <Tag v-if="organization.data?.type" :value="organization.data.type" severity="secondary" size="small" />
              <slot name="context" />
            </div>
          </div>
        </div>
        <DataBlock type-id="organization" :entity="organization" :fields="ORGANIZATION_FIELDS" variant="compact" />
      </template>
      <div v-if="$slots.context && variant === 'card'" class="mb-3 flex flex-wrap gap-2">
        <slot name="context" />
      </div>
      <Divider />
      <div class="flex flex-col gap-2">
        <DataBlock type-id="organization" :entity="organization" :fields="ORGANIZATION_FIELDS" />
        <div v-if="createdAt" class="flex justify-between items-center">
          <small>{{ $t('common.created') }}</small>
          <span>{{ createdAt }}</span>
        </div>
      </div>
      <template v-if="$slots.actions" #footer>
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
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const avatarLabel = computed(() => (props.organization.identity?.name || '?').charAt(0));

const { typeById } = useFileTypeView();
const ORGANIZATION_FIELDS = computed(() => resolveInstanceDisplayFields({ typeId: 'organization', surface: 'card', typeRecord: typeById('organization') }));

const createdAt = computed(() => {
    const ts = props.organization.lineage?.createdAt || props.organization.origin?.timestamp;
    return ts ? new Date(ts).toLocaleDateString() : null;
});
</script>
