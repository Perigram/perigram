<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <Chip>
        <Avatar :label="organization.identity?.name?.charAt(0)" shape="circle" size="small" />
        <span>{{ organization.identity?.name }}</span>
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="organization" entity-type="organization" variant="compact" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :label="organization.identity?.name?.charAt(0)" shape="circle" />
                <IdentityBlock :entity="organization" variant="compact" />
            </div>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="organization" entity-type="organization" variant="card" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :label="organization.identity?.name?.charAt(0)" shape="circle" size="large" />
                <IdentityBlock :entity="organization" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ organization.type || 'Standard' }}</small>
        </template>
        <Divider />
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
                <small>{{ $t('organization.type') }}</small>
                <Tag :value="organization.type || '—'" severity="secondary" size="small" />
            </div>
            <div v-if="createdAt" class="flex justify-between items-center">
                <small>{{ $t('common.created') }}</small>
                <span>{{ createdAt }}</span>
            </div>
        </div>
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Organization View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import Avatar from 'primevue/avatar';
import Chip from 'primevue/chip';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const createdAt = computed(() => {
    const ts = props.organization.lineage?.createdAt || props.organization.origin?.timestamp;
    return ts ? new Date(ts).toLocaleDateString() : null;
});
</script>
