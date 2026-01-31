<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <Avatar :label="name.charAt(0)" shape="circle" size="small" />
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card>
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :label="name.charAt(0)" shape="circle" />
                <span class="truncate">{{ name }}</span>
            </div>
        </template>
        <template #subtitle>
            <small>{{ organization.type || 'Standard' }}</small>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :label="name.charAt(0)" shape="circle" size="large" />
                <span class="truncate">{{ name }}</span>
            </div>
        </template>
        <template #subtitle>
            <small>{{ organization.type || 'Standard' }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <small>Billing Status</small>
                    <Tag :value="organization.billing?.status || 'ACTIVE'" severity="info" />
                </div>
                <div class="flex justify-between items-center">
                    <small>Created</small>
                    <span>{{ new Date().toLocaleDateString() }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Organization View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import Avatar from 'primevue/avatar';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.organization);
</script>