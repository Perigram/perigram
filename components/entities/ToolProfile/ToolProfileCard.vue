<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="tool" variant="inline" icon="pi pi-wrench" />
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-wrench"></i>
                    <IdentityBlock :entity="tool" variant="compact" />
                </div>
                <Tag v-if="tool.diameter" :value="`D${tool.diameter}`" severity="secondary" size="small" />
            </div>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="tool" />
                <i class="pi pi-wrench"></i>
            </div>
        </template>
        <Divider />
        <DataBlock :entity="tool" :fields="TOOL_PROFILE_FIELDS" />
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Tool Profile View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { TOOL_PROFILE_FIELDS } from '~/constants/entityFields';

const props = defineProps({
  tool: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
