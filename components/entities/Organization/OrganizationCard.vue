<template>
  <div :class="[`variant-${variant}`]">
    <EntityCard :entity="organization" entity-type="organization" :variant="variant" :show-trace="false" :show-status="false" footer-display="inline">
      <template #before-identity>
        <Avatar :label="avatarLabel" shape="circle" size="large" />
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag :value="organization.data?.type || $t('common.default')" severity="secondary" size="small" />
          <Tag v-if="organization.identity?.slug" :value="organization.identity.slug" severity="info" size="small" />
          <slot name="context" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="organization.data?.email" class="mt-3 text-sm text-muted-color">{{ organization.data.email }}</div>
      </template>
      <div v-if="$slots.context && variant === 'card'" class="mb-3 flex flex-wrap gap-2">
        <slot name="context" />
      </div>
      <Divider />
      <div class="flex flex-col gap-2">
        <DataBlock entity-type="organization" :entity="organization" :fields="ORGANIZATION_FIELDS" />
        <div v-if="createdAt" class="flex justify-between items-center">
          <small>{{ $t('common.created') }}</small>
          <span>{{ createdAt }}</span>
        </div>
      </div>
      <template v-if="$slots.actions" #footer>
        <Divider />
        <slot name="actions" />
      </template>
    </EntityCard>
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
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const avatarLabel = computed(() => (props.organization.identity?.name || '?').charAt(0));

const ORGANIZATION_FIELDS = resolveEntityDisplayFields({ entityType: 'organization', surface: 'card' });

const createdAt = computed(() => {
    const ts = props.organization.lineage?.createdAt || props.organization.origin?.timestamp;
    return ts ? new Date(ts).toLocaleDateString() : null;
});
</script>
