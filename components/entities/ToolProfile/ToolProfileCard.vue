<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="tool" variant="inline" icon="pi pi-wrench" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="tool" entity-type="tool_profile" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-wrench"></i>
                    <IdentityBlock :entity="tool" variant="compact" />
                </div>
                <Tag v-if="tool.data?.diameter || tool.diameter" :value="`D${tool.data?.diameter || tool.diameter}`" severity="secondary" size="small" />
            </div>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="tool" entity-type="tool_profile" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="tool" />
                <Tag v-if="tool.data?.diameter || tool.diameter" :value="`D${tool.data?.diameter || tool.diameter}`" severity="secondary" size="small" />
            </div>
        </template>
        <Divider />
        <DataBlock :entity="tool" :fields="FIELDS" />
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Tool Profile View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const FIELDS = [
    { path: 'data.diameter', i18n: 'toolProfile.diameter', suffix: ' mm' },
    { path: 'data.angle',    i18n: 'toolProfile.angle',    suffix: '°' },
    { path: 'data.kerf',     i18n: 'toolProfile.kerf',     suffix: ' mm' }
];

const props = defineProps({
  tool: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
