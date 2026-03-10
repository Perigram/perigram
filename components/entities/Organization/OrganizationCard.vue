<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <Avatar :label="name?.charAt(0)" shape="circle" size="small" />
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :label="name?.charAt(0)" shape="circle" />
                <IdentityBlock :entity="organization" variant="compact" />
            </div>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :label="name?.charAt(0)" shape="circle" size="large" />
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
                <Tag :value="organization.type || '—'" severity="secondary" />
            </div>
            <div v-if="createdAt" class="flex justify-between items-center">
                <small>{{ $t('common.created') }}</small>
                <span>{{ createdAt }}</span>
            </div>
        </div>
      </StandardCard>
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
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.organization);
const createdAt = computed(() => {
    const ts = props.organization.lineage?.createdAt || props.organization.origin?.timestamp;
    return ts ? new Date(ts).toLocaleDateString() : null;
});
</script>